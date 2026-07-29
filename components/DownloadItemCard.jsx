import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Share,
  Platform,
  Linking,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

import ThemedText from './ThemedText';
import useAppTheme from '../utils/Theme';

const DownloadItemCard = ({ item, onDeleteRequest }) => {
  const theme = useAppTheme();
  const mediaSource = item.localUri || item.url;

  // Open the video using the default system app / external video player
  const handleOpenInSystemPlayer = async () => {
    try {
      if (Platform.OS === 'android' && item.localUri) {
        // 1. Convert local file:// URI to a content:// URI using legacy FileSystem
        const contentUri = await FileSystem.getContentUriAsync(item.localUri);

        // 2. Launch Android intent chooser with content:// URI
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'video/*',
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
      } else if (Platform.OS === 'ios' && item.localUri) {
        const isSharingAvailable = await Sharing.isAvailableAsync();
        if (isSharingAvailable) {
          await Sharing.shareAsync(item.localUri);
        }
      } else {
        const canOpen = await Linking.canOpenURL(mediaSource);
        if (canOpen) {
          await Linking.openURL(mediaSource);
        }
      }
    } catch (error) {
      console.error('Error launching system video player:', error);

      // Fallback: share sheet only triggers on explicit failure
      try {
        if (item.localUri && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(item.localUri);
        }
      } catch (fallbackError) {
        console.error('Sharing fallback failed:', fallbackError);
      }
    }
  };

  const handleShare = async (e) => {
    // Prevent event from triggering parent card onPress
    e?.stopPropagation?.();
    try {
      await Share.share({
        url: mediaSource,
        message: `Check out this video: ${item.title}`,
      });
    } catch (error) {
      console.error('Error sharing download:', error);
    }
  };

  const handleDelete = (e) => {
    // Prevent event from triggering parent card onPress
    e?.stopPropagation?.();
    onDeleteRequest(item);
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
        onPress={handleOpenInSystemPlayer}
        style={styles.cardContent}
      >
        {/* Compact Left Video Preview Thumbnail */}
        <View style={styles.thumbnailContainer}>
          <Image
            source={{ uri: item.thumbnail || item.localUri || item.url }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          {item.duration && (
            <View style={styles.durationBadge}>
              <ThemedText style={styles.durationText}>
                {item.duration}
              </ThemedText>
            </View>
          )}
          <View style={styles.playIconOverlay}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
        </View>

        {/* Info Block */}
        <View style={styles.infoContainer}>
          <ThemedText numberOfLines={2} style={styles.title}>
            {item.title}
          </ThemedText>

          <View style={styles.metaRow}>
            {item.quality && (
              <View
                style={[
                  styles.qualityTag,
                  { backgroundColor: theme.primary + '22' },
                ]}
              >
                <ThemedText
                  style={[styles.qualityText, { color: theme.primary }]}
                >
                  {item.quality}
                </ThemedText>
              </View>
            )}

            <ThemedText style={[styles.subtext, { color: theme.subtext }]}>
              {item.fileSize || 'Unknown size'}
            </ThemedText>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleShare}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="share-social-outline"
                size={18}
                color={theme.text}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleDelete}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={theme.error || '#FF3B30'}
              />
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
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  playIconOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
    padding: 6,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
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