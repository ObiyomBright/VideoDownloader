import React from 'react';
import { View, StyleSheet } from 'react-native';
import useAppTheme from '../utils/Theme';

const ProgressBar = ({ progress = 0 }) => {
  const theme = useAppTheme();
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: theme.primary,
            width: `${clampedProgress * 100}%`,
          },
        ]}
      />
    </View>
  );
};

export default ProgressBar;

const styles = StyleSheet.create({
  track: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 6,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});