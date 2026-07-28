import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useAppTheme from '../utils/Theme';

const QualityDropdown = ({ options, selectedValue, onSelect }) => {
    const theme = useAppTheme();
    const [isOpen, setIsOpen] = useState(false);

    const currentOption = options.find((opt) => opt.value === selectedValue) || options[0];

    return (
        <View>
            <TouchableOpacity
                style={[
                    styles.button,
                    {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                    },
                ]}
                onPress={() => setIsOpen(true)}
                activeOpacity={0.7}
            >
                <Text style={[styles.buttonText, { color: theme.text }]}>
                    {currentOption?.label || 'Select Quality'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.subtext} />
            </TouchableOpacity>

            <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
                <TouchableOpacity
                    style={[styles.modalOverlay, { backgroundColor: theme.text + '60' }]}
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

export default QualityDropdown;

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        minWidth: 120,
    },
    buttonText: {
        fontSize: 13,
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
});