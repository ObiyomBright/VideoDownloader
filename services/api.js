// services/api.js or config.js
import Constants from 'expo-constants';

const PORT = 5000; // Your Express/backend port

// In dev, Expo gets your machine's host IP automatically (e.g. 192.168.x.x)
const hostUri = Constants.expoConfig?.hostUri;
const devHost = hostUri ? hostUri.split(':').shift() : 'localhost';

export const BASE_URL = __DEV__
  ? `http://${devHost}:${PORT}`
  : 'https://api.yourproductiondomain.com';