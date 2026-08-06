// services/api.js or config.js
import Constants from 'expo-constants';

const LIVE_API_URL = 'https://videodownloader-api-ze27.onrender.com';
const configuredUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  LIVE_API_URL;

export const BASE_URL = configuredUrl?.replace(/\/$/, '');
