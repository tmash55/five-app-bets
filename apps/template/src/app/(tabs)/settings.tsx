import { SettingsScreen } from '@five/shell';
import Constants from 'expo-constants';

export default function Settings() {
  return (
    <SettingsScreen
      appName={Constants.expoConfig?.name ?? ''}
      appVersion={Constants.expoConfig?.version ?? ''}
    />
  );
}
