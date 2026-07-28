import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import useAppTheme from '../utils/Theme';

const ThemedInput = ({ style, ...props }) => {
    const theme = useAppTheme();

    return (
        <TextInput
            placeholderTextColor={theme.subtext}
            style={[
                styles.input,
                {
                    backgroundColor: theme.card,
                    color: theme.text,
                    borderColor: theme.border,
                },
                style,
            ]}
            {...props}
        />
    );
};

export default ThemedInput;

const styles = StyleSheet.create({
    input: {
        height: 52,
        width: 100,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
    },
});