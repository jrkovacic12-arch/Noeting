import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStyles } from "./styles";
export function Sheet({
  children,
  label,
  onDismiss,
  onBack,
  contentHeight = 220,
}: {
  children: ReactNode;
  label: string;
  onDismiss: () => void;
  onBack?: () => void;
  contentHeight?: number;
}) {
  const { styles, colors } = useStyles();
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [available, setAvailable] = useState(height);
  const slide = useRef(new Animated.Value(250)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [slide]);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -30) setExpanded(true);
        else if (g.dy > 60) dismiss.current();
      },
    }),
  ).current;
  function close() {
    if (Keyboard.isVisible()) Keyboard.dismiss();
    else (onBack ?? onDismiss)();
  }
  const maximum = Math.max(
    160,
    Math.min(available - 8, (height - insets.top - insets.bottom) * 0.82),
  );
  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        onLayout={(e) => setAvailable(e.nativeEvent.layout.height)}
        style={styles.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss task sheet"
          onPress={close}
          style={styles.backdrop}
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          testID="task-sheet"
          style={[
            styles.sheet,
            {
              height: Math.min(
                maximum,
                expanded
                  ? maximum
                  : Math.max(190, contentHeight * fontScale + insets.bottom),
              ),
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY: slide }],
            },
          ]}
        >
          <View {...pan.panHandlers}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                expanded ? "Collapse task sheet" : "Expand task sheet"
              }
              onPress={() => setExpanded((v) => !v)}
              style={styles.handleTarget}
            >
              <View
                style={[styles.handle, { backgroundColor: colors.muted }]}
              />
              <Text accessible={false} style={styles.sheetLabel}>
                {label}
              </Text>
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
