import React from 'react';
import { StyleSheet, View, Text, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../../utils/Theme';

const ThemeToggleSection = ({ isDark, onToggleTheme }) => {
  const theme = useAppTheme();

  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.subtext }]}>APPEARANCE</Text>

      <View style={styles.row}>
        <View style={styles.iconWrapper}>
          <Ionicons
            name={isDark ? 'moon-outline' : 'sunny-outline'}
            size={20}
            color={theme.primary}
          />
        </View>

        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Dark Mode</Text>
          <Text style={[styles.rowSubtitle, { color: theme.subtext }]}>
            {isDark ? 'Dark theme enabled' : 'Light theme enabled'}
          </Text>
        </View>

        <Switch
          value={isDark}
          onValueChange={onToggleTheme}
          trackColor={{ false: '#767577', true: theme.primary }}
          thumbColor={isDark ? '#FFFFFF' : '#f4f3f4'}
        />
      </View>
    </View>
  );
};

export default ThemeToggleSection;

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