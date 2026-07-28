const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { downloadVideo } = require('./services');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Execute download
    const filePath = await downloadVideo(url);

    // Send video file to client for direct download
    res.download(filePath, (err) => {
      // Clean up local temp file after transfer completes
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to send file to client.' });
      }
    });
  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});