import { Text } from 'react-native'
import useAppTheme from '../utils/Theme';

const ThemedText = ({ style, ...props }) => {
    const theme = useAppTheme();

    return (
        <Text
            style={[
                { color: theme.text },
                style
            ]}
            {...props}
        />
    )
}

export default ThemedText