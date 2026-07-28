const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Downloads a video from a given URL using system yt-dlp
 * @param {string} url - Target video URL
 * @param {string} outputDir - Directory to save temporary files
 * @returns {Promise<string>} - Resolves with the absolute path of the downloaded file
 */
const downloadVideo = (url, outputDir = path.join(__dirname, '../downloads')) => {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPattern = path.join(outputDir, '%(title)s.%(ext)s');

    // Spawn yt-dlp process
    const ytdlp = spawn('yt-dlp', [
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best', // Get best mp4/m4a combo
      '--merge-output-format', 'mp4',
      '-o', outputPattern,
      '--no-playlist',
      url,
    ]);

    let filePath = '';
    let errorOutput = '';

    // Capture destination path printed by yt-dlp
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
        // Fallback: search for most recently created file in output dir if output string match was missed
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

module.exports = { downloadVideo };