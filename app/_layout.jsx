import { useEffect } from "react";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as NavigationBar from "expo-navigation-bar";
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
            NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
            NavigationBar.setBackgroundColorAsync(theme.background);
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
                        title: "Paste",
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