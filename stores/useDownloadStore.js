import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const activeDownloadTasks = new Map();
const MAX_CONCURRENT_DOWNLOADS = 3;

export const useDownloadStore = create(
  persist(
    (set, get) => ({
      downloads: [],

      registerResumable: (id, resumableInstance) => {
        activeDownloadTasks.set(id, resumableInstance);
      },

      // Queue management engine (Snaptube standard max 3 concurrent)
      processQueue: async () => {
        const { downloads } = get();
        
        const activeCount = downloads.filter(
          (d) => d.status === 'downloading'
        ).length;

        if (activeCount >= MAX_CONCURRENT_DOWNLOADS) return;

        const slotsAvailable = MAX_CONCURRENT_DOWNLOADS - activeCount;
        const queuedItems = downloads.filter((d) => d.status === 'queued');
        const itemsToStart = queuedItems.slice(0, slotsAvailable);

        if (itemsToStart.length === 0) return;

        // Mark batch as active downloading
        set((state) => ({
          downloads: state.downloads.map((item) =>
            itemsToStart.some((target) => target.id === item.id)
              ? { ...item, status: 'downloading' }
              : item
          ),
        }));

        const { executeDownloadTask } = require('../services/mediaService');

        itemsToStart.forEach((item) => {
          executeDownloadTask(item);
        });
      },

      addDownload: (task) => {
        const newTask = {
          id: task.id || Date.now().toString(),
          title: task.title || 'Untitled Media',
          url: task.url,
          fileSize: task.fileSize || 'Unknown',
          thumbnail: task.thumbnail || null,
          duration: task.duration || null,
          quality: task.quality || 'HD',
          formatId: task.formatId || null,
          isAudio: task.isAudio || false,
          progress: 0,
          status: 'queued', // 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'
          createdAt: new Date().toISOString(),
          localUri: null,
          resumeData: null,
          error: null,
        };

        set((state) => ({ downloads: [newTask, ...state.downloads] }));
        get().processQueue();
        return newTask.id;
      },

      updateProgress: (id, progress, status = 'downloading') => {
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id ? { ...item, progress, status } : item
          ),
        }));
      },

      pauseDownload: async (id) => {
        const instance = activeDownloadTasks.get(id);
        let savedResumeData = null;

        if (instance) {
          try {
            const pauseResult = await instance.pauseAsync();
            savedResumeData = pauseResult?.resumeData || null;
          } catch (err) {
            // Task stream cancelled
          }
        }

        activeDownloadTasks.delete(id);

        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'paused',
                  resumeData: savedResumeData || item.resumeData,
                }
              : item
          ),
        }));

        get().processQueue();
      },

      resumeDownload: (id) => {
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id
              ? { ...item, status: 'queued', error: null }
              : item
          ),
        }));
        get().processQueue();
      },

      pauseAllDownloads: async () => {
        const { downloads, pauseDownload } = get();
        const activeTasks = downloads.filter(
          (d) => d.status === 'downloading' || d.status === 'queued'
        );

        // Optimistically set queued tasks to paused directly
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.status === 'queued' ? { ...item, status: 'paused' } : item
          ),
        }));

        // Execution pause for live downloads to retain stream binary pointers
        await Promise.all(
          activeTasks
            .filter((d) => d.status === 'downloading')
            .map((d) => pauseDownload(d.id))
        );
      },

      resumeAllDownloads: () => {
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.status === 'paused' || item.status === 'failed'
              ? { ...item, status: 'queued', error: null }
              : item
          ),
        }));
        get().processQueue();
      },

      completeDownload: (id, localUri, fileSize) => {
        activeDownloadTasks.delete(id);
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id
              ? {
                  ...item,
                  progress: 1,
                  status: 'completed',
                  localUri,
                  fileSize: fileSize || item.fileSize,
                  resumeData: null,
                  error: null,
                }
              : item
          ),
        }));
        get().processQueue();
      },

      failDownload: (id, errorMsg) => {
        activeDownloadTasks.delete(id);
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'failed',
                  error: errorMsg || 'Download failed',
                }
              : item
          ),
        }));
        get().processQueue();
      },

      removeDownload: async (id) => {
        const instance = activeDownloadTasks.get(id);
        if (instance) {
          try {
            await instance.cancelAsync();
          } catch (e) {}
          activeDownloadTasks.delete(id);
        }

        set((state) => ({
          downloads: state.downloads.filter((item) => item.id !== id),
        }));
        get().processQueue();
      },

      cancelAllPending: async () => {
        const { downloads, removeDownload } = get();
        const nonCompletedIds = downloads
          .filter((d) => d.status !== 'completed')
          .map((d) => d.id);

        set((state) => ({
          downloads: state.downloads.filter((d) => d.status === 'completed'),
        }));

        await Promise.all(nonCompletedIds.map((id) => removeDownload(id)));
      },

      clearCompleted: () => {
        set((state) => ({
          downloads: state.downloads.filter((item) => item.status !== 'completed'),
        }));
      },
    }),
    {
      name: 'download-history-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        downloads: state.downloads
          .filter(
            (d) =>
              d.status === 'completed' ||
              d.status === 'failed' ||
              d.status === 'paused'
          )
          .map((d) =>
            d.status === 'downloading' || d.status === 'queued'
              ? { ...d, status: 'paused' }
              : d
          ),
      }),
    }
  )
);
