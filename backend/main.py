import os
import sys
import uuid
import shutil
import asyncio
import logging
import tempfile
import subprocess
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
import yt_dlp
import imageio_ffmpeg

# ----------------------------------------------------------------------
# 0. AUTOMATIC FFMPEG BINDING
# ----------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("DownloaderEngine")

try:
    ffmpeg_executable = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(ffmpeg_executable)
    os.environ["PATH"] = ffmpeg_dir + os.path.pathsep + os.environ.get("PATH", "")
    logger.info(f"✅ FFmpeg path configured automatically via imageio-ffmpeg: {ffmpeg_executable}")
except Exception as ffmpeg_err:
    logger.warning(f"⚠️ Could not automatically expose FFmpeg via imageio-ffmpeg: {ffmpeg_err}")

# ----------------------------------------------------------------------
# 1. LOGGING & ENVIRONMENT SETUP
# ----------------------------------------------------------------------
IS_RENDER = os.getenv("RENDER", "false").lower() == "true" or "RENDER" in os.environ

BASE_DIR = Path(__file__).resolve().parent
TEMP_DOWNLOAD_DIR = "/tmp/downloads"
COOKIES_DIR = str(BASE_DIR / "cookies")
RENDER_SECRETS_DIR = "/etc/secrets"
WRITABLE_COOKIES_DIR = "/tmp/downloads/cookies"

os.makedirs(TEMP_DOWNLOAD_DIR, exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)
os.makedirs(WRITABLE_COOKIES_DIR, exist_ok=True)

PROXIES: List[str] = []
proxy_index = 0

# ----------------------------------------------------------------------
# 2. ENGINE MAINTENANCE & SCHEDULER
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

app = FastAPI(
    title="SnapTube-Grade Engine API", 
    version="3.6.1", 
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------
# 3. HELPER FUNCTIONS & COOKIE SANITIZATION
# ----------------------------------------------------------------------
def sanitize_and_write_cookies(src_path: str, dst_path: str) -> bool:
    try:
        with open(src_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        valid_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                valid_lines.append(stripped)
                continue

            parts = stripped.split("\t")
            if len(parts) == 7:
                valid_lines.append(stripped)

        if valid_lines:
            sanitized_content = "\n".join(valid_lines) + "\n"
            with open(dst_path, "w", encoding="utf-8") as f:
                f.write(sanitized_content)
            return True
        else:
            logger.warning(f"⚠️ Cookie file at {src_path} had no valid Netscape entries.")
            return False
    except Exception as e:
        logger.error(f"❌ Failed to sanitize cookie file {src_path}: {e}")
        return False

def get_cookie_file_for_url(url: str) -> Optional[str]:
    if "youtube.com" in url or "youtu.be" in url:
        filename = "youtube.txt"
    elif "instagram.com" in url:
        filename = "instagram.txt"
    elif "tiktok.com" in url:
        filename = "tiktok.txt"
    else:
        filename = "cookies.txt"

    writable_path = os.path.join(WRITABLE_COOKIES_DIR, filename)

    cookie_env = os.getenv("YOUTUBE_COOKIES_TEXT") or os.getenv("RENDER_SECRET_COOKIE")
    if cookie_env and ("youtube" in filename or "cookies" in filename):
        try:
            cleaned_content = cookie_env.replace("\\n", "\n")
            with open(writable_path, "w", encoding="utf-8") as f:
                f.write(cleaned_content)
            return writable_path
        except Exception as e:
            logger.error(f"Failed writing cookie environment variable: {e}")

    render_secret_path = os.path.join(RENDER_SECRETS_DIR, filename)
    if os.path.exists(render_secret_path) and os.path.getsize(render_secret_path) > 0:
        if sanitize_and_write_cookies(render_secret_path, writable_path):
            logger.info(f"🔑 Cleaned & Copied Render Secret Cookie to: {writable_path}")
            return writable_path

    local_cookie_path = os.path.join(COOKIES_DIR, filename)
    root_cookie_path = str(BASE_DIR / "cookies.txt")

    if os.path.exists(local_cookie_path) and os.path.getsize(local_cookie_path) > 0:
        if sanitize_and_write_cookies(local_cookie_path, writable_path):
            logger.info(f"🔑 Cleaned & Copied Local Cookie to: {writable_path}")
            return writable_path
    elif os.path.exists(root_cookie_path) and os.path.getsize(root_cookie_path) > 0:
        if sanitize_and_write_cookies(root_cookie_path, writable_path):
            logger.info(f"🔑 Cleaned & Copied Root Cookie to: {writable_path}")
            return writable_path

    return None

def get_next_proxy() -> Optional[str]:
    global proxy_index
    if not PROXIES:
        return None
    selected_proxy = PROXIES[proxy_index % len(PROXIES)]
    proxy_index += 1
    return selected_proxy

def build_ytdlp_options(url: str, custom_opts: Optional[dict] = None, tier: str = "primary") -> dict:
    if tier == "fallback":
        player_clients = ['ios', 'mweb', 'tv_embedded', 'android']
    else:
        player_clients = ['ios', 'android', 'mweb', 'web']

    base_opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'concurrent_fragment_downloads': 5,
        'prefer_ffmpeg': True,
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'hls_use_mpegts': True,
        'extractor_args': {
            'youtube': {
                'player_client': player_clients,
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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

def remove_temp_directory(dirpath: str):
    try:
        if os.path.exists(dirpath):
            shutil.rmtree(dirpath)
            logger.info(f"Cleaned task directory: {dirpath}")
    except Exception as e:
        logger.error(f"Failed to cleanup directory {dirpath}: {e}")

# ----------------------------------------------------------------------
# 4. SYNCHRONOUS WORKER WRAPPERS WITH RETRY LOGIC
# ----------------------------------------------------------------------
def _sync_extract_info(url: str):
    primary_opts = build_ytdlp_options(url, {'skip_download': True}, tier="primary")
    try:
        with yt_dlp.YoutubeDL(primary_opts) as ytdl:
            return ytdl.extract_info(url, download=False)
    except Exception as first_err:
        logger.warning(f"⚠️ Primary client extraction failed for {url}. Attempting fallback... Error: {first_err}")
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
        logger.warning(f"⚠️ Primary download failed for {url}. Switching to fallback engine... Error: {first_err}")
        update_ytdlp_engine()
        fallback_opts = build_ytdlp_options(url, custom_download_opts, tier="fallback")
        with yt_dlp.YoutubeDL(fallback_opts) as ytdl:
            info = ytdl.extract_info(url, download=True)
            return ytdl.prepare_filename(info)

# ----------------------------------------------------------------------
# 5. ROOT & HEALTH CHECK ENDPOINTS
# ----------------------------------------------------------------------
@app.get("/")
@app.head("/")
async def root():
    return {
        "status": "online", 
        "message": "Video Downloader Engine API is running.",
        "environment": "Render" if IS_RENDER else "Local"
    }

@app.get("/healthz")
@app.head("/healthz")
async def health_check():
    return {"status": "ok", "engine": "active"}

@app.get("/api/v1/update-engine")
async def trigger_cron_update():
    await asyncio.to_thread(update_ytdlp_engine)
    return {"status": "success", "message": "Engine update triggered successfully."}

# ----------------------------------------------------------------------
# 6. CORE EXTRACTION AND DOWNLOAD API ENDPOINTS
# ----------------------------------------------------------------------
@app.get("/api/v1/extract/url")
async def extract_info(url: str = Query(..., description="Media platform URL")):
    try:
        info = await asyncio.to_thread(_sync_extract_info, url)

        formats = []
        if 'formats' in info and isinstance(info['formats'], list):
            for f in info['formats']:
                vcodec = f.get('vcodec', 'none')
                acodec = f.get('acodec', 'none')
                if vcodec != 'none' or acodec != 'none':
                    filesize = f.get('filesize') or f.get('filesize_approx')
                    height = f.get('height')
                    quality_label = (
                        f.get('format_note') or
                        f.get('resolution') or
                        (f"{height}p" if height else "Audio/Video")
                    )
                    formats.append({
                        'format_id': f.get('format_id'),
                        'quality': quality_label,
                        'ext': f.get('ext'),
                        'vcodec': vcodec,
                        'acodec': acodec,
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
            "available_qualities": formats[-15:] if formats else [],
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
    task_id = str(uuid.uuid4())
    task_dir = os.path.join(TEMP_DOWNLOAD_DIR, task_id)
    os.makedirs(task_dir, exist_ok=True)

    output_template = os.path.join(task_dir, '%(id)s_%(title).30s.%(ext)s')

    if audio_only:
        format_selector = 'bestaudio/best'
        post_processors = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}]
        ext = 'mp3'
    else:
        target_height = quality.replace("p", "") if "p" in quality and quality.replace("p", "").isdigit() else None
        
        if target_height:
            format_selector = (
                f'bestvideo[height<={target_height}][ext=mp4]+bestaudio[ext=m4a]/'
                f'bestvideo[height<={target_height}]+bestaudio/'
                f'best[height<={target_height}]/'
                f'best'
            )
        else:
            format_selector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
            
        post_processors = []
        ext = 'mp4'

    download_custom_opts = {
        'outtmpl': output_template,
        'format': format_selector,
        'merge_output_format': 'mp4' if not audio_only else None,
        'postprocessors': post_processors,
    }

    try:
        try:
            raw_filename = await asyncio.to_thread(_sync_download_media, url, download_custom_opts)
        except Exception as primary_err:
            if "Requested format is not available" in str(primary_err):
                logger.warning(f"⚠️ Requested quality unavailable for {url}. Falling back to best stream...")
                fallback_opts = dict(download_custom_opts)
                fallback_opts['format'] = 'best'
                raw_filename = await asyncio.to_thread(_sync_download_media, url, fallback_opts)
            else:
                raise primary_err

        base_path = os.path.splitext(raw_filename)[0]
        final_filename = f"{base_path}.{ext}"

        if not os.path.exists(final_filename):
            if os.path.exists(raw_filename):
                final_filename = raw_filename
            else:
                matched_files = [
                    os.path.join(task_dir, f)
                    for f in os.listdir(task_dir)
                    if not f.endswith('.part') and not f.endswith('.ytdl')
                ]
                if matched_files:
                    final_filename = matched_files[0]
                else:
                    raise FileNotFoundError("Processed output file missing on server.")

        background_tasks.add_task(remove_temp_directory, task_dir)

        return FileResponse(
            path=final_filename,
            filename=os.path.basename(final_filename),
            media_type="audio/mpeg" if audio_only else "video/mp4"
        )

    except Exception as e:
        background_tasks.add_task(remove_temp_directory, task_dir)
        err_msg = str(e).strip() or repr(e) or "Unknown download failure"
        logger.error(f"Download processing error: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Download execution failed: {err_msg}")


# ----------------------------------------------------------------------
# 7. APPLICATION ENTRYPOINT
# ----------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)