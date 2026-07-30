import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const activeDownloadTasks = new Map();

export const useDownloadStore = create(
  persist(
    (set, get) => ({
      downloads: [],

      registerResumable: (id, resumableInstance) => {
        activeDownloadTasks.set(id, resumableInstance);
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
          progress: 0,
          status: 'pending', // 'pending' | 'downloading' | 'paused' | 'completed' | 'failed'
          createdAt: new Date().toISOString(),
          localUri: null,
          resumeData: null,
          error: null,
        };
        set((state) => ({ downloads: [newTask, ...state.downloads] }));
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
        // Optimistically set UI state to 'paused' immediately
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id ? { ...item, status: 'paused' } : item
          ),
        }));

        const instance = activeDownloadTasks.get(id);
        let savedResumeData = null;

        if (instance) {
          try {
            const pauseResult = await instance.pauseAsync();
            savedResumeData = pauseResult?.resumeData || null;
          } catch (err) {
            console.error('Error pausing task:', err);
          }
        }

        if (savedResumeData) {
          set((state) => ({
            downloads: state.downloads.map((item) =>
              item.id === id ? { ...item, resumeData: savedResumeData } : item
            ),
          }));
        }
      },

      pauseAllDownloads: async () => {
        const { downloads, pauseDownload } = get();
        const activeIds = downloads
          .filter((d) => d.status === 'downloading' || d.status === 'pending')
          .map((d) => d.id);

        // Optimistically set all active items to paused immediately
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.status === 'downloading' || item.status === 'pending'
              ? { ...item, status: 'paused' }
              : item
          ),
        }));

        await Promise.all(activeIds.map((id) => pauseDownload(id)));
      },

      resumeAllDownloads: () => {
        // Optimistically set all paused/failed items to downloading immediately
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.status === 'paused' || item.status === 'failed'
              ? { ...item, status: 'downloading' }
              : item
          ),
        }));
      },

      cancelAllPending: async () => {
        const { downloads, removeDownload } = get();
        const pendingIds = downloads
          .filter((d) => d.status !== 'completed')
          .map((d) => d.id);

        // Optimistically remove pending items immediately
        set((state) => ({
          downloads: state.downloads.filter((d) => d.status === 'completed'),
        }));

        await Promise.all(pendingIds.map((id) => removeDownload(id)));
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
                }
              : item
          ),
        }));
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
                  resumeData: null,
                }
              : item
          ),
        }));
      },

      removeDownload: async (id) => {
        const instance = activeDownloadTasks.get(id);
        if (instance) {
          try {
            await instance.cancelAsync();
          } catch (e) {
            // Ignore cancel errors
          }
          activeDownloadTasks.delete(id);
        }

        set((state) => ({
          downloads: state.downloads.filter((item) => item.id !== id),
        }));
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
          .filter((d) => d.status === 'completed' || d.status === 'failed' || d.status === 'paused')
          .map((d) => (d.status === 'downloading' ? { ...d, status: 'paused' } : d)),
      }),
    }
  )
);