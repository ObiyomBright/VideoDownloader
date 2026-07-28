const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Fetches metadata (title, thumbnail, duration) for a given video URL
 */
const getMediaInfo = (url) => {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--skip-download',
      url,
    ]);

    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const info = JSON.parse(stdout);
          resolve({
            title: info.title || 'Untitled Video',
            thumbnail: info.thumbnail || null,
            duration: info.duration || 0,
            uploader: info.uploader || 'Unknown',
            url: url,
          });
        } catch (e) {
          reject(new Error('Failed to parse media metadata.'));
        }
      } else {
        reject(new Error(stderr || 'Failed to extract video details.'));
      }
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
    });
  });
};

/**
 * Downloads a video from a given URL using system yt-dlp
 */
const downloadVideo = (url, outputDir = path.join(__dirname, 'downloads')) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPattern = path.join(outputDir, '%(title)s.%(ext)s');

    const ytdlp = spawn('yt-dlp', [
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPattern,
      '--no-playlist',
      url,
    ]);

    let filePath = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/\[download\] Destination: (.+)/) || text.match(/\[Merger\] Merging formats into "(.+)"/);
      if (match) {
        filePath = match[1].trim();
      }
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0 && filePath && fs.existsSync(filePath)) {
        resolve(filePath);
      } else if (code === 0) {
        // Fallback: pick the latest file in downloads if regex parsing missed stdout
        const files = fs.readdirSync(outputDir)
          .map((file) => ({
            name: file,
            time: fs.statSync(path.join(outputDir, file)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 0) {
          resolve(path.join(outputDir, files[0].name));
        } else {
          reject(new Error('Download finished but output file could not be found.'));
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
      }
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
    });
  });
};

module.exports = {
  getMediaInfo,
  downloadVideo,
};