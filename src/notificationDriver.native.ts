import * as Notifications from 'expo-notifications';

/** Upgrade cleanup only. Never requests permission or schedules a notification. */
export async function clearLegacyNotifications(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of pending) {
    if (item.identifier.startsWith('noeting-reminder:')) await Notifications.cancelScheduledNotificationAsync(item.identifier);
  }
}
