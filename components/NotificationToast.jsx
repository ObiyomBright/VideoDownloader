import React, { createContext, useContext, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';

const NotificationContext = createContext({
  showNotification: (message, type) => {},
});

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const theme = useAppTheme();

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });

    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: 20,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3500),
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setNotification(null));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'alert-circle';
      case 'info':
      default:
        return 'info';
    }
  };

  const getAccentColor = (type) => {
    switch (type) {
      case 'success':
        return '#22C55E';
      case 'error':
        return '#EF4444';
      case 'info':
      default:
        return theme.primary;
    }
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notification && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              backgroundColor: theme.card,
              borderColor: getAccentColor(notification.type),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Feather
            name={getIcon(notification.type)}
            size={20}
            color={getAccentColor(notification.type)}
            style={styles.icon}
          />
          <Text style={[styles.toastText, { color: theme.text }]} numberOfLines={2}>
            {notification.message}
          </Text>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    marginRight: 12,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});