import { useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStyles } from "./styles";
export type Anchor = { x: number; y: number; width: number; height: number };
export function Popover({
  children,
  onClose,
  anchor,
}: {
  children: ReactNode;
  onClose: () => void;
  anchor?: Anchor;
}) {
  const { styles, colors } = useStyles();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboard(e.endCoordinates.height),
    );
    const b = Keyboard.addListener("keyboardDidHide", () => setKeyboard(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  const available = Math.max(100, height - keyboard - insets.bottom - 16);
  const top = Math.min(
    anchor ? anchor.y + anchor.height : insets.top + 60,
    Math.max(insets.top + 8, available - 300),
  );
  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{ flex: 1, backgroundColor: colors.overlay }}
        testID="popover-scrim"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close options"
          style={{ position: "absolute", inset: 0 }}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel="Options"
          style={[
            styles.menu,
            {
              position: "absolute",
              top,
              left: Math.max(
                8,
                Math.min(anchor?.x ?? width - 280, width - 280),
              ),
              width: 264,
              maxHeight: available - top,
              marginHorizontal: 0,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
