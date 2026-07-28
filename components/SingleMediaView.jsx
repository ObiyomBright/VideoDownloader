import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';
import QualityDropdown from './QualityDropdown';

const SingleMediaView = ({ mediaData, onStartDownload }) => {
    const theme = useAppTheme();
    const [selectedQuality, setSelectedQuality] = useState(mediaData.qualities?.[0]?.value || '');
    const [selectedFormat, setSelectedFormat] = useState(mediaData.type === 'video' ? 'mp4' : 'mp3');

    const activeQualityObj = mediaData.qualities?.find((q) => q.value === selectedQuality);

    return (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.headerRow}>
                <Ionicons
                    name={mediaData.type === 'video' ? 'film-outline' : 'document-attach-outline'}
                    size={28}
                    color={theme.primary}
                />
                <View style={styles.titleContainer}>
                    <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
                        {mediaData.title}
                    </Text>
                    <Text style={[styles.subtext, { color: theme.subtext }]}>
                        Source: {mediaData.platform} • {activeQualityObj?.size || mediaData.fileSize || 'Unknown Size'}
                    </Text>
                </View>
            </View>

            {/* Format Switcher */}
            {mediaData.type === 'video' && (
                <View style={styles.formatRow}>
                    <Text style={[styles.label, { color: theme.text }]}>Format:</Text>
                    <View style={styles.formatToggleGroup}>
                        {['mp4', 'mp3'].map((fmt) => (
                            <TouchableOpacity
                                key={fmt}
                                style={[
                                    styles.formatBadge,
                                    {
                                        backgroundColor: selectedFormat === fmt ? theme.primary : theme.background,
                                        borderColor: theme.border,
                                    },
                                ]}
                                onPress={() => setSelectedFormat(fmt)}
                            >
                                <Text
                                    style={[
                                        styles.formatBadgeText,
                                        { color: selectedFormat === fmt ? theme.card : theme.text },
                                    ]}
                                >
                                    {fmt.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Quality Selector */}
            {mediaData.type === 'video' && selectedFormat === 'mp4' && (
                <View style={styles.qualityRow}>
                    <Text style={[styles.label, { color: theme.text }]}>Quality:</Text>
                    <QualityDropdown
                        options={mediaData.qualities}
                        selectedValue={selectedQuality}
                        onSelect={setSelectedQuality}
                    />
                </View>
            )}

            {/* Download Button */}
            <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: theme.primary }]}
                onPress={() => onStartDownload({ format: selectedFormat, quality: selectedQuality })}
            >
                <Ionicons name="download" size={18} color={theme.card} style={{ marginRight: 6 }} />
                <Text style={[styles.downloadBtnText, { color: theme.card }]}>Download Now</Text>
            </TouchableOpacity>
        </View>
    );
};

export default SingleMediaView;

const styles = StyleSheet.create({
    card: {
        width: '100%',
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleContainer: {
        flex: 1,
        marginLeft: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
    },
    subtext: {
        fontSize: 12,
        marginTop: 2,
    },
    formatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
    },
    formatToggleGroup: {
        flexDirection: 'row',
        gap: 8,
    },
    formatBadge: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    formatBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    qualityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    downloadBtn: {
        height: 46,
        borderRadius: 10,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 18,
    },
    downloadBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
});