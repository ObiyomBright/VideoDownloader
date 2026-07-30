import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ThemedText from '../ThemedText';
import useAppTheme from '../../utils/Theme';
import { useNotification } from '../NotificationToast';

const AboutSection = () => {
  const theme = useAppTheme();
  const { showNotification } = useNotification();

  const handleClearCache = () => {
    showNotification('App cache cleared successfully', 'info');
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText style={styles.sectionTitle}>About Application</ThemedText>
      
      <View style={styles.infoRow}>
        <ThemedText style={[styles.label, { color: theme.subtext }]}>Version</ThemedText>
        <ThemedText style={styles.value}>1.0.0</ThemedText>
      </View>
      
    </View>
  );
};

export default AboutSection;

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});