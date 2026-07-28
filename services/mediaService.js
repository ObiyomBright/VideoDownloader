import { Platform } from 'react-native';

const PORT = 5000;
const BASE_URL = Platform.OS === 'android' ? `http://10.0.2.2:${PORT}` : `http://localhost:${PORT}`;

/**
 * Fetches video details/metadata
 */
export const fetchMediaInfo = async (url) => {
  try {
    const response = await fetch(`${BASE_URL}/api/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {
      const rawText = await response.text();
      console.error('Server returned non-JSON response:', rawText);
      throw new Error(`Server error (${response.status}). Check backend terminal output.`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch media details.');
    }

    return data;
  } catch (error) {
    console.error('Error fetching media info:', error.message);
    throw error;
  }
};

/**
 * Triggers video file download stream from backend
 */
export const triggerDownload = async (url) => {
  try {
    const response = await fetch(`${BASE_URL}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error('Failed to download video file.');
    }

    return await response.blob();
  } catch (error) {
    console.error('Error downloading video:', error.message);
    throw error;
  }
};

export default {
  fetchMediaInfo,
  triggerDownload,
};