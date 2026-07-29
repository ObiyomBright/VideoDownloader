import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';

import ThemedText from './ThemedText';
import ProgressBar from './ProgressBar';
import useAppTheme from '../utils/Theme';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useNotification } from './NotificationToast';

const DownloadItemCard = ({ item }) => {
  const theme = useAppTheme();
  const removeDownload = useDownloadStore((state) => state.removeDownload);
  const { showNotification } = useNotification();

  const handleOpenOrShare = async () => {
    if (item.status === 'completed' && item.localUri) {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(item.localUri);
      } else {
        showNotification('Sharing is not available on this device', 'info');
      }
    }
  };

  const getStatusBadge = () => {
    switch (item.status) {
      case 'completed':
        return <Ionicons name="checkmark-circle" size={20} color="#22C55E" />;
      case 'failed':
        return <Ionicons name="alert-circle" size={20} color="#EF4444" />;
      case 'downloading':
      case 'pending':
      default:
        return <Ionicons name="arrow-down-circle" size={20} color={theme.primary} />;
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconContainer}>{getStatusBadge()}</View>
        <View style={styles.titleContainer}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {item.title}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.subtext }]}>
            {item.status.toUpperCase()} • {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </ThemedText>
        </View>

        <TouchableOpacity onPress={() => removeDownload(item.id)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      {(item.status === 'downloading' || item.status === 'pending') && (
        <View style={styles.progressSection}>
          <ProgressBar progress={item.progress} />
          <View style={styles.progressLabelRow}>
            <ThemedText style={[styles.progressText, { color: theme.subtext }]}>
              {Math.round(item.progress * 100)}%
            </ThemedText>
          </View>
        </View>
      )}

      {item.status === 'completed' && (
        <TouchableOpacity
          style={[styles.openBtn, { backgroundColor: theme.border }]}
          onPress={handleOpenOrShare}
        >
          <Ionicons name="share-outline" size={16} color={theme.text} style={{ marginRight: 6 }} />
          <ThemedText style={styles.openBtnText}>Share / Open</ThemedText>
        </TouchableOpacity>
      )}

      {item.status === 'failed' && (
        <ThemedText style={[styles.errorText, { color: '#EF4444' }]} numberOfLines={1}>
          {item.error || 'Download failed'}
        </ThemedText>
      )}
    </View>
  );
};

export default DownloadItemCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 10,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  actionBtn: {
    padding: 4,
  },
  progressSection: {
    marginTop: 8,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  progressText: {
    fontSize: 11,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
  },
});