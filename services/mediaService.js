import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useDownloadStore } from '../stores/useDownloadStore';

const API_BASE_URL = 'http://10.0.2.2:8000';

const extractCleanUrl = (text) => {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
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

  const formattedQualities = Array.isArray(data.available_qualities)
    ? data.available_qualities
        .filter((q) => q && (q.quality || q.format_id))
        .map((q, index) => {
          const rawQuality = String(q.quality || q.format_id || 'HD');
          return {
            label: `${q.ext ? q.ext.toUpperCase() : 'MP4'} - ${rawQuality}`,
            // Append format_id or index to prevent duplicate keys when resolutions match
            value: q.format_id ? `${rawQuality}_${q.format_id}` : `${rawQuality}_${index}`,
            rawQuality: rawQuality,
            size: q.filesize_str || null,
            direct_url: q.direct_url || null,
          };
        })
    : [];

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