import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import useAppTheme from '../../utils/Theme';

const PathSection = () => {
  const theme = useAppTheme();
  const [downloadPath, setDownloadPath] = useState('Downloads/VideoDownloader');

  const handleSelectDirectory = async () => {
    try {
      if (FileSystem.StorageAccessFramework) {
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (permissions.granted) {
          const selectedUri = permissions.directoryUri;
          const decodedPath = decodeURIComponent(selectedUri);
          const folderName = decodedPath.split(':').pop() || 'Selected Directory';

          setDownloadPath(folderName);
          Alert.alert('Download Path Updated', `Media will now save to: ${folderName}`);
        }
      } else {
        Alert.alert(
          'Default Gallery Path Active',
          'Your downloads are stored automatically in your media library album ("Downloads").'
        );
      }
    } catch (error) {
      console.error('Directory permission error:', error);
    }
  };

  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.subtext }]}>DOWNLOAD LOCATION</Text>

      <TouchableOpacity
        style={styles.row}
        onPress={handleSelectDirectory}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="folder-open-outline" size={20} color={theme.primary} />
        </View>

        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Save Path</Text>
          <Text style={[styles.rowSubtitle, { color: theme.subtext }]} numberOfLines={1}>
            {downloadPath}
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