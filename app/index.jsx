import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard'; 

import ThemedView from '../components/ThemedView';
import ThemedInput from '../components/ThemedInput';
import ClipboardModal from '../components/ClipboardModal';
import useAppTheme from '../utils/Theme';

const Home = () => {
    const [url, setUrl] = useState('');
    const [detectedUrl, setDetectedUrl] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
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
    };

    const handleDownload = () => {
        if (!url.trim()) return;
        // Submit logic goes here
        console.log('Downloading from URL:', url);
    };

    return (
        <ThemedView style={styles.container} safe={true}>
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
                            onPress={() => setUrl('')}
                        >
                            <Ionicons name="close-circle" size={20} color={theme.text} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Download Button */}
                <TouchableOpacity
                    style={[styles.downloadButton, {backgroundColor: theme.primary}]}
                    onPress={handleDownload}
                    activeOpacity={0.8}
                >
                    <Ionicons name="download-outline" size={20} color={theme.text} style={{ marginRight: 8 }} />
                    <Text style={[styles.downloadButtonText, {color:theme.text}]}>Download</Text>
                </TouchableOpacity>
            </View>
 
            {/* Snaptube-style Clipboard Modal */}
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
        justifyContent: 'center',
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