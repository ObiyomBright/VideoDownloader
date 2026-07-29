import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

const API_BASE_URL = 'https://media-downloader-backend-rut5.onrender.com';

export const fetchMediaInfo = async (url, notify, retries = 2) => {
  if (!url || url.includes('onrender.com')) {
    const errorMsg = 'Please enter a valid media link from YouTube, Instagram, TikTok, etc.';
    if (notify) notify(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  try {
    const endpoint = `${API_BASE_URL}/api/v1/extract/url?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 502 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await fetchMediaInfo(url, notify, retries - 1);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let message = `Server error: ${response.status}`;

      if (response.status === 502) {
        message = 'Server is starting up or upstream extraction timed out.';
      } else if (errorData?.detail) {
        if (Array.isArray(errorData.detail)) {
          message = errorData.detail.map((err) => `${err.loc?.join('.')}: ${err.msg}`).join(', ');
        } else if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else {
          message = JSON.stringify(errorData.detail);
        }
      }

      if (notify) notify(message, 'error');
      throw new Error(message);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Extract Error:', error);
    throw error;
  }
};

export const downloadToDevice = async (downloadUrl, fileName, notify) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    const localUri = FileSystem.documentDirectory + fileName;

    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      localUri
    );

    const result = await downloadResumable.downloadAsync();

    if (!result || !result.uri) {
      throw new Error('Failed to download media file to local device storage.');
    }

    if (status === 'granted') {
      const asset = await MediaLibrary.createAssetAsync(result.uri);
      await MediaLibrary.createAlbumAsync('Downloads', asset, false);
      if (notify) notify('Saved directly to your device Media Gallery!', 'success');
    } else {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        if (notify) notify('Downloaded to app storage!', 'info');
      }
    }
  } catch (error) {
    console.error('Download to Device Error:', error);
    if (await Sharing.isAvailableAsync()) {
      const localUri = FileSystem.documentDirectory + fileName;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo?.exists) {
        await Sharing.shareAsync(localUri);
        return;
      }
    }
    if (notify) notify(`Download failed: ${error.message || 'Unknown network error'}`, 'error');
  }
};

export const downloadMediaPayload = async (payload, notify) => {
  const originalUrl = payload.original_url || payload.url;
  const directMediaUrl = payload.direct_url || payload.media_url || payload.url;

  const cleanTitle = (payload.title || 'media')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50);

  const isAudio = payload.audio_only || (payload.format && payload.format.includes('mp3'));
  const extension = isAudio ? 'mp3' : 'mp4';
  const fileName = `${cleanTitle}.${extension}`;

  const downloadEndpoint = `${API_BASE_URL}/api/v1/extract/download?url=${encodeURIComponent(
    originalUrl
  )}&media_url=${encodeURIComponent(directMediaUrl)}`;

  await downloadToDevice(downloadEndpoint, fileName, notify);
};