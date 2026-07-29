import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useDownloadStore } from '../stores/useDownloadStore';

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
      headers: { 'Accept': 'application/json' },
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

    return await response.json();
  } catch (error) {
    console.error('API Extract Error:', error);
    throw error;
  }
};

export const downloadToDevice = async (downloadUrl, fileName, title, notify) => {
  const store = useDownloadStore.getState();
  const taskId = store.addDownload({ title, url: downloadUrl });

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    const localUri = FileSystem.documentDirectory + fileName;

    const callback = (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      store.updateProgress(taskId, isNaN(progress) ? 0.5 : progress, 'downloading');
    };

    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      localUri,
      {},
      callback
    );

    store.updateProgress(taskId, 0, 'downloading');
    const result = await downloadResumable.downloadAsync();

    if (!result || !result.uri) {
      throw new Error('Failed to save media file to device.');
    }

    if (status === 'granted') {
      const asset = await MediaLibrary.createAssetAsync(result.uri);
      await MediaLibrary.createAlbumAsync('Downloads', asset, false);
      store.completeDownload(taskId, result.uri);
      if (notify) notify('Saved directly to your Media Gallery!', 'success');
    } else {
      store.completeDownload(taskId, result.uri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        if (notify) notify('Downloaded to app storage!', 'info');
      }
    }
  } catch (error) {
    console.error('Download Error:', error);
    store.failDownload(taskId, error.message || 'Download failed');
    if (notify) notify(`Download failed: ${error.message || 'Unknown error'}`, 'error');
  }
};

export const downloadMediaPayload = async (payload, notify) => {
  const originalUrl = payload.original_url || payload.url;
  const directMediaUrl = payload.direct_url || payload.media_url || payload.url;

  const title = payload.title || 'media';
  const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

  const isAudio = payload.audio_only || (payload.format && payload.format.includes('mp3'));
  const extension = isAudio ? 'mp3' : 'mp4';
  const fileName = `${cleanTitle}.${extension}`;

  const downloadEndpoint = `${API_BASE_URL}/api/v1/extract/download?url=${encodeURIComponent(
    originalUrl
  )}&media_url=${encodeURIComponent(directMediaUrl)}`;

  await downloadToDevice(downloadEndpoint, fileName, title, notify);
};