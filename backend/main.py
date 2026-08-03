import os
import sys
import uuid
import shutil
import asyncio
import logging
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
# 0. AUTOMATIC FFMPEG BINDING & LOGGING
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
# 1. ENVIRONMENT & PROXY CONFIGURATION
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

DEFAULT_SCRAPER_API_KEY = "ee6481adddd9f7163ef8224badf1a3d2"
RAW_PROXY_URL = os.getenv("PROXY_URL") or f"http://scraperapi:{DEFAULT_SCRAPER_API_KEY}@proxy-server.scraperapi.com:8001"

# ----------------------------------------------------------------------
# 2. ENGINE MAINTENANCE & SCHEDULER
# ----------------------------------------------------------------------
def update_ytdlp_engine():
    """Clears yt-dlp cache directory to prevent stale player JS tokens."""
    logger.info("🔄 Triggering on-demand engine cache cleanup...")
    try:
        import subprocess
        cache_cmd = [sys.executable, "-m", "yt_dlp", "--rm-cache-dir"]
        subprocess.run(cache_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        logger.info("🧹 Engine cache cleared successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to clear cache: {str(e)}")

scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(update_ytdlp_engine, 'interval', hours=24)
    scheduler.start()
    logger.info("🚀 App startup complete. Background scheduler active.")
    yield
    scheduler.shutdown()
    logger.info("🛑 App shutdown complete.")

app = FastAPI(
    title="Snaptube-Grade Engine API", 
    version="4.4.0", 
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
# 3. HELPER FUNCTIONS & COOKIE HANDLERS
# ----------------------------------------------------------------------
def sanitize_and_write_cookies(src_path: str, dst_path: str) -> bool:
    try:
        with open(src_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        valid_lines = [
            line.strip() for line in lines 
            if line.strip() and (line.strip().startswith("#") or len(line.strip().split("\t")) == 7)
        ]

        if valid_lines:
            with open(dst_path, "w", encoding="utf-8") as f:
                f.write("\n".join(valid_lines) + "\n")
            return True
        return False
    except Exception as e:
        logger.error(f"❌ Failed to sanitize cookie file {src_path}: {e}")
        return False

def get_cookie_file_for_url(url: str) -> Optional[str]:
    if "youtube.com" in url or "youtu.be" in url:
        return None
    elif "instagram.com" in url:
        filename = "instagram.txt"
    elif "tiktok.com" in url:
        filename = "tiktok.txt"
    else:
        filename = "cookies.txt"

    writable_path = os.path.join(WRITABLE_COOKIES_DIR, filename)

    for search_dir in [RENDER_SECRETS_DIR, COOKIES_DIR, str(BASE_DIR)]:
        candidate = os.path.join(search_dir, filename if search_dir != str(BASE_DIR) else "cookies.txt")
        if os.path.exists(candidate) and os.path.getsize(candidate) > 0:
            if sanitize_and_write_cookies(candidate, writable_path):
                return writable_path

    return None

def build_bulletproof_options(
    url: str, 
    client_tier: str = "web_creator", 
    use_proxy: bool = True,
    custom_opts: Optional[dict] = None
) -> dict:
    is_youtube = "youtube.com" in url or "youtu.be" in url

    # Map client tiers to resilient player configurations
    if client_tier == "web_creator":
        clients = ['web_creator', 'web']
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    elif client_tier == "android":
        clients = ['android', 'android_embedded']
        user_agent = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'
    elif client_tier == "ios":
        clients = ['ios', 'mweb']
        user_agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    else:
        clients = ['web_creator', 'android']
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'

    opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'concurrent_fragment_downloads': 5,
        'prefer_ffmpeg': True,
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'hls_use_mpegts': True,
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
        'http_headers': {
            'User-Agent': user_agent,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'navigate',
        },
    }

    if use_proxy:
        opts['proxy'] = RAW_PROXY_URL

    if is_youtube:
        opts['extractor_args'] = {
            'youtube': {
                'player_client': clients,
                'player_skip': ['js', 'configs'],
            }
        }

    if custom_opts:
        opts.update(custom_opts)

    return opts

def remove_temp_directory(dirpath: str):
    try:
        if os.path.exists(dirpath):
            shutil.rmtree(dirpath)
            logger.info(f"Cleaned task directory: {dirpath}")
    except Exception as e:
        logger.error(f"Failed to cleanup directory {dirpath}: {e}")

# ----------------------------------------------------------------------
# 4. WORKER EXECUTORS WITH MULTI-TIER FALLBACKS
# ----------------------------------------------------------------------
def _sync_extract_info(url: str):
    strategies = [
        ("web_creator", True),
        ("android", True),
        ("ios", True),
        ("web_creator", False),
    ]
    
    last_err = None

    for tier, use_proxy in strategies:
        try:
            logger.info(f"🔄 Extraction strategy: tier=[{tier}], proxy=[{use_proxy}]")
            opts = build_bulletproof_options(
                url, 
                client_tier=tier, 
                use_proxy=use_proxy, 
                custom_opts={'skip_download': True}
            )
            with yt_dlp.YoutubeDL(opts) as ytdl:
                info = ytdl.extract_info(url, download=False)
                if info and ('formats' in info or 'url' in info):
                    logger.info(f"✅ Extraction succeeded with tier [{tier}].")
                    return info
        except Exception as err:
            logger.warning(f"⚠️ Strategy tier [{tier}] extraction failed: {err}")
            last_err = err

    raise RuntimeError(f"All extraction strategies failed. Last error: {last_err}")

def _sync_download_media(url: str, custom_download_opts: dict):
    # Downloads try with and without proxy to avoid HTTP connection timeouts on googlevideo CDN
    strategies = [
        ("web_creator", False),
        ("android", False),
        ("ios", False),
        ("web_creator", True),
    ]
    
    last_err = None

    for tier, use_proxy in strategies:
        try:
            logger.info(f"🔄 Download strategy: tier=[{tier}], proxy=[{use_proxy}]")
            opts = build_bulletproof_options(
                url, 
                client_tier=tier, 
                use_proxy=use_proxy, 
                custom_opts=custom_download_opts
            )
            with yt_dlp.YoutubeDL(opts) as ytdl:
                info = ytdl.extract_info(url, download=True)
                return ytdl.prepare_filename(info)
        except Exception as err:
            logger.warning(f"⚠️ Strategy tier [{tier}] download failed: {err}")
            last_err = err

    raise RuntimeError(f"All download strategies failed. Last error: {last_err}")

# ----------------------------------------------------------------------
# 5. ENDPOINTS
# ----------------------------------------------------------------------
@app.get("/")
@app.head("/")
async def root():
    return {
        "status": "online", 
        "message": "Snaptube-Grade Video Downloader Engine API is running.",
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
                f'best[height<={target_height}]/'
                f'bestvideo[height<={target_height}]+bestaudio/'
                f'b/best'
            )
        else:
            format_selector = 'best/b/bestvideo+bestaudio'
            
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
            logger.warning("⚠️ High quality format download failed. Attempting fallback single-stream download...")
            fallback_opts = dict(download_custom_opts)
            fallback_opts['format'] = 'b/best'
            raw_filename = await asyncio.to_thread(_sync_download_media, url, fallback_opts)

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
# 6. APPLICATION ENTRYPOINT
# ----------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 10000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)