import React, { useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    TouchableWithoutFeedback,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ClipboardModal = ({ visible, url, onPaste, onClose }) => {
    const theme = useAppTheme();
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(translateY, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    // Handle closing with smooth slide-down animation
    const handleDismiss = () => {
        Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    };

    const handlePaste = () => {
        Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            onPaste();
        });
    };

    if (!visible) return null;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="none"
            onRequestClose={handleDismiss}
        >
            {/* Overlay Background styled using theme text/background with opacity */}
            <TouchableWithoutFeedback onPress={handleDismiss}>
                <View
                    style={[
                        styles.overlay,
                        { backgroundColor: theme.text + '73' } // Theme-derived ~45% backdrop
                    ]}
                />
            </TouchableWithoutFeedback>

            {/* Bottom Sheet */}
            <Animated.View
                style={[
                    styles.modalContainer,
                    {
                        backgroundColor: theme.card,
                        transform: [{ translateY }],
                    },
                ]}
            >
                {/* Drag Bar */}
                <View style={[styles.dragBar, { backgroundColor: theme.border }]} />

                <View style={styles.header}>
                    <Ionicons name="link-outline" size={24} color={theme.text} />
                    <Text style={[styles.title, { color: theme.text }]}>
                        Link Detected
                    </Text>
                </View>

                <Text style={[styles.description, { color: theme.subtext }]}>
                    We found a copied link in your clipboard:
                </Text>

                {/* Copied Link Preview */}
                <View style={[styles.urlPreview, { backgroundColor: theme.background }]}>
                    <Text
                        numberOfLines={2}
                        style={[styles.urlText, { color: theme.text }]}
                    >
                        {url}
                    </Text>
                </View>

                {/* Buttons */}
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
                        onPress={handleDismiss}
                    >
                        <Text style={[styles.cancelText, { color: theme.subtext }]}>
                            Cancel
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: theme.primary }]}
                        onPress={handlePaste}
                    >
                        <Ionicons name="clipboard-outline" size={18} color={theme.card} style={{ marginRight: 6 }} />
                        <Text style={[styles.pasteText, { color: theme.card }]}>
                            Paste & Process
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Modal>
    );
};

export default ClipboardModal;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
    },
    modalContainer: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        minHeight: 240,
        maxHeight: SCREEN_HEIGHT * 0.5,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        alignItems: 'center',
    },
    dragBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        marginLeft: 8,
    },
    description: {
        fontSize: 14,
        marginBottom: 12,
        textAlign: 'center',
    },
    urlPreview: {
        width: '100%',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
    },
    urlText: {
        fontSize: 13,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    button: {
        flex: 1,
        height: 46,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    cancelButton: {
        borderWidth: 1,
    },
    cancelText: {
        fontWeight: '600',
    },
    pasteText: {
        fontWeight: '600',
    },
});