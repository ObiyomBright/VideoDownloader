import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';
import { downloadMediaPayload } from '../services/mediaService';

const MediaDownloader = ({ loading, mediaData }) => {
  const theme = useAppTheme();
  const [selectedFormat, setSelectedFormat] = useState('mp4-720p');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.subtext }]}>
          Extracting video info...
        </Text>
      </View>
    );
  }

  if (!mediaData) return null;

  const formatOptions = mediaData.formats || [
    { label: 'MP4 - 1080p', value: 'mp4-1080p', size: null },
    { label: 'MP4 - 720p', value: 'mp4-720p', size: null },
    { label: 'MP4 - 480p', value: 'mp4-480p', size: null },
    { label: 'MP3 - Audio Only', value: 'mp3-audio', size: null },
  ];

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await downloadMediaPayload({
        type: 'single',
        title: mediaData.title,
        url: mediaData.url,
        format: selectedFormat,
      });
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const selectedOption = formatOptions.find((opt) => opt.value === selectedFormat) || formatOptions[0];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {/* Thumbnail Section */}
      {mediaData.thumbnail && (
        <View style={styles.thumbnailWrapper}>
          <Image
            source={{ uri: mediaData.thumbnail }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          {mediaData.duration > 0 && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(mediaData.duration)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Details */}
      <View style={styles.detailsContainer}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {mediaData.title}
        </Text>
        {mediaData.uploader && (
          <Text style={[styles.uploader, { color: theme.subtext }]}>
            {mediaData.uploader}
          </Text>
        )}
      </View>

      {/* Dropdown Menu */}
      <View style={styles.dropdownContainer}>
        <Text style={[styles.label, { color: theme.text }]}>Select Quality</Text>
        <TouchableOpacity
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.background }]}
          onPress={() => setDropdownOpen(!dropdownOpen)}
          activeOpacity={0.7}
        >
          <Text style={[styles.dropdownTriggerText, { color: theme.text }]}>
            {selectedOption.label} {selectedOption.size ? `(${selectedOption.size})` : ''}
          </Text>
          <Ionicons
            name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.text}
          />
        </TouchableOpacity>

        {/* Dropdown Items List */}
        {dropdownOpen && (
          <View style={[styles.optionsMenu, { backgroundColor: theme.background, borderColor: theme.border }]}>
            {formatOptions.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.optionItem,
                  selectedFormat === item.value && { backgroundColor: theme.primary + '20' },
                ]}
                onPress={() => {
                  setSelectedFormat(item.value);
                  setDropdownOpen(false);
                }}
              >
                <View style={styles.optionLabelGroup}>
                  <Text
                    style={[
                      styles.optionText,
                      { color: selectedFormat === item.value ? theme.primary : theme.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.size && (
                    <Text style={[styles.sizeBadgeText, { color: theme.subtext }]}>
                      {item.size}
                    </Text>
                  )}
                </View>

                {selectedFormat === item.value && (
                  <Ionicons name="checkmark" size={16} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Action Button */}
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: theme.primary }]}
        onPress={handleDownload}
        disabled={downloading}
        activeOpacity={0.8}
      >
        {downloading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="cloud-download-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>
              Start Download
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default MediaDownloader;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
  thumbnailWrapper: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  detailsContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  uploader: {
    fontSize: 13,
    marginTop: 4,
  },
  dropdownContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dropdownTrigger: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  optionsMenu: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sizeBadgeText: {
    fontSize: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});