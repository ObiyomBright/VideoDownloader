import os
import sys
import shutil
import asyncio
import logging
import subprocess
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from apscheduler.schedulers.background import BackgroundScheduler
import yt_dlp

# ----------------------------------------------------------------------
# LOGGING SETUP
# ----------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("DownloaderEngine")

app = FastAPI(title="SnapTube-Grade Engine API", version="3.0.0")

# ----------------------------------------------------------------------
# DIRECTORY & PROXY INLINE CONFIGURATION
# ----------------------------------------------------------------------
TEMP_DOWNLOAD_DIR = "/tmp/downloads"
COOKIES_DIR = "./cookies"

os.makedirs(TEMP_DOWNLOAD_DIR, exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)

# Add your rotating proxy URLs directly into this list if using paid proxy providers
# Example format: ["http://user:pass@proxy1.com:8080", "http://user:pass@proxy2.com:8080"]
PROXIES: List[str] = []
proxy_index = 0

# ----------------------------------------------------------------------
# 1. AUTOMATIC BACKGROUND AUTO-UPDATER (Runs Every 6 Hours)
# ----------------------------------------------------------------------
def update_ytdlp_engine():
    """Runs in background to ensure yt-dlp stays ahead of site changes."""
    logger.info("🔄 Checking and updating yt-dlp engine to latest release...")
    try:
        cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp[default,curl-cffi]"]
        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if process.returncode == 0:
            logger.info("✅ yt-dlp auto-update completed successfully.")
        else:
            logger.error(f"⚠️ Update issue: {process.stderr}")
    except Exception as e:
        logger.error(f"❌ Failed to run auto-update: {str(e)}")

# Initialize APScheduler
scheduler = BackgroundScheduler()
scheduler.add_job(update_ytdlp_engine, 'interval', hours=6)

@app.on_event("startup")
def startup_event():
    # Execute update on app launch
    update_ytdlp_engine()
    # Start scheduler background thread
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()

# ----------------------------------------------------------------------
# 2. INLINE HELPERS: PROXY ROTATION & COOKIES
# ----------------------------------------------------------------------
def get_next_proxy() -> Optional[str]:
    """Rotates through list of available proxies on each download request."""
    global proxy_index
    if not PROXIES:
        return None
    selected_proxy = PROXIES[proxy_index % len(PROXIES)]
    proxy_index += 1
    return selected_proxy

def get_cookie_file_for_url(url: str) -> Optional[str]:
    """Dynamically resolves domain-specific cookie files in ./cookies folder."""
    if "youtube.com" in url or "youtu.be" in url:
        cookie_path = os.path.join(COOKIES_DIR, "youtube.txt")
    elif "instagram.com" in url:
        cookie_path = os.path.join(COOKIES_DIR, "instagram.txt")
    elif "tiktok.com" in url:
        cookie_path = os.path.join(COOKIES_DIR, "tiktok.txt")
    else:
        cookie_path = os.path.join(COOKIES_DIR, "cookies.txt")

    if os.path.exists(cookie_path) and os.path.getsize(cookie_path) > 0:
        return cookie_path
    return None

def build_ytdlp_options(url: str, custom_opts: dict = None) -> dict:
    """Configures yt-dlp with client fallback strategies, cookies, and proxies."""
    base_opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'concurrent_fragment_downloads': 5,
        'prefer_ffmpeg': True,
        
        # Youtube Client fallbacks to bypass bot blocks
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'web'],
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    }

    # Attach proxy if defined
    proxy = get_next_proxy()
    if proxy:
        base_opts['proxy'] = proxy

    # Inject domain cookies if available
    cookie_file = get_cookie_file_for_url(url)
    if cookie_file:
        base_opts['cookiefile'] = cookie_file

    if custom_opts:
        base_opts.update(custom_opts)

    return base_opts

def remove_temp_file(filepath: str):
    """Deletes temporary files after the client finishes downloading."""
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception as e:
        logger.error(f"Failed to cleanup temp file {filepath}: {e}")

# ----------------------------------------------------------------------
# 3. ENDPOINTS
# ----------------------------------------------------------------------

@app.get("/api/v1/extract/url")
async def extract_info(url: str = Query(..., description="Media platform URL")):
    """Extracts platform metadata, available resolutions, and direct stream links."""
    opts = build_ytdlp_options(url, {'skip_download': True})

    try:
        with yt_dlp.YoutubeDL(opts) as ytdl:
            info = ytdl.extract_info(url, download=False)

            formats = []
            if 'formats' in info:
                for f in info['formats']:
                    if f.get('vcodec') != 'none' or f.get('acodec') != 'none':
                        formats.append({
                            'format_id': f.get('format_id'),
                            'quality': f.get('format_note') or f.get('resolution') or f.get('height'),
                            'ext': f.get('ext'),
                            'filesize_str': f"{round(f['filesize'] / (1024*1024), 2)} MB" if f.get('filesize') else None,
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
        logger.error(f"Extraction error on {url}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse media link: {str(e)}")


@app.get("/api/v1/download")
async def download_media(
    background_tasks: BackgroundTasks,
    url: str = Query(...),
    quality: str = Query("best"),
    audio_only: bool = Query(False)
):
    """Downloads media, processes formats via FFmpeg, and streams MP4/MP3 to client."""
    output_template = os.path.join(TEMP_DOWNLOAD_DIR, '%(id)s_%(title).30s.%(ext)s')

    if audio_only:
        format_selector = 'bestaudio/best'
        post_processors = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}]
        ext = 'mp3'
    else:
        target_height = quality.replace("p", "") if "p" in quality else "1080"
        format_selector = f'bestvideo[height<={target_height}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        post_processors = []
        ext = 'mp4'

    opts = build_ytdlp_options(url, {
        'outtmpl': output_template,
        'format': format_selector,
        'merge_output_format': 'mp4' if not audio_only else None,
        'postprocessors': post_processors,
    })

    try:
        with yt_dlp.YoutubeDL(opts) as ytdl:
            info = ytdl.extract_info(url, download=True)
            raw_filename = ytdl.prepare_filename(info)

            base_path = os.path.splitext(raw_filename)[0]
            final_filename = f"{base_path}.{ext}"

            if not os.path.exists(final_filename):
                if os.path.exists(raw_filename):
                    final_filename = raw_filename
                else:
                    raise FileNotFoundError("Processed output file missing on server.")

        # Clean up temporary file after response streaming completes
        background_tasks.add_task(remove_temp_file, final_filename)

        return FileResponse(
            path=final_filename,
            filename=os.path.basename(final_filename),
            media_type="audio/mpeg" if audio_only else "video/mp4"
        )

    except Exception as e:
        logger.error(f"Download processing error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Download execution failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)