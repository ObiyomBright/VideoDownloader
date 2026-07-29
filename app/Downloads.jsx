import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ThemedView from '../components/ThemedView';
import ThemedText from '../components/ThemedText';
import ThemedInput from '../components/ThemedInput';
import DownloadItemCard from '../components/DownloadItemCard';
import useAppTheme from '../utils/Theme';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useNotification } from '../components/NotificationToast';

const DownloadsScreen = () => {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const downloads = useDownloadStore((state) => state.downloads);
  const clearCompleted = useDownloadStore((state) => state.clearCompleted);

  const pendingDownloads = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending'
  );
  const completedDownloads = downloads.filter((d) => d.status === 'completed');

  // Default to 'pending' if active items exist; otherwise default to 'completed'
  const [activeTab, setActiveTab] = useState(() =>
    pendingDownloads.length > 0 ? 'pending' : 'completed'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Update tab dynamically if new pending items arrive while on the page
  useEffect(() => {
    if (pendingDownloads.length > 0 && activeTab !== 'pending') {
      setActiveTab('pending');
    }
  }, [pendingDownloads.length]);

  const filteredDownloads = downloads.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'pending') {
      return item.status === 'downloading' || item.status === 'pending';
    }
    if (activeTab === 'completed') {
      return item.status === 'completed';
    }
    return true;
  });

  const handleClearCompleted = () => {
    clearCompleted();
    showNotification('Completed downloads cleared!', 'info');
  };

  return (
    <ThemedView style={styles.container} safe={true}>
      <View style={styles.contentWrapper}>
        {/* Page Header */}
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Downloads</ThemedText>
          {completedDownloads.length > 0 && (
            <TouchableOpacity onPress={handleClearCompleted}>
              <ThemedText style={[styles.clearText, { color: theme.primary }]}>
                Clear Completed
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Responsive Search Bar */}
        <View style={styles.searchContainer}>
          <ThemedInput
            placeholder="Search downloads..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => setSearchQuery('')}
            >
              <Ionicons name="close-circle" size={18} color={theme.subtext} />
            </TouchableOpacity>
          )}
        </View>

        {/* 2-Option Segmented Filter Tabs */}
        <View style={[styles.tabsContainer, { borderColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'pending' && { backgroundColor: theme.primary },
            ]}
            onPress={() => setActiveTab('pending')}
            activeOpacity={0.8}
          >
            <ThemedText
              style={[
                styles.tabText,
                activeTab === 'pending' && { color: '#FFFFFF', fontWeight: '700' },
              ]}
            >
              Active ({pendingDownloads.length})
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'completed' && { backgroundColor: theme.primary },
            ]}
            onPress={() => setActiveTab('completed')}
            activeOpacity={0.8}
          >
            <ThemedText
              style={[
                styles.tabText,
                activeTab === 'completed' && { color: '#FFFFFF', fontWeight: '700' },
              ]}
            >
              Completed ({completedDownloads.length})
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Downloads List */}
        <FlatList
          data={filteredDownloads}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DownloadItemCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={activeTab === 'pending' ? 'cloud-download-outline' : 'checkmark-done-circle-outline'}
                size={56}
                color={theme.subtext}
              />
              <ThemedText style={[styles.emptyTitle, { color: theme.subtext }]}>
                {activeTab === 'pending' ? 'No Active Downloads' : 'No Completed Downloads'}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: theme.subtext }]}>
                {searchQuery
                  ? 'No results match your search term.'
                  : activeTab === 'pending'
                  ? 'Any file currently downloading will appear here.'
                  : 'Files you download will be saved here.'}
              </ThemedText>
            </View>
          }
        />
      </View>
    </ThemedView>
  );
};

export default DownloadsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  contentWrapper: {
    width: '90%',
    maxWidth: 600,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchContainer: {
    width: '100%',
    justifyContent: 'center',
    marginBottom: 14,
  },
  searchInput: {
    width: '100%',
    height: 48,
    paddingRight: 40,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 14,
  },
  tabsContainer: {
    width: '100%',
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});