const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Helper to convert bytes to human readable string (MB/GB)
 */
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return null;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Fetches metadata + format options with sizes
 */
const getMediaInfo = (url) => {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--skip-download',
      '--extractor-args', 'youtube:player_client=android,web', // Switched from ios to android
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
          const rawFormats = info.formats || [];

          const parsedFormats = [];
          const targetResolutions = [1080, 720, 480, 360];

          targetResolutions.forEach((res) => {
            const fmt = rawFormats
              .filter((f) => f.height === res && (f.filesize || f.filesize_approx))
              .sort((a, b) => (b.filesize || b.filesize_approx) - (a.filesize || a.filesize_approx))[0];

            if (fmt) {
              const sizeInBytes = fmt.filesize || fmt.filesize_approx;
              parsedFormats.push({
                label: `MP4 - ${res}p`,
                value: `mp4-${res}p`,
                formatId: fmt.format_id,
                size: formatBytes(sizeInBytes),
              });
            } else {
              parsedFormats.push({
                label: `MP4 - ${res}p`,
                value: `mp4-${res}p`,
                size: null,
              });
            }
          });

          const audioFmt = rawFormats
            .filter((f) => f.vcodec === 'none' && f.acodec !== 'none' && (f.filesize || f.filesize_approx))
            .sort((a, b) => (b.filesize || b.filesize_approx) - (a.filesize || a.filesize_approx))[0];

          parsedFormats.push({
            label: 'MP3 - Audio Only',
            value: 'mp3-audio',
            size: audioFmt ? formatBytes(audioFmt.filesize || audioFmt.filesize_approx) : null,
          });

          resolve({
            title: info.title || 'Untitled Video',
            thumbnail: info.thumbnail || null,
            duration: info.duration || 0,
            uploader: info.uploader || 'Unknown',
            formats: parsedFormats,
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

const downloadVideo = (url, format = 'mp4-720p', outputDir = path.join(__dirname, 'downloads')) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPattern = path.join(outputDir, '%(title)s.%(ext)s');

    let formatSpec = 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best';
    if (format.includes('1080p')) formatSpec = 'bv*[height<=1080]+ba/b[height<=1080]';
    if (format.includes('720p')) formatSpec = 'bv*[height<=720]+ba/b[height<=720]';
    if (format.includes('480p')) formatSpec = 'bv*[height<=480]+ba/b[height<=480]';
    if (format === 'mp3-audio') formatSpec = 'ba/bestaudio';

    const ytdlp = spawn('yt-dlp', [
      '-f', formatSpec,
      '--merge-output-format', 'mp4',
      '-o', outputPattern,
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android,web', // Switched from ios to android
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