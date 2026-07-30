import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ThemedView from '../components/ThemedView';
import ThemedText from '../components/ThemedText';
import ThemedInput from '../components/ThemedInput';
import DownloadItemCard from '../components/DownloadItemCard';
import ConfirmModal from '../components/ConfirmModal';
import useAppTheme from '../utils/Theme';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useNotification } from '../components/NotificationToast';
import { startOrResumeDownload } from '../services/mediaService';

const DownloadsScreen = () => {
  const theme = useAppTheme();
  const { showNotification } = useNotification();

  const downloads = useDownloadStore((state) => state.downloads);
  const removeDownload = useDownloadStore((state) => state.removeDownload);
  const clearCompleted = useDownloadStore((state) => state.clearCompleted);
  const pauseAllDownloads = useDownloadStore((state) => state.pauseAllDownloads);
  const resumeAllDownloads = useDownloadStore((state) => state.resumeAllDownloads);
  const cancelAllPending = useDownloadStore((state) => state.cancelAllPending);

  const [selectedItemToDelete, setSelectedItemToDelete] = useState(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  const pendingDownloads = downloads.filter(
    (d) =>
      d.status === 'downloading' ||
      d.status === 'pending' ||
      d.status === 'paused' ||
      d.status === 'failed'
  );
  const completedDownloads = downloads.filter((d) => d.status === 'completed');

  const isAnyDownloading = downloads.some(
    (d) => d.status === 'downloading' || d.status === 'pending'
  );
  const isAnyPausedOrFailed = downloads.some(
    (d) => d.status === 'paused' || d.status === 'failed'
  );

  const [activeTab, setActiveTab] = useState(() =>
    pendingDownloads.length > 0 ? 'pending' : 'completed'
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (pendingDownloads.length > 0 && activeTab !== 'pending') {
      setActiveTab('pending');
    }
  }, [pendingDownloads.length]);

  const handleResumeAll = () => {
    const pausedOrFailedItems = downloads.filter(
      (d) => d.status === 'paused' || d.status === 'failed'
    );
    
    // Trigger instant optimistic UI change before background tasks execute
    resumeAllDownloads();

    pausedOrFailedItems.forEach((item) => startOrResumeDownload(item));
    showNotification('Resuming all downloads...', 'info');
  };

  const handleCancelAll = () => {
    cancelAllPending();
    showNotification('All pending downloads cancelled', 'info');
  };

  const filteredDownloads = downloads.filter((item) => {
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'pending') {
      return (
        item.status === 'downloading' ||
        item.status === 'pending' ||
        item.status === 'paused' ||
        item.status === 'failed'
      );
    }
    if (activeTab === 'completed') {
      return item.status === 'completed';
    }
    return true;
  });

  const handleDeleteRequest = (item) => {
    setSelectedItemToDelete(item);
    setIsDeleteModalVisible(true);
  };

  const handleConfirmDelete = () => {
    if (selectedItemToDelete) {
      removeDownload(selectedItemToDelete.id);
      showNotification('Download removed', 'info');
    }
    setIsDeleteModalVisible(false);
    setSelectedItemToDelete(null);
  };

  // Dynamic Header Actions
  const renderHeaderActions = () => {
    if (activeTab === 'completed' && completedDownloads.length > 0) {
      return (
        <TouchableOpacity onPress={clearCompleted} activeOpacity={0.7}>
          <ThemedText style={[styles.actionText, { color: theme.primary }]}>
            Clear Completed
          </ThemedText>
        </TouchableOpacity>
      );
    }

    if (activeTab === 'pending' && pendingDownloads.length > 0) {
      const showBothOperations = isAnyDownloading && isAnyPausedOrFailed;

      // Layout 1: Both Pause All & Resume All active -> Stacked Layout
      if (showBothOperations) {
        return (
          <View
            style={[
              styles.stackedActionCard,
              { backgroundColor: theme.border + '30', borderColor: theme.border },
            ]}
          >
            <View style={styles.topRowGroup}>
              <TouchableOpacity
                onPress={pauseAllDownloads}
                style={styles.pillBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="pause-circle-outline" size={14} color={theme.primary} />
                <ThemedText style={[styles.pillText, { color: theme.primary }]}>
                  Pause All
                </ThemedText>
              </TouchableOpacity>

              <View style={[styles.pillDivider, { backgroundColor: theme.border }]} />

              <TouchableOpacity
                onPress={handleResumeAll}
                style={styles.pillBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="play-circle-outline" size={14} color={theme.primary} />
                <ThemedText style={[styles.pillText, { color: theme.primary }]}>
                  Resume All
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={[styles.horizontalDivider, { backgroundColor: theme.border }]} />
            <TouchableOpacity
              onPress={handleCancelAll}
              style={styles.bottomRowBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={14} color={theme.error || '#FF3B30'} />
              <ThemedText style={[styles.pillText, { color: theme.error || '#FF3B30' }]}>
                Cancel All
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }

      // Layout 2: Only one active state exists -> Single-row side-by-side layout
      return (
        <View
          style={[
            styles.singleRowPillGroup,
            { backgroundColor: theme.border + '30', borderColor: theme.border },
          ]}
        >
          {isAnyDownloading && (
            <TouchableOpacity
              onPress={pauseAllDownloads}
              style={styles.pillBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="pause-circle-outline" size={14} color={theme.primary} />
              <ThemedText style={[styles.pillText, { color: theme.primary }]}>
                Pause All
              </ThemedText>
            </TouchableOpacity>
          )}

          {isAnyPausedOrFailed && (
            <TouchableOpacity
              onPress={handleResumeAll}
              style={styles.pillBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="play-circle-outline" size={14} color={theme.primary} />
              <ThemedText style={[styles.pillText, { color: theme.primary }]}>
                Resume All
              </ThemedText>
            </TouchableOpacity>
          )}

          <View style={[styles.pillDivider, { backgroundColor: theme.border }]} />

          <TouchableOpacity
            onPress={handleCancelAll}
            style={styles.pillBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle-outline" size={14} color={theme.error || '#FF3B30'} />
            <ThemedText style={[styles.pillText, { color: theme.error || '#FF3B30' }]}>
              Cancel All
            </ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <ThemedView style={styles.container} safe={true}>
      <View style={styles.contentWrapper}>
        {/* Header Bar */}
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Downloads</ThemedText>
          {renderHeaderActions()}
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <ThemedInput
            placeholder="Search downloads..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.subtext} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Tabs */}
        <View style={[styles.tabsContainer, { borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && { backgroundColor: theme.primary }]}
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
            style={[styles.tab, activeTab === 'completed' && { backgroundColor: theme.primary }]}
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
          extraData={downloads}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DownloadItemCard item={item} onDeleteRequest={handleDeleteRequest} />
          )}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={
                  activeTab === 'pending'
                    ? 'cloud-download-outline'
                    : 'checkmark-done-circle-outline'
                }
                size={56}
                color={theme.subtext}
              />
              <ThemedText style={[styles.emptyTitle, { color: theme.subtext }]}>
                {activeTab === 'pending' ? 'No Active Downloads' : 'No Completed Downloads'}
              </ThemedText>
            </View>
          }
        />
      </View>

      <ConfirmModal
        visible={isDeleteModalVisible}
        title="Delete Download"
        message={`Are you sure you want to delete "${selectedItemToDelete?.title || 'this item'}"?`}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteModalVisible(false)}
      />
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
    minHeight: 44,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Single-row pill layout */
  singleRowPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  /* Stacked multi-row card layout */
  stackedActionCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  topRowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    gap: 4,
    width: '100%',
  },

  /* Common button & divider elements */
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pillDivider: {
    width: 1,
    height: 12,
    marginHorizontal: 2,
  },
  horizontalDivider: {
    width: '100%',
    height: 1,
    marginVertical: 3,
  },

  /* Input, Tabs & List */
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
  listContainer: {
    flex: 1,
    width: '100%',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
});