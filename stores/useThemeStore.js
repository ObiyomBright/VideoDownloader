import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

const getInitialDarkMode = () => Appearance.getColorScheme() === 'dark';

export const useThemeStore = create(
  persist(
    (set) => ({
      isDarkMode: getInitialDarkMode(),

      toggleTheme: () =>
        set((state) => ({
          isDarkMode: !state.isDarkMode,
        })),

      setDarkMode: (isDark) =>
        set(() => ({
          isDarkMode: isDark,
        })),
    }),
    {
      name: 'app-theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export const getThemeColors = (isDarkMode) => ({
  dark: isDarkMode,
  background: isDarkMode ? '#0F172A' : '#F8FAFC',
  card: isDarkMode ? '#1E293B' : '#FFFFFF',
  text: isDarkMode ? '#F8FAFC' : '#0F172A',
  subtext: isDarkMode ? '#94A3B8' : '#64748B',
  border: isDarkMode ? '#334155' : '#E2E8F0',
  primary: '#6366F1',
});