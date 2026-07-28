import { Platform } from 'react-native';

const PORT = 5000;
const BASE_URL = Platform.OS === 'android' ? `http://10.0.2.2:${PORT}` : `http://localhost:${PORT}`;

export const triggerDownload = async (videoUrl) => {
  try {
    const response = await fetch(`${BASE_URL}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: videoUrl }),
    });

    if (!response.ok) {
      throw new Error('Failed to process video download');
    }

    // Process downloaded response stream/blob as required on the app end
    return await response.blob();
  } catch (err) {
    console.error('Request failed:', err);
    throw err;
  }
};