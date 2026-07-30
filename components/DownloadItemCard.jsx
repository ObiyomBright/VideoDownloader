import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Share,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

import ThemedText from './ThemedText';
import useAppTheme from '../utils/Theme';
import { useDownloadStore } from '../stores/useDownloadStore';
import { startOrResumeDownload } from '../services/mediaService';
import { useNotification } from './NotificationToast';

const formatDuration = (duration) => {
  if (!duration || isNaN(duration)) return null;
  if (typeof duration === 'string' && (duration.includes(':') || duration.includes('m'))) {
    return duration;
  }

  const secondsNum = parseInt(duration, 10);
  const hours = Math.floor(secondsNum / 3600);
  const minutes = Math.floor((secondsNum % 3600) / 60);
  const seconds = secondsNum % 60;

  if (hours > 0) return `${hours}hr ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds > 0 ? `${seconds}s` : ''}`.trim();
  return `${seconds}s`;
};

const DownloadItemCard = ({ item, onDeleteRequest }) => {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const removeDownload = useDownloadStore((state) => state.removeDownload);
  const pauseDownload = useDownloadStore((state) => state.pauseDownload);

  const mediaSource = item.localUri || item.url;
  const isDownloading = item.status === 'downloading' || item.status === 'pending';
  const isPaused = item.status === 'paused';
  const isFailed = item.status === 'failed';
  const isCompleted = item.status === 'completed';

  const imageSourceUri = item.thumbnail || item.localUri || item.url;
  const rawProgress = typeof item.progress === 'number' ? item.progress : 0;
  const progressPercent = Math.min(Math.max(Math.round(rawProgress * 100), 0), 100);
  const formattedDuration = formatDuration(item.duration);

  const handleMissingFile = () => {
    showNotification('Video file not found or corrupted', 'error');
    Alert.alert(
      'File Not Found',
      'This file was deleted or moved from your device storage.',
      [{ text: 'Remove', onPress: () => removeDownload(item.id) }, { text: 'Cancel' }]
    );
  };

  const handlePlayAttempt = async () => {
    // If download is incomplete, notify user instead of trying to play
    if (!isCompleted) {
      showNotification(
        isFailed
          ? 'Download failed. Please tap "Retry Download".'
          : 'Please wait for the video to finish downloading before playing.',
        'warning'
      );
      return;
    }

    if (item.localUri) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(item.localUri);
        if (!fileInfo.exists) {
          handleMissingFile();
          return;
        }
      } catch (e) {
        handleMissingFile();
        return;
      }
    }

    try {
      if (Platform.OS === 'android' && item.localUri) {
        const contentUri = await FileSystem.getContentUriAsync(item.localUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'video/*',
          flags: 1,
        });
      } else if (Platform.OS === 'ios' && item.localUri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(item.localUri);
        }
      } else if (mediaSource) {
        const canOpen = await Linking.canOpenURL(mediaSource);
        if (canOpen) {
          await Linking.openURL(mediaSource);
        } else {
          handleMissingFile();
        }
      }
    } catch (error) {
      showNotification('Unable to play video', 'error');
    }
  };

  const handlePause = (e) => {
    e?.stopPropagation?.();
    pauseDownload(item.id);
  };

  const handleResumeOrRetry = (e) => {
    e?.stopPropagation?.();
    startOrResumeDownload(item);
  };

  const handleShare = (e) => {
    e?.stopPropagation?.();
    if (!isCompleted) return;

    Share.share({
      url: mediaSource,
      message: `Check out this video: ${item.title}`,
    }).catch((err) => console.error('Error sharing:', err));
  };

  const handleDelete = (e) => {
    e?.stopPropagation?.();
    if (onDeleteRequest) {
      onDeleteRequest(item);
    } else {
      removeDownload(item.id);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card || theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePlayAttempt}
        style={styles.cardContent}
      >
        {/* Thumbnail Box */}
        <View style={styles.thumbnailContainer}>
          {imageSourceUri ? (
            <Image
              source={{ uri: imageSourceUri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.placeholderThumb, { backgroundColor: theme.border }]}>
              <Ionicons name="videocam-outline" size={24} color={theme.subtext} />
            </View>
          )}

          {/* Icon Overlay (Only shows standard play icon for completed videos) */}
          {isCompleted && (
            <View style={styles.playIconOverlay}>
              <Ionicons name="play" size={16} color="#FFFFFF" />
            </View>
          )}

          {formattedDuration && (
            <View style={styles.durationBadge}>
              <ThemedText style={styles.durationText}>{formattedDuration}</ThemedText>
            </View>
          )}
        </View>

        {/* Info & Controls */}
        <View style={styles.infoContainer}>
          <ThemedText numberOfLines={2} style={styles.title}>
            {item.title}
          </ThemedText>

          {/* Active Download Progress */}
          {isDownloading && (
            <View style={styles.progressSection}>
              <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    { backgroundColor: theme.primary, width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <View style={styles.progressStatusRow}>
                <ThemedText style={[styles.subtext, { color: theme.primary, fontWeight: '600' }]}>
                  {progressPercent}%
                </ThemedText>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: theme.border }]}
                  onPress={handlePause}
                >
                  <Ionicons name="pause" size={12} color={theme.text} />
                  <ThemedText style={styles.smallBtnText}>Pause</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Paused Progress State */}
          {isPaused && (
            <View style={styles.progressSection}>
              <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    { backgroundColor: theme.subtext, width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <View style={styles.progressStatusRow}>
                <ThemedText style={[styles.subtext, { color: theme.subtext, fontWeight: '600' }]}>
                  Paused ({progressPercent}%)
                </ThemedText>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: theme.primary }]}
                  onPress={handleResumeOrRetry}
                >
                  <Ionicons name="play" size={12} color="#FFFFFF" />
                  <ThemedText style={[styles.smallBtnText, { color: '#FFFFFF' }]}>
                    Resume
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Completed State Meta */}
          {isCompleted && (
            <View style={styles.metaRow}>
              {item.quality && (
                <View
                  style={[
                    styles.qualityTag,
                    { backgroundColor: (theme.primary || '#007AFF') + '22' },
                  ]}
                >
                  <ThemedText style={[styles.qualityText, { color: theme.primary }]}>
                    {item.quality}
                  </ThemedText>
                </View>
              )}
              {item.fileSize && item.fileSize !== 'Unknown' && (
                <ThemedText style={[styles.subtext, { color: theme.subtext }]}>
                  {item.fileSize}
                </ThemedText>
              )}
            </View>
          )}

          {/* Failed State Row with Text Retry Link */}
          {isFailed && (
            <View style={styles.failedRow}>
              <ThemedText style={[styles.subtext, { color: theme.error || '#FF3B30', fontWeight: '600' }]}>
                Download failed
              </ThemedText>
              <TouchableOpacity onPress={handleResumeOrRetry}>
                <ThemedText style={[styles.retryText, { color: theme.primary }]}>
                  Retry Download
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Right Action Icons */}
          <View style={styles.actionsRow}>
            {isCompleted && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleShare}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-social-outline" size={18} color={theme.text} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleDelete}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={18} color={theme.error || '#FF3B30'} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default DownloadItemCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 10,
  },
  thumbnailContainer: {
    width: 120,
    height: 75,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderThumb: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 16,
    padding: 6,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  progressSection: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  qualityTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subtext: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
  },
  actionBtn: {
    padding: 2,
  },
});