import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';
import QualityDropdown from './QualityDropdown';

const PlaylistMediaView = ({ playlistData, onStartBatchDownload }) => {
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

    return (
        <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Playlist Info */}
            <View style={styles.header}>
                <Text numberOfLines={1} style={[styles.playlistTitle, { color: theme.text }]}>
                    {playlistData.title}
                </Text>
                <Text style={[styles.playlistMeta, { color: theme.subtext }]}>
                    {playlistData.items.length} Videos • {playlistData.platform}
                </Text>
            </View>

            {/* Global Format Selector */}
            <View style={[styles.formatHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Download Format:</Text>
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

            {/* Select All Row */}
            <View style={styles.actionRow}>
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
            </View>

            {/* Playlist Video Items List */}
            <FlatList
                data={playlistData.items}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                    const isSelected = selectedIds.includes(item.id);

                    return (
                        <View style={[styles.videoRow, { borderBottomColor: theme.border }]}>
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
                }}
            />

            {/* Batch Download Button */}
            <TouchableOpacity
                disabled={selectedIds.length === 0}
                style={[
                    styles.downloadBtn,
                    {
                        backgroundColor: selectedIds.length > 0 ? theme.primary : theme.border,
                    },
                ]}
                onPress={() =>
                    onStartBatchDownload({
                        format: globalFormat,
                        selectedIds,
                        qualities: itemQualities,
                    })
                }
            >
                <Ionicons name="download" size={18} color={theme.card} style={{ marginRight: 6 }} />
                <Text style={[styles.downloadBtnText, { color: theme.card }]}>
                    Download Selected ({selectedIds.length})
                </Text>
            </TouchableOpacity>
        </View>
    );
};

export default PlaylistMediaView;

const styles = StyleSheet.create({
    container: {
        width: '100%',
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 16,
    },
    header: {
        marginBottom: 12,
    },
    playlistTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    playlistMeta: {
        fontSize: 12,
        marginTop: 2,
    },
    formatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
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
    actionRow: {
        marginVertical: 10,
    },
    selectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
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
    downloadBtn: {
        height: 46,
        borderRadius: 10,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    downloadBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
});