import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { BASE_URL as API_BASE_URL } from './api';

if (!API_BASE_URL) {
  throw new Error('Missing Expo extra.apiBaseUrl configuration.');
}

const extractCleanUrl = (text) => {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
}; 

const parseApiError = async (response, fallback) => {
  try {
    const data = await response.json();
    return data?.detail || data?.error || fallback;
  } catch (_) {
    return fallback;
  }
};

const apiFetch = async (path, options) => {
  try {
    return await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(
      `Cannot reach ${API_BASE_URL}. Restart Expo with "npx expo start --clear" and verify the device has internet access.`
    );
  }
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

  const response = await apiFetch(
    `/api/v1/extract/url?url=${encodeURIComponent(cleanUrl)}`
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

  if (data.is_direct_file) {
    return {
      title: data.title || 'download',
      duration: 0,
      thumbnail: null,
      uploader: 'Direct download',
      platform: 'File',
      original_platform_url: data.direct_url || cleanUrl,
      direct_url: data.direct_url || cleanUrl,
      is_direct_file: true,
      mime_type: data.mime_type || 'application/octet-stream',
      extension: data.extension || 'bin',
      filesize: data.filesize || null,
      available_qualities: [],
    };
  }

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
      formatId: q.format_id || null,
      size: computedSize || 'Size variable',
      direct_url: q.direct_url || null,
      mimeType: q.ext === 'webm' ? 'video/webm' : 'video/mp4',
    };

    const codec = String(q.vcodec || '').toLowerCase();
    const isMuxed = q.acodec && q.acodec !== 'none';
    const compatibilityScore =
      (isMuxed ? 100 : 0) +
      (q.ext === 'mp4' ? 30 : 0) +
      (codec.startsWith('avc') || codec.startsWith('h264') ? 20 : 0) +
      (computedSize ? 1 : 0);
    const existing = uniqueQualityMap.get(resolution);
    if (!existing || compatibilityScore > existing.compatibilityScore) {
      uniqueQualityMap.set(resolution, { ...option, compatibilityScore });
    }
  });

  const formattedQualities = Array.from(uniqueQualityMap.values()).map(
    ({ compatibilityScore, ...option }) => option
  );

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
  const isAudio =
    payload.format === 'mp3-audio' ||
    payload.audio_only === true ||
    payload.mime_type?.startsWith('audio/');

  // Add to queue in store - queue processor manages concurrent execution
  addDownload({
    title,
    url: platformUrl,
    fileSize: payload.size && payload.size !== 'Size variable' ? payload.size : 'Unknown',
    thumbnail: payload.thumbnail || null,
    duration: payload.duration || null,
    quality: payload.format || 'HD',
    formatId: payload.formatId || null,
    isAudio,
    isDirectFile: Boolean(payload.is_direct_file),
    mimeType: payload.mime_type || (isAudio ? 'audio/mpeg' : 'video/mp4'),
    extension: payload.extension || (isAudio ? 'mp3' : 'mp4'),
  });
};

export const executeDownloadTask = async (item, notify) => {
  const { completeDownload, failDownload } = useDownloadStore.getState();

  const title = item.title || 'media_file';
  const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 45);
  try {
    const prepared = item.isDirectFile
      ? {
          url: item.url,
          extension: item.extension,
          mimeType: item.mimeType,
        }
      : await prepareDownloadOnServer(item);
    const extension = prepared.extension || item.extension || (item.isAudio ? 'mp3' : 'mp4');
    const mimeType = prepared.mimeType || item.mimeType || 'application/octet-stream';
    const fileName = `${cleanTitle}_${item.id}.${extension}`;
    useDownloadStore.getState().updateDownloadSource(item.id, { extension, mimeType });
    const result = await downloadToDevice(
      prepared.url,
      fileName,
      title,
      notify,
      item.id,
      mimeType,
      useDownloadStore.getState().downloads.find((d) => d.id === item.id)?.resumeData
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

const prepareDownloadOnServer = async (item) => {
  const store = useDownloadStore.getState();
  if (item.preparedUrl) {
    return {
      url: item.preparedUrl,
      extension: item.extension,
      mimeType: item.mimeType,
    };
  }
  let jobId = item.serverJobId;
  if (!jobId) {
    const response = await apiFetch('/api/v1/download/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: item.url,
        quality: item.quality || 'best',
        format_id: item.formatId || null,
        audio_only: Boolean(item.isAudio),
      }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response, 'Unable to start download job.'));
    }
    ({ job_id: jobId } = await response.json());
    store.updateDownloadSource(item.id, { serverJobId: jobId });
  }
  if (!jobId) throw new Error('The backend did not return a download job ID.');

  while (true) {
    const currentItem = useDownloadStore
      .getState()
      .downloads.find((download) => download.id === item.id);
    if (!currentItem || currentItem.status === 'paused') {
      throw new Error('Download paused.');
    }

    const statusResponse = await apiFetch(`/api/v1/download/jobs/${jobId}`);
    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        store.updateDownloadSource(item.id, {
          serverJobId: null,
          preparedUrl: null,
          resumeData: null,
        });
        return prepareDownloadOnServer({ ...item, serverJobId: null });
      }
      throw new Error(
        await parseApiError(statusResponse, 'Unable to read download progress.')
      );
    }

    const job = await statusResponse.json();
    const backendProgress = Number(job.progress) || 0;
    store.updateProgress(item.id, Math.min(0.9, backendProgress * 0.9), 'downloading');

    if (job.status === 'ready') {
      store.updateProgress(item.id, 0.9, 'downloading');
      const prepared = {
        url: `${API_BASE_URL}/api/v1/download/jobs/${jobId}/file`,
        extension: job.extension || (item.isAudio ? 'mp3' : 'mp4'),
        mimeType: job.mime_type || (item.isAudio ? 'audio/mpeg' : 'video/mp4'),
      };
      store.updateDownloadSource(item.id, {
        preparedUrl: prepared.url,
        extension: prepared.extension,
        mimeType: prepared.mimeType,
      });
      return prepared;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'The backend could not prepare this media.');
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }
};

const downloadToDevice = async (
  downloadUrl,
  fileName,
  title,
  notify,
  downloadId,
  mimeType,
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
        store.updateProgress(downloadId, 0.9 + progress * 0.1, 'downloading');
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
    } else if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      const granularPermission = mimeType.startsWith('image/')
        ? 'photo'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'video';
      const permission = await MediaLibrary.requestPermissionsAsync(true, [granularPermission]);
      if (permission.granted) {
        await MediaLibrary.createAssetAsync(result.uri);
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

  store.resumeDownload(item.id);
};
