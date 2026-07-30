import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useDownloadStore } from '../stores/useDownloadStore';

const API_BASE_URL = 'http://10.0.2.2:8000';

const extractCleanUrl = (text) => {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
};

// Helper to format bytes into readable string (e.g. 14.5 MB)
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

  const response = await fetch(
    `${API_BASE_URL}/api/v1/extract/url?url=${encodeURIComponent(cleanUrl)}`
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const message = errData.detail || `Server error (${response.status})`;
    throw new Error(message);
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

  // Retrieve store methods safely outside a React Component lifecycle
  const { addDownload, completeDownload, failDownload, updateProgress } =
    useDownloadStore.getState();

  const title = payload.title || 'media_file';
  const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 45);
  const isAudio = payload.format === 'mp3-audio' || payload.audio_only === true;
  const extension = isAudio ? 'mp3' : 'mp4';
  const fileName = `${cleanTitle}_${Date.now()}.${extension}`;

  // 1. Add item to download store (Status: 'downloading')
  const downloadId = addDownload({
    title: title,
    url: platformUrl,
    fileSize: payload.size || 'Unknown',
    thumbnail: payload.thumbnail || null,
    quality: payload.format || 'HD',
  });

  updateProgress(downloadId, 0.1, 'downloading');

  const selectedQuality = payload.format || 'best';
  const downloadEndpoint = `${API_BASE_URL}/api/v1/download?url=${encodeURIComponent(
    platformUrl
  )}&quality=${encodeURIComponent(selectedQuality)}&audio_only=${isAudio}`;

  try {
    // 2. Download to local storage & media library
    const savedUri = await downloadToDevice(downloadEndpoint, fileName, title, notify);

    // 3. Update store status to 'completed' with local file URI
    completeDownload(downloadId, savedUri);
  } catch (error) {
    failDownload(downloadId, error.message);
    throw error;
  }
};

const downloadToDevice = async (downloadUrl, fileName, title, notify) => {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    if (notify) notify('Storage permission required to save files.', 'error');
    throw new Error('Permission denied');
  }

  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    fileUri,
    {}
  );

  const result = await downloadResumable.downloadAsync();

  if (!result || !result.uri) {
    const errorMsg = 'Failed to download file stream from server.';
    if (notify) notify(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri);

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

    const errorMsg = parsedDetail || 'Error completing download processing.';
    if (notify) notify(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  const asset = await MediaLibrary.createAssetAsync(result.uri);
  await MediaLibrary.createAlbumAsync('Downloads', asset, false);

  if (notify) notify(`Saved "${title}" successfully!`, 'success');

  // Return the saved local file URI so Zustand can store it for playback
  return result.uri;
};