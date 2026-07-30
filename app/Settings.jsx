import React from 'react';
import { StyleSheet, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAppTheme from '../utils/Theme';
import { useThemeStore } from '../stores/useThemeStore';
import ThemeToggleSection from '../components/settings/ThemeToggleSection';
import StorageSection from '../components/settings/StorageSection';
import PathSection from '../components/settings/PathSection';
import AboutSection from '../components/settings/AboutSection';

const Settings = () => {
  const theme = useAppTheme();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>

        <ThemeToggleSection isDark={isDarkMode} onToggleTheme={toggleTheme} />
        <StorageSection />
        <PathSection />
        <AboutSection />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Settings;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 20,
  },
});