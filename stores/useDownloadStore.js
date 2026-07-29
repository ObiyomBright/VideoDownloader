import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Storage } from 'expo-sqlite/kv-store';

// Custom storage wrapper for Zustand using Expo's KV Store
const expoKvStorage = {
  getItem: async (name) => {
    const value = await Storage.getItem(name);
    return value ?? null;
  },
  setItem: async (name, value) => {
    await Storage.setItem(name, value);
  },
  removeItem: async (name) => {
    await Storage.removeItem(name);
  },
};

export const useDownloadStore = create(
  persist(
    (set, get) => ({
      downloads: [],

      addDownload: (task) => {
        const newTask = {
          id: task.id || Date.now().toString(),
          title: task.title || 'Untitled Media',
          url: task.url,
          fileSize: task.fileSize || 'Unknown',
          progress: 0,
          status: 'pending',
          createdAt: new Date().toISOString(),
          localUri: null,
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

      completeDownload: (id, localUri) => {
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id
              ? { ...item, progress: 1, status: 'completed', localUri }
              : item
          ),
        }));
      },

      failDownload: (id, errorMsg) => {
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === id
              ? { ...item, status: 'failed', error: errorMsg }
              : item
          ),
        }));
      },

      removeDownload: (id) => {
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
      storage: createJSONStorage(() => expoKvStorage),
      partialize: (state) => ({
        downloads: state.downloads.filter(
          (d) => d.status === 'completed' || d.status === 'failed'
        ),
      }),
    }
  )
);