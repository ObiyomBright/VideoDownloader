// services/api.js or config.js
import Constants from 'expo-constants';

const configuredUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl;

export const BASE_URL = configuredUrl?.replace(/\/$/, '');
