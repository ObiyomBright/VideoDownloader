import { View } from 'react-native'
import useAppTheme from '../utils/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ThemedView = ({ style, safe = false, ...props }) => {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();

    const safeStyle = safe ? {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
    } : {};

    return (
        <View
            style={[
                {
                    backgroundColor: theme.background,
                },
                safeStyle,
                style
            ]}
            {...props}
        />
    )
}

export default ThemedView