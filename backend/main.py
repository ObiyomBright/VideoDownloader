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

app = FastAPI(title="SnapTube-Grade Engine API", version="3.1.0")

# ----------------------------------------------------------------------
# DIRECTORY & PROXY CONFIGURATION
# ----------------------------------------------------------------------
TEMP_DOWNLOAD_DIR = "/tmp/downloads"
COOKIES_DIR = "./cookies"

os.makedirs(TEMP_DOWNLOAD_DIR, exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)

PROXIES: List[str] = []
proxy_index = 0

# ----------------------------------------------------------------------
# 1. ENGINE AUTO-UPDATER & CRON WEBHOOK HOOK
# ----------------------------------------------------------------------
def update_ytdlp_engine():
    """Updates yt-dlp and curl-cffi dependencies to the latest release to prevent bot blocks."""
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

scheduler = BackgroundScheduler()
scheduler.add_job(update_ytdlp_engine, 'interval', hours=6)

@app.on_event("startup")
def startup_event():
    update_ytdlp_engine()
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()

@app.get("/api/v1/update-engine")
def trigger_cron_update():
    """Dedicated webhook endpoint for your Render cron job to force engine updates on schedule."""
    update_ytdlp_engine()
    return {"status": "success", "message": "Engine update triggered successfully."}

# ----------------------------------------------------------------------
# 2. PROXY ROTATION & COOKIES HELPERS
# ----------------------------------------------------------------------
def get_next_proxy() -> Optional[str]:
    global proxy_index
    if not PROXIES:
        return None
    selected_proxy = PROXIES[proxy_index % len(PROXIES)]
    proxy_index += 1
    return selected_proxy

def get_cookie_file_for_url(url: str) -> Optional[str]:
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
    """Configures yt-dlp with Snaptube-grade bypass options using mweb, android clients and curl-cffi."""
    base_opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'concurrent_fragment_downloads': 5,
        'prefer_ffmpeg': True,
        
        # Snaptube-grade bypass: use mobile web and android clients to avoid web bot challenges
        'extractor_args': {
            'youtube': {
                'player_client': ['mweb', 'android', 'ios', 'tv_embedded'],
                'player_skip': ['web', 'web_embedded'],
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
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
    except Exception as e:
        logger.error(f"Failed to cleanup temp file {filepath}: {e}")

# ----------------------------------------------------------------------
# 3. ENDPOINTS
# ----------------------------------------------------------------------

@app.get("/api/v1/extract/url")
async def extract_info(url: str = Query(..., description="Media platform URL")):
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