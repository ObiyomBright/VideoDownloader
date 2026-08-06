import os
import uuid
import shutil
import asyncio
import logging
import ipaddress
import socket
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
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

RAW_PROXY_URL = os.getenv("PROXY_URL")
MAX_CONCURRENT_JOBS = max(1, int(os.getenv("MAX_CONCURRENT_JOBS", "2")))
job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

# PO token values must include their yt-dlp client and context, for example
# "mweb.gvs+TOKEN". Multiple values can be comma-separated.
ENV_PO_TOKEN_SPEC = os.getenv("YOUTUBE_PO_TOKEN_SPEC") or os.getenv("YOUTUBE_PO_TOKEN")
ENV_VISITOR_DATA = os.getenv("YOUTUBE_VISITOR_DATA")

# ----------------------------------------------------------------------
# 2. APPLICATION LIFECYCLE
# ----------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("App startup complete; accepting %s concurrent jobs.", MAX_CONCURRENT_JOBS)
    yield
    logger.info("App shutdown complete.")

app = FastAPI(
    title="Video Downloader API",
    version="5.1.0", 
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------
# 3. HELPER FUNCTIONS & COOKIE HANDLERS
# ----------------------------------------------------------------------
def validate_public_url(raw_url: str) -> str:
    if not raw_url or len(raw_url) > 2048:
        raise ValueError("A valid media URL is required.")

    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only public http and https URLs are supported.")
    if parsed.username or parsed.password:
        raise ValueError("URLs containing credentials are not supported.")

    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("The media host could not be resolved.") from exc

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Private and local network URLs are not supported.")

    return raw_url.strip()

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
        filename = "youtube.txt"
    elif "instagram.com" in url:
        filename = "instagram.txt"
    elif "tiktok.com" in url:
        filename = "tiktok.txt"
    else:
        filename = "cookies.txt"

    writable_path = os.path.join(WRITABLE_COOKIES_DIR, filename)

    # Priority 1: Environment variable contents
    cookie_env = os.getenv("YOUTUBE_COOKIES_TEXT") or os.getenv("RENDER_SECRET_COOKIE")
    if cookie_env and ("youtube" in filename or "cookies" in filename):
        try:
            cleaned_content = cookie_env.replace("\\n", "\n")
            with open(writable_path, "w", encoding="utf-8") as f:
                f.write(cleaned_content)
            return writable_path
        except Exception as e:
            logger.error(f"Failed writing cookie environment variable: {e}")

    # Priority 2: Disk secret files
    for search_dir in [RENDER_SECRETS_DIR, COOKIES_DIR, str(BASE_DIR)]:
        candidate = os.path.join(search_dir, filename if search_dir != str(BASE_DIR) else "cookies.txt")
        if os.path.exists(candidate) and os.path.getsize(candidate) > 0:
            if sanitize_and_write_cookies(candidate, writable_path):
                return writable_path

    return None

def build_ytdlp_options(
    url: str,
    use_proxy: bool = True,
    custom_opts: Optional[dict] = None
) -> dict:
    is_youtube = "youtube.com" in url or "youtu.be" in url

    opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'concurrent_fragment_downloads': 3,
        'prefer_ffmpeg': True,
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'hls_use_mpegts': True,
        'socket_timeout': 60,
        'retries': 10,
        'fragment_retries': 10,
        'max_filesize': 500 * 1024 * 1024,   # 500MB safety cap for RAM protection
        'http_chunk_size': 10 * 1024 * 1024, # 10MB chunking keeps TCP sockets active
        'noplaylist': True,
    }

    cookie_file = get_cookie_file_for_url(url)
    if cookie_file:
        opts['cookiefile'] = cookie_file
        logger.info(f"🍪 Using cookie file: {cookie_file}")

    if use_proxy and RAW_PROXY_URL:
        opts['proxy'] = RAW_PROXY_URL

    if is_youtube:
        youtube_args = {}

        if ENV_PO_TOKEN_SPEC:
            token_specs = [
                value.strip()
                for value in ENV_PO_TOKEN_SPEC.split(',')
                if value.strip()
            ]
            valid_specs = [
                value for value in token_specs
                if '+' in value and '.' in value.partition('+')[0]
            ]
            if len(valid_specs) == len(token_specs):
                youtube_args['po_token'] = valid_specs
                logger.info("Using %s explicitly qualified YouTube PO token(s).", len(valid_specs))
            else:
                logger.warning(
                    "Ignoring YOUTUBE_PO_TOKEN_SPEC: each value must use CLIENT.CONTEXT+TOKEN syntax."
                )

        if ENV_VISITOR_DATA:
            youtube_args['visitor_data'] = [ENV_VISITOR_DATA]

        if youtube_args:
            opts['extractor_args'] = {'youtube': youtube_args}

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
# 4. WORKER EXECUTORS WITH NETWORK FALLBACKS
# ----------------------------------------------------------------------
def _sync_extract_info(url: str):
    strategies = [("direct", False)]
    if RAW_PROXY_URL:
        strategies.insert(0, ("proxy", True))
    
    last_err = None

    for strategy, use_proxy in strategies:
        try:
            logger.info("Extraction strategy: %s", strategy)
            opts = build_ytdlp_options(
                url,
                use_proxy=use_proxy,
                custom_opts={'skip_download': True}
            )
            with yt_dlp.YoutubeDL(opts) as ytdl:
                info = ytdl.extract_info(url, download=False)
                if info and ('formats' in info or 'url' in info):
                    logger.info("Extraction succeeded using %s.", strategy)
                    return info
        except Exception as err:
            logger.warning("Extraction strategy %s failed: %s", strategy, err)
            last_err = err

    raise RuntimeError(f"All extraction strategies failed. Last error: {last_err}")

def _sync_download_media(url: str, task_dir: str, custom_download_opts: dict) -> str:
    # Falls back from proxy to direct IP if proxy stream socket times out
    strategies = [("direct", False)]
    if RAW_PROXY_URL:
        strategies.insert(0, ("proxy", True))
    
    last_err = None

    for strategy, use_proxy in strategies:
        try:
            logger.info("Download strategy: %s", strategy)
            opts = build_ytdlp_options(
                url,
                use_proxy=use_proxy,
                custom_opts=custom_download_opts
            )
            with yt_dlp.YoutubeDL(opts) as ytdl:
                ytdl.extract_info(url, download=True)
                
            downloaded_files = [
                os.path.join(task_dir, f) for f in os.listdir(task_dir)
                if not f.endswith('.part') and not f.endswith('.ytdl')
            ]
            
            if downloaded_files:
                return max(downloaded_files, key=os.path.getsize)
                
        except Exception as err:
            logger.warning("Download strategy %s failed: %s", strategy, err)
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
        "message": "Video Downloader API is running.",
        "environment": "Render" if IS_RENDER else "Local"
    }

@app.get("/healthz")
@app.head("/healthz")
async def health_check():
    return {"status": "ok", "engine": "active"}

@app.get("/api/v1/extract/url")
async def extract_info(url: str = Query(..., description="Media platform URL")):
    try:
        url = validate_public_url(url)
        async with job_semaphore:
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
                        'height': height,
                        'fps': f.get('fps'),
                    })

        return JSONResponse({
            "title": info.get('title', 'Media Video'),
            "duration": info.get('duration', 0),
            "thumbnail": info.get('thumbnail'),
            "uploader": info.get('uploader') or info.get('extractor_key'),
            "platform": info.get('extractor_key'),
            "original_platform_url": url,
            "available_qualities": formats if formats else [],
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
    format_id: Optional[str] = Query(None),
    audio_only: bool = Query(False)
):
    try:
        url = validate_public_url(url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    task_id = str(uuid.uuid4())
    task_dir = os.path.join(TEMP_DOWNLOAD_DIR, task_id)
    os.makedirs(task_dir, exist_ok=True)

    output_template = os.path.join(task_dir, '%(id)s.%(ext)s')

    if audio_only:
        format_selector = 'bestaudio/best'
        post_processors = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}]
    elif format_id and format_id.replace("-", "").replace("_", "").isalnum():
        format_selector = f'{format_id}+bestaudio/{format_id}/best'
        post_processors = []
    else:
        target_height = quality.replace("p", "") if "p" in quality and quality.replace("p", "").isdigit() else None
        if target_height:
            format_selector = (
                f'bestvideo[height<={target_height}]+bestaudio/'
                f'best[height<={target_height}]/'
                f'b/best'
            )
        else:
            format_selector = 'bestvideo+bestaudio/best/b'
            
        post_processors = []

    download_custom_opts = {
        'outtmpl': output_template,
        'format': format_selector,
        'merge_output_format': 'mp4' if not audio_only else None,
        'postprocessors': post_processors,
    }

    try:
        try:
            async with job_semaphore:
                final_filename = await asyncio.to_thread(_sync_download_media, url, task_dir, download_custom_opts)
        except Exception as primary_err:
            logger.warning("⚠️ Requested high quality format unavailable. Attempting fallback single-stream download...")
            fallback_opts = dict(download_custom_opts)
            fallback_opts['format'] = 'b/best'
            async with job_semaphore:
                final_filename = await asyncio.to_thread(_sync_download_media, url, task_dir, fallback_opts)

        background_tasks.add_task(remove_temp_directory, task_dir)

        safe_display_name = f"download_{task_id[:8]}." + ("mp3" if audio_only else "mp4")

        return FileResponse(
            path=final_filename,
            filename=safe_display_name,
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
