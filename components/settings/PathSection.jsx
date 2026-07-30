import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import useAppTheme from '../../utils/Theme';
import { useSettingsStore } from '../../stores/useSettingsStore';

// Utility to make SAF URIs human-readable in the UI
const getReadablePath = (uri) => {
  if (!uri) return 'Default (Downloads)';
  try {
    const decoded = decodeURIComponent(uri);
    // SAF URIs typically look like content://com.android.providers.downloads.documents/tree/primary:Download/Videos
    const parts = decoded.split(':');
    if (parts.length > 1) {
      return `Internal Storage > ${parts[parts.length - 1]}`;
    }
    return decoded;
  } catch (e) {
    return 'Custom Folder Selected';
  }
};

const PathSection = () => {
  const theme = useAppTheme();
  const { downloadUri, setDownloadUri } = useSettingsStore();

  const handleSelectDirectory = async () => {
    try {
      if (FileSystem.StorageAccessFramework) {
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (permissions.granted) {
          setDownloadUri(permissions.directoryUri);
          Alert.alert('Path Updated', 'Downloads will now be saved to your selected folder.');
        }
      } else {
        Alert.alert(
          'Default Storage',
          'Storage Access Framework is not available on this device. Media will be saved to your default system gallery.'
        );
      }
    } catch (error) {
      console.error('Directory permission error:', error);
      Alert.alert('Error', 'Could not open folder picker.');
    }
  };

  const displayPath = getReadablePath(downloadUri);

  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.subtext }]}>DOWNLOAD LOCATION</Text>
      <TouchableOpacity style={styles.row} onPress={handleSelectDirectory} activeOpacity={0.7}>
        <View style={styles.iconWrapper}>
          <Ionicons name="folder-open-outline" size={20} color={theme.primary} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Save Path</Text>
          <Text style={[styles.rowSubtitle, { color: theme.subtext }]} numberOfLines={1}>
            {displayPath}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
      </TouchableOpacity>
    </View>
  );
};

export default PathSection;

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
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
});