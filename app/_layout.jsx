import { useEffect } from "react";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as NavigationBar from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

import colors from "../utils/Colors";
import useAppTheme from "../utils/Theme";
import { NotificationProvider } from "../components/NotificationToast";

const RootLayout = () => {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const isDark = theme === colors.dark;

    useEffect(() => {
        if (Platform.OS === 'android') {
            const syncNativeTheme = async () => {
                try {
                    // 1. Change the underlying native window background (eliminates the default white root)
                    await SystemUI.setBackgroundColorAsync(theme.background);

                    // 2. Disable Android's forced white contrast scrim
                    await NavigationBar.setEnforceContrastAsync(false);

                    // 3. Set navigation bar background color to match current theme
                    await NavigationBar.setBackgroundColorAsync(theme.background);

                    // 4. Update button icon contrast (light icons for dark mode, dark icons for light mode)
                    await NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
                } catch (error) {
                    console.error("Error setting navigation bar style:", error);
                }
            };

            syncNativeTheme();
        }
    }, [theme.background, isDark]);

    return (
        <NotificationProvider>
            <StatusBar style={isDark ? "light" : "dark"} />

            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: theme.background,
                        borderTopColor: theme.border,
                        paddingTop: 8,
                        paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 12,
                        height: 60 + insets.bottom,
                    },
                    tabBarLabelStyle: {
                        fontSize: 12,
                        fontWeight: "700",
                        paddingBottom: 4,
                    },
                    tabBarActiveTintColor: theme.primary,
                    tabBarInactiveTintColor: theme.subtext,
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: "Search",
                        tabBarIcon: ({ color, size, focused }) => (
                            <Ionicons
                                name={focused ? "search" : "search-outline"}
                                size={size}
                                color={color}
                            />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="Downloads"
                    options={{
                        title: "Downloads",
                        tabBarIcon: ({ color, size, focused }) => (
                            <Ionicons
                                name={focused ? "download" : "download-outline"}
                                size={size}
                                color={color}
                            />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="Settings"
                    options={{
                        title: "Settings",
                        tabBarIcon: ({ color, size, focused }) => (
                            <Ionicons
                                name={focused ? "settings" : "settings-outline"}
                                size={size}
                                color={color}
                            />
                        ),
                    }}
                />
            </Tabs>
        </NotificationProvider>
    );
};

export default RootLayout;