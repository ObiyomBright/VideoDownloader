import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    TouchableOpacity,
    Text,
    View,
    ScrollView,
    Animated,
    Keyboard,
    Platform,
    Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import ThemedView from '../components/ThemedView';
import ThemedInput from '../components/ThemedInput';
import ClipboardModal from '../components/ClipboardModal';
import MediaDownloader from '../components/MediaDownloader';
import useAppTheme from '../utils/Theme';
import { fetchMediaInfo } from '../services/mediaService';
import { useNotification } from '../components/NotificationToast';

const Home = () => {
    const [url, setUrl] = useState('');
    const [detectedUrl, setDetectedUrl] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mediaData, setMediaData] = useState(null);

    const theme = useAppTheme();
    const { showNotification } = useNotification();

    const translateY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const onKeyboardShow = (event) => {
            const shiftDistance = mediaData ? -120 : -80;

            Animated.timing(translateY, {
                toValue: shiftDistance,
                duration: event.duration || 220,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        };

        const onKeyboardHide = (event) => {
            Animated.timing(translateY, {
                toValue: 0,
                duration: event.duration || 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        };

        const showSubscription = Keyboard.addListener(showEvent, onKeyboardShow);
        const hideSubscription = Keyboard.addListener(hideEvent, onKeyboardHide);

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, [mediaData, translateY]);

    const isValidUrl = (string) => {
        try {
            return string.startsWith('http://') || string.startsWith('https://');
        } catch {
            return false;
        }
    };

    const checkClipboard = async () => {
        const text = await Clipboard.getStringAsync();
        if (text && isValidUrl(text.trim())) {
            setDetectedUrl(text.trim());
            setModalVisible(true);
        }
    };

    useEffect(() => {
        checkClipboard();
    }, []);

    const handleUrlChange = (text) => {
        setUrl(text);
        if (mediaData) {
            setMediaData(null);
        }
    };

    const handlePasteFromModal = () => {
        setUrl(detectedUrl);
        setModalVisible(false);
        processUrlDownload(detectedUrl);
    };

    const processUrlDownload = async (targetUrl) => {
        if (!targetUrl.trim()) {
            showNotification('Please enter a media URL.', 'error');
            return;
        }
        setLoading(true);
        setMediaData(null);
        showNotification('Fetching media information...', 'info');
        try {
            const data = await fetchMediaInfo(targetUrl.trim(), showNotification);
            setMediaData(data);
            showNotification('Media info extracted successfully!', 'success');
        } catch (error) {
            console.error('Extraction Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        Keyboard.dismiss();
        processUrlDownload(url);
    };

    return (
        <ThemedView style={styles.container} safe={true}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Animated.View
                    style={[
                        styles.formContainer,
                        { transform: [{ translateY }] },
                    ]}
                >
                    <View style={styles.inputContainer}>
                        <ThemedInput
                            placeholder="Paste a video or file URL"
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={styles.input}
                            value={url}
                            onChangeText={handleUrlChange}
                            returnKeyType="go"
                            onSubmitEditing={handleDownload}
                        />

                        {url.length > 0 && (
                            <TouchableOpacity
                                style={styles.iconContainer}
                                onPress={() => {
                                    setUrl('');
                                    setMediaData(null);
                                }}
                            >
                                <Ionicons name="close-circle" size={20} color={theme.text} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {!mediaData && !loading && (
                        <TouchableOpacity
                            style={[styles.downloadButton, { backgroundColor: theme.primary }]}
                            onPress={handleDownload}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="download-outline" size={20} color={theme.text} style={{ marginRight: 8 }} />
                            <Text style={[styles.downloadButtonText, { color: theme.text }]}>Download</Text>
                        </TouchableOpacity>
                    )}

                    <MediaDownloader loading={loading} mediaData={mediaData} />
                </Animated.View>
            </ScrollView>

            <ClipboardModal
                visible={modalVisible}
                url={detectedUrl}
                onPaste={handlePasteFromModal}
                onClose={() => setModalVisible(false)}
            />
        </ThemedView>
    );
};

export default Home;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 24,
    },
    formContainer: {
        width: '90%',
        maxWidth: 600,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputContainer: {
        width: '100%',
        height: 56,
        justifyContent: 'center',
    },
    input: {
        width: '100%',
        height: '100%',
        paddingRight: 44,
    },
    iconContainer: {
        position: 'absolute',
        right: 14,
        alignSelf: 'center',
    },
    downloadButton: {
        width: '100%',
        height: 52,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    downloadButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
});