import os
import sys
import shutil
import asyncio
import logging
import subprocess
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from apscheduler.schedulers.background import BackgroundScheduler
import yt_dlp
from yt_dlp.utils import DownloadError

# ----------------------------------------------------------------------
# LOGGING SETUP
# ----------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("DownloaderEngine")

# ----------------------------------------------------------------------
# DIRECTORY & CONFIGURATION
# ----------------------------------------------------------------------
TEMP_DOWNLOAD_DIR = "/tmp/downloads"
COOKIES_DIR = "./cookies"
RENDER_SECRETS_DIR = "/etc/secrets"
WRITABLE_COOKIES_DIR = "/tmp/downloads/cookies"

os.makedirs(TEMP_DOWNLOAD_DIR, exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)
os.makedirs(WRITABLE_COOKIES_DIR, exist_ok=True)

PROXIES: List[str] = []
proxy_index = 0

# ----------------------------------------------------------------------
# ENGINE MAINTENANCE & SCHEDULER
# ----------------------------------------------------------------------
def update_ytdlp_engine():
    """Clears engine cache directory on failure to reset invalid playback session tokens."""
    logger.info("🔄 Triggering on-demand engine cache cleanup...")
    try:
        cache_cmd = [sys.executable, "-m", "yt_dlp", "--rm-cache-dir"]
        subprocess.run(cache_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        logger.info("🧹 Engine cache cleared successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to clear cache: {str(e)}")

scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern FastAPI lifespan manager handling startup and shutdown jobs."""
    scheduler.add_job(update_ytdlp_engine, 'interval', hours=24)
    scheduler.start()
    logger.info("🚀 App startup complete. Background scheduler active.")
    yield
    scheduler.shutdown()
    logger.info("🛑 App shutdown complete.")

app = FastAPI(title="SnapTube-Grade Engine API", version="3.5.0", lifespan=lifespan)

# ----------------------------------------------------------------------
# 1. LIGHTWEIGHT HEALTH CHECK
# ----------------------------------------------------------------------
@app.get("/healthz")
async def health_check():
    """Ultra-lightweight ping endpoint to keep Render from spinning down."""
    return {"status": "ok", "engine": "active"}

# ----------------------------------------------------------------------
# 2. ENGINE UPDATE WEBHOOK
# ----------------------------------------------------------------------
@app.get("/api/v1/update-engine")
async def trigger_cron_update():
    """Dedicated webhook endpoint to manually force engine updates on command."""
    await asyncio.to_thread(update_ytdlp_engine)
    return {"status": "success", "message": "Engine update triggered successfully."}

# ----------------------------------------------------------------------
# 3. HELPER FUNCTIONS & OPTIONS
# ----------------------------------------------------------------------
def get_next_proxy() -> Optional[str]:
    global proxy_index
    if not PROXIES:
        return None
    selected_proxy = PROXIES[proxy_index % len(PROXIES)]
    proxy_index += 1
    return selected_proxy

def get_cookie_file_for_url(url: str) -> Optional[str]:
    """
    Checks for Render Secret Files (/etc/secrets/), copies them to a writable
    location (/tmp/downloads/cookies/), and returns the writable file path.
    Prevents yt-dlp [Errno 30] Read-only file system crashes on Render.
    """
    if "youtube.com" in url or "youtu.be" in url:
        filename = "youtube.txt"
    elif "instagram.com" in url:
        filename = "instagram.txt"
    elif "tiktok.com" in url:
        filename = "tiktok.txt"
    else:
        filename = "cookies.txt"

    render_secret_path = os.path.join(RENDER_SECRETS_DIR, filename)
    local_cookie_path = os.path.join(COOKIES_DIR, filename)
    writable_path = os.path.join(WRITABLE_COOKIES_DIR, filename)

    # 1. If Render Secret File exists, sync/copy it to the writable directory
    if os.path.exists(render_secret_path) and os.path.getsize(render_secret_path) > 0:
        try:
            shutil.copyfile(render_secret_path, writable_path)
            logger.info(f"🔑 Copied Render Secret Cookie to Writable Path: {writable_path}")
            return writable_path
        except Exception as e:
            logger.error(f"❌ Failed to copy secret cookie file: {e}")

    # 2. Fall back to local ./cookies/ directory if present
    if os.path.exists(local_cookie_path) and os.path.getsize(local_cookie_path) > 0:
        try:
            shutil.copyfile(local_cookie_path, writable_path)
            logger.info(f"🔑 Copied Local Cookie to Writable Path: {writable_path}")
            return writable_path
        except Exception as e:
            logger.error(f"❌ Failed to copy local cookie file: {e}")

    return None

def build_ytdlp_options(url: str, custom_opts: Optional[dict] = None, tier: str = "primary") -> dict:
    """
    Datacenter-proof YouTube extraction parameters.
    Tier 1 uses 'android_vr' and 'tv_embedded' which do NOT enforce BotGuard/PO Tokens.
    Tier 2 falls back to 'web_creator' and 'mweb' if primary endpoints fail.
    """
    if tier == "fallback":
        player_clients = ['tv_embedded', 'web_creator', 'mweb']
    else:
        player_clients = ['android_vr', 'tv', 'ios', 'mweb']

    base_opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'concurrent_fragment_downloads': 5,
        'prefer_ffmpeg': True,
        'check_formats': False,
        'source_address': '0.0.0.0',  # Force IPv4 binding to prevent datacenter IPv6 blocks
        'extractor_args': {
            'youtube': {
                'player_client': player_clients,
                'skip': ['hls', 'dash']
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    }

    proxy = get_next_proxy()
    if proxy:
        base_opts['proxy'] = proxy

    cookie_file = get_cookie_file_for_url(url)
    if cookie_file:
        base_opts['cookiefile'] = cookie_file

    if custom_opts:
        base_opts.update(custom_opts)

    return base_opts

def remove_temp_file(filepath: str):
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Cleaned temp file: {filepath}")
    except Exception as e:
        logger.error(f"Failed to cleanup temp file {filepath}: {e}")

# ----------------------------------------------------------------------
# SYNCHRONOUS WORKER WRAPPERS WITH DATACENTER RETRY LOGIC
# ----------------------------------------------------------------------
def _sync_extract_info(url: str):
    primary_opts = build_ytdlp_options(url, {'skip_download': True}, tier="primary")
    try:
        with yt_dlp.YoutubeDL(primary_opts) as ytdl:
            return ytdl.extract_info(url, download=False)
    except Exception as first_err:
        logger.warning(f"⚠️ Primary client extraction blocked on datacenter for {url}. Attempting fallback client chain... Error: {first_err}")
        update_ytdlp_engine()
        fallback_opts = build_ytdlp_options(url, {'skip_download': True}, tier="fallback")
        with yt_dlp.YoutubeDL(fallback_opts) as ytdl:
            return ytdl.extract_info(url, download=False)

def _sync_download_media(url: str, custom_download_opts: dict):
    primary_opts = build_ytdlp_options(url, custom_download_opts, tier="primary")
    try:
        with yt_dlp.YoutubeDL(primary_opts) as ytdl:
            info = ytdl.extract_info(url, download=True)
            return ytdl.prepare_filename(info)
    except Exception as first_err:
        logger.warning(f"⚠️ Primary download blocked on datacenter for {url}. Switching to fallback engine... Error: {first_err}")
        update_ytdlp_engine()
        fallback_opts = build_ytdlp_options(url, custom_download_opts, tier="fallback")
        with yt_dlp.YoutubeDL(fallback_opts) as ytdl:
            info = ytdl.extract_info(url, download=True)
            return ytdl.prepare_filename(info)

# ----------------------------------------------------------------------
# 4. ENDPOINTS
# ----------------------------------------------------------------------

@app.get("/api/v1/extract/url")
async def extract_info(url: str = Query(..., description="Media platform URL")):
    try:
        info = await asyncio.to_thread(_sync_extract_info, url)

        formats = []
        if 'formats' in info and isinstance(info['formats'], list):
            for f in info['formats']:
                if f.get('vcodec') != 'none' or f.get('acodec') != 'none':
                    filesize = f.get('filesize') or f.get('filesize_approx')
                    quality_label = f.get('format_note') or f.get('resolution') or (f"{f.get('height')}p" if f.get('height') else f.get('height'))
                    formats.append({
                        'format_id': f.get('format_id'),
                        'quality': quality_label,
                        'ext': f.get('ext'),
                        'vcodec': f.get('vcodec'),
                        'filesize_str': f"{round(filesize / (1024*1024), 2)} MB" if filesize else None,
                        'direct_url': f.get('url'),
                    })

        return JSONResponse({
            "title": info.get('title', 'Media Video'),
            "duration": info.get('duration', 0),
            "thumbnail": info.get('thumbnail'),
            "uploader": info.get('uploader') or info.get('extractor_key'),
            "platform": info.get('extractor_key'),
            "original_platform_url": url,
            "available_qualities": formats[-10:],
            "direct_url": info.get('url'),
        })

    except Exception as e:
        err_msg = str(e).strip() or repr(e) or "Unknown extraction failure"
        logger.error(f"Extraction error on {url}: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Failed to parse media link: {err_msg}")


@app.get("/api/v1/download")
async def download_media(
    background_tasks: BackgroundTasks,
    url: str = Query(...),
    quality: str = Query("best"),
    audio_only: bool = Query(False)
):
    output_template = os.path.join(TEMP_DOWNLOAD_DIR, '%(id)s_%(title).30s.%(ext)s')

    if audio_only:
        format_selector = 'bestaudio/best'
        post_processors = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}]
        ext = 'mp3'
    else:
        target_height = quality.replace("p", "") if "p" in quality and quality.replace("p", "").isdigit() else "1080"
        format_selector = f'bestvideo[height<={target_height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={target_height}]+bestaudio/best[ext=mp4]/best'
        post_processors = []
        ext = 'mp4'

    download_custom_opts = {
        'outtmpl': output_template,
        'format': format_selector,
        'merge_output_format': 'mp4' if not audio_only else None,
        'postprocessors': post_processors,
    }

    try:
        raw_filename = await asyncio.to_thread(_sync_download_media, url, download_custom_opts)

        base_path = os.path.splitext(raw_filename)[0]
        final_filename = f"{base_path}.{ext}"

        if not os.path.exists(final_filename):
            if os.path.exists(raw_filename):
                final_filename = raw_filename
            else:
                raise FileNotFoundError("Processed output file missing on server.")

        background_tasks.add_task(remove_temp_file, final_filename)

        return FileResponse(
            path=final_filename,
            filename=os.path.basename(final_filename),
            media_type="audio/mpeg" if audio_only else "video/mp4"
        )

    except Exception as e:
        err_msg = str(e).strip() or repr(e) or "Unknown download failure"
        logger.error(f"Download processing error: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Download execution failed: {err_msg}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)