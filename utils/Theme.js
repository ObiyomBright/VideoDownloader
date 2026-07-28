import { useColorScheme } from "react-native"
import colors from "./Colors";

const useAppTheme = () => {
    const colorScheme = useColorScheme();
    const useAppTheme = colors[colorScheme] || colors.light;

    return useAppTheme;
}

export default useAppTheme;