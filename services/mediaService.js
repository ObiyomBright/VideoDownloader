import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useSettingsStore } from '../stores/useSettingsStore';

// const API_BASE_URL = 'https://videodownloader-api-ze27.onrender.com';
const API_BASE_URL = 'http://10.0.2.2:8000';

const extractCleanUrl = (text) => {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
}; 

// Helper to format bytes into readable string (e.g. 14.5 MB))
const formatBytes = (bytes) => {
  if (!bytes || isNaN(bytes) || bytes === 0) return null;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const fetchMediaInfo = async (inputUrl) => {
  const cleanUrl = extractCleanUrl(inputUrl);
  if (!cleanUrl) throw new Error('Please enter a valid media URL.');

  const  response = await fetch(
    `${API_BASE_URL}/api/v1/extract/url?url=${encodeURIComponent(cleanUrl)}`
  );

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`;
    try {
      const text = await response.text();
      const errData = JSON.parse(text);
      if (errData && errData.detail) {
        errorMessage = errData.detail;
      } else if (text) {
        errorMessage = text.substring(0, 150); // Fallback to raw text preview if not JSON
      }
    } catch (_) {
      // Keep default status string if parsing fails completely
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  const rawQualities = Array.isArray(data.available_qualities)
    ? data.available_qualities
    : [];

  // Filter out non-video formats (storyboards, audio-only formats, duplicates)
  const validQualities = rawQualities.filter((q) => {
    if (!q) return false;
    const vcodec = q.vcodec ? String(q.vcodec) : '';
    // Exclude audio-only or invalid video streams if checking raw ytdlp format objects
    if (vcodec === 'none') return false;

    // Must have a resolution/quality key or format_id
    return Boolean(q.quality || q.height || q.format_id);
  });

  // Deduplicate by resolution while keeping the best format entry per resolution
  const uniqueQualityMap = new Map();

  validQualities.forEach((q) => {
    // Format label resolution (e.g., "1080p", "720p", "1080x1080")
    const resolution = String(
      q.quality || (q.height ? `${q.height}p` : q.format_id)
    );

    // Calculate file size from byte attributes if filesize_str is missing
    const computedSize =
      q.filesize_str ||
      formatBytes(q.filesize || q.filesize_approx) ||
      null;

    const ext = q.ext ? q.ext.toUpperCase() : 'MP4';

    // Build the option object
    const option = {
      label: computedSize
        ? `${ext} - ${resolution} (${computedSize})`
        : `${ext} - ${resolution}`,
      value: q.format_id ? `${resolution}_${q.format_id}` : resolution,
      rawQuality: resolution,
      size: computedSize || 'Size variable',
      direct_url: q.direct_url || null,
    };

    // Keep the entry with known size or first occurrences
    if (!uniqueQualityMap.has(resolution) || computedSize) {
      uniqueQualityMap.set(resolution, option);
    }
  });

  const formattedQualities = Array.from(uniqueQualityMap.values());

  return {
    title: data.title || 'Untitled Video',
    duration: data.duration || 0,
    thumbnail: data.thumbnail || null,
    uploader: data.uploader || 'Unknown Creator',
    platform: data.platform || 'Media',
    original_platform_url: cleanUrl,
    direct_url: data.direct_url || null,
    available_qualities: formattedQualities,
  };
};
export const downloadMediaPayload = async (payload, notify, fallbackUrl = '') => {
  const platformUrl = extractCleanUrl(
    payload.original_platform_url || payload.url || fallbackUrl
  );

  if (!platformUrl) {
    const errorMsg = 'Invalid platform URL provided.';
    if (notify) notify(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  const { addDownload } = useDownloadStore.getState();

  const title = payload.title || 'media_file';
  const isAudio = payload.format === 'mp3-audio' || payload.audio_only === true;

  // Add to queue in store - queue processor manages concurrent execution
  addDownload({
    title,
    url: platformUrl,
    fileSize: payload.size && payload.size !== 'Size variable' ? payload.size : 'Unknown',
    thumbnail: payload.thumbnail || null,
    duration: payload.duration || null,
    quality: payload.format || 'HD',
    isAudio,
  });
};

export const executeDownloadTask = async (item, notify) => {
  const { completeDownload, failDownload } = useDownloadStore.getState();

  const title = item.title || 'media_file';
  const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 45);
  const extension = item.isAudio ? 'mp3' : 'mp4';
  const fileName = `${cleanTitle}_${item.id}.${extension}`;

  const selectedQuality = item.quality || 'best';
  const downloadEndpoint = `${API_BASE_URL}/api/v1/download?url=${encodeURIComponent(
    item.url
  )}&quality=${encodeURIComponent(selectedQuality)}&audio_only=${item.isAudio || false}`;

  try {
    const result = await downloadToDevice(
      downloadEndpoint,
      fileName,
      title,
      notify,
      item.id,
      item.isAudio,
      item.resumeData
    );

    if (result?.isPaused) {
      // User paused the stream - exit gracefully without triggering errors
      return;
    }

    if (result && result.success && result.uri) {
      completeDownload(item.id, result.uri, result.formattedSize);
    } else {
      failDownload(item.id, 'Download completed with empty file stream.');
    }
  } catch (error) {
    const store = useDownloadStore.getState();
    const currentItem = store.downloads.find((d) => d.id === item.id);

    if (currentItem?.status !== 'paused') {
      failDownload(item.id, error.message);
      if (notify) notify(`Download failed: ${title}`, 'error');
    }
  }
};

const downloadToDevice = async (
  downloadUrl,
  fileName,
  title,
  notify,
  downloadId,
  isAudio,
  initialResumeData = null
) => {
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  const store = useDownloadStore.getState();
  const { downloadUri } = useSettingsStore.getState();

  // 1. Progress callback driving the Zustand store updates
  const callback = (downloadProgress) => {
    const totalExpected = downloadProgress.totalBytesExpectedToWrite;
    if (totalExpected > 0) {
      const progress = downloadProgress.totalBytesWritten / totalExpected;

      if (!isNaN(progress) && progress >= 0) {
        store.updateProgress(downloadId, progress, 'downloading');
      }
    }
  };

  // 2. Create download task with continuous progress listener (handling resume data)
  let downloadResumable;
  if (initialResumeData) {
    downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      callback,
      initialResumeData
    );
  } else {
    downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      callback
    );
  }

  // Register instance to support pausing during active download
  store.registerResumable(downloadId, downloadResumable);

  let result = null;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (err) {
    // Check if task was paused by user during execution
    const currentItem = store.downloads.find((d) => d.id === downloadId);
    if (currentItem?.status === 'paused') {
      return { isPaused: true, success: false };
    }
    throw err;
  }

  // Handle case where pauseAsync finishes without throwing
  const currentItem = store.downloads.find((d) => d.id === downloadId);
  if (currentItem?.status === 'paused' || !result || !result.uri) {
    if (currentItem?.status === 'paused') {
      return { isPaused: true, success: false };
    }
    const errorMsg = 'Failed to download file stream from server.';
    if (notify) notify(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri);

  // Validate downloaded file integrity
  if (!fileInfo.exists || fileInfo.size < 2000) {
    let serverError = '';
    try {
      serverError = await FileSystem.readAsStringAsync(result.uri);
    } catch (e) {}

    let parsedDetail = '';
    try {
      const jsonErr = JSON.parse(serverError);
      parsedDetail = jsonErr.detail;
    } catch (e) {}

    // Clean up temporary failed download file to keep storage clean
    await FileSystem.deleteAsync(result.uri, { idempotent: true });

    const errorMsg = parsedDetail || 'Error completing download processing.';
    if (notify) notify(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  // 3. Format actual downloaded size from disk
  const formattedSize = formatBytes(fileInfo.size);
  let finalUri = result.uri;

  // 4. Save file to either configured custom SAF folder or default MediaLibrary album
  try {
    if (downloadUri && FileSystem.StorageAccessFramework) {
      const mimeType = isAudio ? 'audio/mpeg' : 'video/mp4';

      const safariTargetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        downloadUri,
        fileName,
        mimeType
      );

      // Perform a native stream copy to prevent JS heap Out Of Memory crashes on large video files
      await FileSystem.copyAsync({
        from: result.uri,
        to: safariTargetUri,
      });

      finalUri = safariTargetUri;
    } else {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        const asset = await MediaLibrary.createAssetAsync(result.uri);
        const album = await MediaLibrary.getAlbumAsync('Downloads');

        if (album === null) {
          await MediaLibrary.createAlbumAsync('Downloads', asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
      }
    }

    // Clean up internal sandbox cache file if target was copied to SAF/MediaLibrary
    if (finalUri !== result.uri) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
    }
  } catch (mediaError) {
    console.warn('Storage save warning:', mediaError);
  }

  if (notify) notify(`Saved "${title}" successfully!`, 'success');

  return { uri: finalUri, formattedSize, isPaused: false, success: true };
};

export const startOrResumeDownload = async (item) => {
  const store = useDownloadStore.getState();

  // Re-queue the task into the engine to handle concurrency safely
  if (item.status === 'paused' || item.status === 'failed') {
    store.resumeDownload(item.id);
    return;
  }

  const fileUri = `${FileSystem.documentDirectory}${Date.now()}_${item.id}.mp4`;

  const callback = (downloadProgress) => {
    const totalExpected = downloadProgress.totalBytesExpectedToWrite;
    if (totalExpected > 0) {
      const progress = downloadProgress.totalBytesWritten / totalExpected;
      store.updateProgress(item.id, progress, 'downloading');
    }
  };

  let downloadResumable;

  try {
    if (item.resumeData) {
      // Resume existing download using saved state
      downloadResumable = FileSystem.createDownloadResumable(
        item.url,
        fileUri,
        {},
        callback,
        item.resumeData
      );
    } else {
      // Create new download instance
      downloadResumable = FileSystem.createDownloadResumable(
        item.url,
        fileUri,
        {},
        callback
      );
    }

    // Register instance so store can access .pauseAsync()
    store.registerResumable(item.id, downloadResumable);
    store.updateProgress(item.id, item.progress || 0, 'downloading');

    const result = await downloadResumable.downloadAsync();

    // Check if task was paused during resume attempt
    const currentItem = store.downloads.find((d) => d.id === item.id);
    if (currentItem?.status === 'paused') {
      return;
    }

    if (result && result.uri) {
      store.completeDownload(item.id, result.uri, item.fileSize);
    } else {
      throw new Error('No URI returned');
    }
  } catch (error) {
    const currentItem = store.downloads.find((d) => d.id === item.id);
    if (currentItem?.status === 'paused') {
      return;
    }

    console.error('Download error / failed to resume:', error);

    // Alert user on failure after attempting resume
    Alert.alert(
      'Download Failed',
      `Unable to resume downloading "${item.title}". Please check your connection and try again.`,
      [{ text: 'OK' }]
    );

    // Update status to failed
    store.failDownload(item.id, 'Download failed');
  }
};