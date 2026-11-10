import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';

import { formatReminderTime, type ReminderTime } from '../habits/reminders';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useTheme } from '../theme/ThemeProvider';
import { SettingsRow, SettingsSection } from '../ui/SettingsRow';
import { Text } from '../ui/Text';

function timeToDate(time: ReminderTime): Date {
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

/** Daily reminder on/off and time, for the settings screen. */
export function ReminderSettingsSection() {
  const theme = useTheme();
  const notifications = useNotifications();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { permission, reminder } = notifications;
  const blocked = permission.status === 'denied' && !permission.canAskAgain;
  const enabled = reminder.enabled && permission.status === 'granted';
  const timeLabel = formatReminderTime(reminder);

  function pickTime() {
    const value = timeToDate(reminder);
    const apply = (date?: Date) => {
      if (date) notifications.setReminderTime({ hour: date.getHours(), minute: date.getMinutes() });
    };
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        onChange: (event, date) => {
          if (event.type === 'set') apply(date);
        },
      });
    } else {
      setPickerOpen((open) => !open);
    }
  }

  return (
    <SettingsSection title="Notifications">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          gap: theme.spacing.md,
        }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text>Daily reminder</Text>
          {blocked ? (
            <Text variant="caption" color="textSecondary">
              Notifications are off for this app in system settings.
            </Text>
          ) : null}
        </View>
        <Switch
          accessibilityLabel="Daily reminder"
          value={enabled}
          disabled={blocked || !notifications.ready}
          onValueChange={(next) => notifications.setReminderEnabled(next)}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          thumbColor={theme.colors.background}
          ios_backgroundColor={theme.colors.border}
        />
      </View>
      {blocked ? (
        <SettingsRow label="Open system settings" onPress={() => Linking.openSettings()} />
      ) : null}
      {enabled ? (
        <SettingsRow label="Reminder time" detail={timeLabel} onPress={pickTime} />
      ) : null}
      {enabled && pickerOpen && Platform.OS === 'ios' ? (
        <View style={{ backgroundColor: theme.colors.surface, alignItems: 'center' }}>
          <DateTimePicker
            value={timeToDate(reminder)}
            mode="time"
            display="spinner"
            onValueChange={(_event, date) =>
              notifications.setReminderTime({ hour: date.getHours(), minute: date.getMinutes() })
            }
          />
        </View>
      ) : null}
    </SettingsSection>
  );
}
