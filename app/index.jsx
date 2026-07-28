import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, Text, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import ThemedView from '../components/ThemedView';
import ThemedInput from '../components/ThemedInput';
import ClipboardModal from '../components/ClipboardModal';
import MediaDownloader from '../components/MediaDownloader';
import useAppTheme from '../utils/Theme';
import { fetchMediaInfo } from '../services/mediaService';

const Home = () => {
    const [url, setUrl] = useState('');
    const [detectedUrl, setDetectedUrl] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mediaData, setMediaData] = useState(null);

    const theme = useAppTheme();

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

    const handlePasteFromModal = () => {
        setUrl(detectedUrl);
        setModalVisible(false);
        processUrlDownload(detectedUrl);
    };

    const processUrlDownload = async (targetUrl) => {
        if (!targetUrl.trim()) return;
        setLoading(true);
        setMediaData(null);
        try {
            const data = await fetchMediaInfo(targetUrl.trim());
            setMediaData(data);
        } catch (error) {
            console.error('Extraction Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        processUrlDownload(url);
    };

    return (
        <ThemedView style={styles.container} safe={true}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.formContainer}>
                    {/* Input Field */}
                    <View style={styles.inputContainer}>
                        <ThemedInput
                            placeholder="Paste a video or file URL"
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={styles.input}
                            value={url}
                            onChangeText={setUrl}
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

                    {/* Download Button */}
                    <TouchableOpacity
                        style={[styles.downloadButton, { backgroundColor: theme.primary }]}
                        onPress={handleDownload}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="download-outline" size={20} color={theme.card} style={{ marginRight: 8 }} />
                        <Text style={[styles.downloadButtonText, { color: theme.card }]}>Download</Text>
                    </TouchableOpacity>

                    {/* Extracted Media Details / Playlist Options */}
                    <MediaDownloader loading={loading} mediaData={mediaData} />
                </View>
            </ScrollView>

            {/* Clipboard Detection Modal */}
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
        flex: 1
    },
    scrollContent: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    formContainer: {
        width: '90%',
        maxWidth: 600,
        alignItems: 'center',
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