import * as NavigationBar from "expo-navigation-bar";
import { useEffect } from "react";

import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import colors from "../utils/Colors";

import useAppTheme from '../utils/Theme';

const RootLayout = () => {
    const theme = useAppTheme();
    const isDark = theme === colors.dark;

    useEffect(() => {
        NavigationBar.setBackgroundColorAsync(theme.background);
        NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
    }, [theme, isDark]);

    return (
        <>
            <StatusBar style="auto" />

            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: theme.background,
                        borderTopColor: theme.border,
                        height: 68,
                        paddingTop: 8,
                        paddingBottom: 10,
                    },
                    tabBarLabelStyle: {
                        fontSize: 12,
                        fontWeight: "700",
                    },
                    tabBarActiveTintColor: theme.primary,
                    tabBarInactiveTintColor: theme.textSecondary,
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
        </>
    );
};

export default RootLayout;