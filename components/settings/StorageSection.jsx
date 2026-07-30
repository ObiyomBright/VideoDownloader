import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import useAppTheme from '../../utils/Theme';

// Dynamic byte formatter (handles B, KB, MB, GB, TB)
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const StorageSection = () => {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [appSpace, setAppSpace] = useState('0 B');
  const [freeStorage, setFreeStorage] = useState('0 B');
  const [totalStorage, setTotalStorage] = useState('0 B');

  useEffect(() => {
    calculateSpace();
  }, []);

  const calculateSpace = async () => {
    try {
      setLoading(true);

      // 1. Fetch total and free disk space on device using legacy API
      const freeBytes = await FileSystem.getFreeDiskStorageAsync();
      const totalBytes = await FileSystem.getTotalDiskCapacityAsync();

      setFreeStorage(formatBytes(freeBytes));
      setTotalStorage(formatBytes(totalBytes));

      // 2. Calculate VideoDownloader storage usage in Document Directory
      if (FileSystem.documentDirectory) {
        const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory);

        if (dirInfo.exists && typeof dirInfo.size === 'number' && dirInfo.size > 0) {
          setAppSpace(formatBytes(dirInfo.size));
        } else {
          // Fallback manual calculation if root directory size isn't directly returned
          const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
          let totalSize = 0;

          for (const file of files) {
            const fileInfo = await FileSystem.getInfoAsync(
              `${FileSystem.documentDirectory}${file}`
            );
            if (fileInfo.exists && typeof fileInfo.size === 'number') {
              totalSize += fileInfo.size;
            }
          }

          setAppSpace(formatBytes(totalSize));
        }
      }
    } catch (err) {
      console.error('Error calculating storage space:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.subtext }]}>STORAGE & DISK</Text>

      {loading ? (
        <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 12 }} />
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.iconWrapper}>
              <Ionicons name="hardware-chip-outline" size={20} color={theme.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Device Storage</Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                {freeStorage} free of {totalStorage}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.row}>
            <View style={styles.iconWrapper}>
              <Ionicons name="pie-chart-outline" size={20} color={theme.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>VideoDownloader Usage</Text>
              <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
                Occupying {appSpace}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
};

export default StorageSection;

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconWrapper: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
});