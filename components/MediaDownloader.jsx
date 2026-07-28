import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    FlatList,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';
import { downloadMediaPayload } from '../services/mediaService';

/* ---------------- Quality Dropdown Component ---------------- */
const QualityDropdown = ({ options, selectedValue, onSelect }) => {
    const theme = useAppTheme();
    const [isOpen, setIsOpen] = useState(false);

    const currentOption = options?.find((opt) => opt.value === selectedValue) || options?.[0];

    return (
        <View>
            <TouchableOpacity
                style={[
                    styles.dropdownBtn,
                    {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                    },
                ]}
                onPress={() => setIsOpen(true)}
                activeOpacity={0.7}
            >
                <Text style={[styles.dropdownBtnText, { color: theme.text }]}>
                    {currentOption?.label || 'Select Quality'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.subtext} />
            </TouchableOpacity>

            <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
                <TouchableOpacity
                    style={[styles.modalOverlay, { backgroundColor: theme.text + '73' }]}
                    activeOpacity={1}
                    onPress={() => setIsOpen(false)}
                >
                    <View style={[styles.dropdownList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <FlatList
                            data={options}
                            keyExtractor={(item) => item.value}
                            renderItem={({ item }) => {
                                const isSelected = item.value === selectedValue;
                                return (
                                    <TouchableOpacity
                                        style={[
                                            styles.optionItem,
                                            {
                                                backgroundColor: isSelected ? theme.primary + '15' : theme.card,
                                                borderBottomColor: theme.border,
                                            },
                                        ]}
                                        onPress={() => {
                                            onSelect(item.value);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.optionText,
                                                {
                                                    color: isSelected ? theme.primary : theme.text,
                                                    fontWeight: isSelected ? '700' : '400',
                                                },
                                            ]}
                                        >
                                            {item.label} ({item.size})
                                        </Text>
                                        {isSelected && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

/* ---------------- Single Media View ---------------- */
const SingleMediaView = ({ mediaData }) => {
    const theme = useAppTheme();
    const [selectedQuality, setSelectedQuality] = useState(mediaData.qualities?.[0]?.value || '');
    const [selectedFormat, setSelectedFormat] = useState('mp4');

    const activeQualityObj = mediaData.qualities?.find((q) => q.value === selectedQuality);

    const handleDownload = () => {
        downloadMediaPayload({
            type: 'single',
            title: mediaData.title,
            format: selectedFormat,
            quality: selectedQuality,
        });
    };

    return (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.headerRow}>
                <Ionicons name="film-outline" size={28} color={theme.primary} />
                <View style={styles.titleContainer}>
                    <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
                        {mediaData.title}
                    </Text>
                    <Text style={[styles.subtext, { color: theme.subtext }]}>
                        Source: {mediaData.platform} • {activeQualityObj?.size || mediaData.fileSize}
                    </Text>
                </View>
            </View>

            {/* Format Switcher */}
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

            {/* Quality Dropdown */}
            {selectedFormat === 'mp4' && (
                <View style={styles.qualityRow}>
                    <Text style={[styles.label, { color: theme.text }]}>Quality:</Text>
                    <QualityDropdown
                        options={mediaData.qualities}
                        selectedValue={selectedQuality}
                        onSelect={setSelectedQuality}
                    />
                </View>
            )}

            <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: theme.primary }]}
                onPress={handleDownload}
            >
                <Ionicons name="download" size={18} color={theme.card} style={{ marginRight: 6 }} />
                <Text style={[styles.downloadBtnText, { color: theme.card }]}>Download File</Text>
            </TouchableOpacity>
        </View>
    );
};

/* ---------------- Playlist Media View ---------------- */
const PlaylistMediaView = ({ playlistData }) => {
    const theme = useAppTheme();
    const [globalFormat, setGlobalFormat] = useState('mp4');
    const [selectedIds, setSelectedIds] = useState(playlistData.items.map((item) => item.id));
    const [itemQualities, setItemQualities] = useState(
        playlistData.items.reduce((acc, item) => ({ ...acc, [item.id]: item.qualities[0].value }), {})
    );

    const toggleSelectAll = () => {
        if (selectedIds.length === playlistData.items.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(playlistData.items.map((item) => item.id));
        }
    };

    const toggleItemSelect = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    };

    const updateItemQuality = (id, quality) => {
        setItemQualities((prev) => ({ ...prev, [id]: quality }));
    };

    const handleBatchDownload = () => {
        downloadMediaPayload({
            type: 'playlist',
            format: globalFormat,
            selectedIds,
            qualities: itemQualities,
        });
    };

    return (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.headerRow}>
                <Ionicons name="albums-outline" size={28} color={theme.primary} />
                <View style={styles.titleContainer}>
                    <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
                        {playlistData.title}
                    </Text>
                    <Text style={[styles.subtext, { color: theme.subtext }]}>
                        {playlistData.items.length} Videos • {playlistData.platform}
                    </Text>
                </View>
            </View>

            {/* Global Format Selector */}
            <View style={[styles.formatHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.label, { color: theme.text }]}>Format:</Text>
                <View style={styles.checkboxContainer}>
                    {['mp4', 'mp3'].map((fmt) => (
                        <TouchableOpacity
                            key={fmt}
                            style={styles.checkboxOption}
                            onPress={() => setGlobalFormat(fmt)}
                        >
                            <Ionicons
                                name={globalFormat === fmt ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={theme.primary}
                            />
                            <Text style={[styles.checkboxLabel, { color: theme.text }]}>{fmt.toUpperCase()}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Select All Action */}
            <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
                <Ionicons
                    name={selectedIds.length === playlistData.items.length ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={theme.primary}
                />
                <Text style={[styles.selectAllText, { color: theme.text }]}>
                    Select All ({selectedIds.length}/{playlistData.items.length})
                </Text>
            </TouchableOpacity>

            {/* Items List */}
            {playlistData.items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                    <View key={item.id} style={[styles.videoRow, { borderBottomColor: theme.border }]}>
                        <TouchableOpacity style={styles.checkbox} onPress={() => toggleItemSelect(item.id)}>
                            <Ionicons
                                name={isSelected ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={isSelected ? theme.primary : theme.subtext}
                            />
                        </TouchableOpacity>

                        <View style={styles.videoInfo}>
                            <Text numberOfLines={1} style={[styles.videoTitle, { color: theme.text }]}>
                                {item.title}
                            </Text>
                            <Text style={[styles.videoDuration, { color: theme.subtext }]}>
                                {item.duration}
                            </Text>
                        </View>

                        {globalFormat === 'mp4' && (
                            <QualityDropdown
                                options={item.qualities}
                                selectedValue={itemQualities[item.id]}
                                onSelect={(q) => updateItemQuality(item.id, q)}
                            />
                        )}
                    </View>
                );
            })}

            <TouchableOpacity
                disabled={selectedIds.length === 0}
                style={[
                    styles.downloadBtn,
                    {
                        backgroundColor: selectedIds.length > 0 ? theme.primary : theme.border,
                    },
                ]}
                onPress={handleBatchDownload}
            >
                <Ionicons name="download" size={18} color={theme.card} style={{ marginRight: 6 }} />
                <Text style={[styles.downloadBtnText, { color: theme.card }]}>
                    Download Selected ({selectedIds.length})
                </Text>
            </TouchableOpacity>
        </View>
    );
};

/* ---------------- Main Container Component ---------------- */
const MediaDownloader = ({ loading, mediaData }) => {
    const theme = useAppTheme();

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.subtext }]}>
                    Fetching media details & download formats...
                </Text>
            </View>
        );
    }

    if (!mediaData) return null;

    return mediaData.isPlaylist ? (
        <PlaylistMediaView playlistData={mediaData} />
    ) : (
        <SingleMediaView mediaData={mediaData} />
    );
};

export default MediaDownloader;

const styles = StyleSheet.create({
    card: {
        width: '100%',
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 20,
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
        fontSize: 15,
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
    dropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        minWidth: 110,
    },
    dropdownBtnText: {
        fontSize: 12,
        fontWeight: '600',
        marginRight: 6,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    dropdownList: {
        width: '85%',
        maxWidth: 320,
        maxHeight: 280,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    optionText: {
        fontSize: 14,
    },
    formatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkboxContainer: {
        flexDirection: 'row',
        gap: 16,
    },
    checkboxOption: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkboxLabel: {
        fontSize: 13,
        marginLeft: 6,
        fontWeight: '600',
    },
    selectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 12,
    },
    selectAllText: {
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 8,
    },
    videoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkbox: {
        paddingRight: 10,
    },
    videoInfo: {
        flex: 1,
        marginRight: 8,
    },
    videoTitle: {
        fontSize: 13,
        fontWeight: '500',
    },
    videoDuration: {
        fontSize: 11,
        marginTop: 2,
    },
    loadingContainer: {
        padding: 24,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 13,
    },
});