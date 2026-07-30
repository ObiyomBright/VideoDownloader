import { useColorScheme } from "react-native";
import colors from "./Colors";
import { useThemeStore } from "../stores/useThemeStore";

const useAppTheme = () => {
  const systemColorScheme = useColorScheme() || 'light';
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  // If Zustand has a preference set, use it; otherwise fall back to system color scheme
  const activeScheme = isDarkMode !== undefined 
    ? (isDarkMode ? 'dark' : 'light') 
    : systemColorScheme;

  return colors[activeScheme] || colors.light;
};

export default useAppTheme;