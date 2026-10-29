import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type SheetAction = { text: string; destructive?: boolean; onPress: () => void };

/** Native action sheet on iOS; a simple alert list elsewhere. */
export function showActions(title: string | undefined, actions: SheetAction[], message?: string) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...actions.map((a) => a.text), 'Cancel'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: actions.flatMap((a, i) => (a.destructive ? [i] : [])),
      },
      (index) => actions[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title ?? '', message, [
    ...actions.map((a) => ({ text: a.text, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.onPress })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
