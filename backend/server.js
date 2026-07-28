const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { getMediaInfo, downloadVideo } = require('./services');

const app = express();

app.use(cors());
app.use(express.json());

// 1. Fetch metadata before downloading
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const info = await getMediaInfo(url);
    return res.json(info);
  } catch (error) {
    console.error('Info Extraction Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Download and stream video file back to client
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const filePath = await downloadVideo(url);

    res.download(filePath, (err) => {
      // Clean up local file after transfer completes
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to send file to client.' });
      }
    });
  } catch (error) {
    console.error('Download Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});