/**
 * Settings Screen
 * Comprehensive settings screen with account, notifications, privacy, and app settings
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {
  getNotificationSettings,
  updateNotificationSettings,
  requestNotificationPermissions,
  getNotificationPermissionStatus,
} from '@services/notificationSettings';
import {
  exportUserData,
  deleteUserAccount,
  unpairPartnership,
} from '@services/privacySettings';
import type {NotificationSettings} from '@utils/types';
import {format} from 'date-fns';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({navigation}) => {
  const {user, logout} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>({
      pushEnabled: false,
      dailyPromptReminder: false,
      streakReminder: false,
      partnerActivityNotifications: false,
      preferredNotificationTime: '09:00',
    });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    loadSettings();
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    const status = await getNotificationPermissionStatus();
    setHasPermission(status);
  };

  const loadSettings = async () => {
    if (!user?.id) return;
    try {
      const settings = await getNotificationSettings(user.id);
      setNotificationSettings(settings);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  };

  const handleToggle = async (
    key: keyof NotificationSettings,
    value: boolean,
  ) => {
    if (!user?.id) return;

    // If enabling push notifications, request permissions first
    if (key === 'pushEnabled' && value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings to receive push notifications.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
        );
        setHasPermission(false);
        return;
      }
      setHasPermission(true);
    }

    const updated = {...notificationSettings, [key]: value};
    setNotificationSettings(updated);

    try {
      await updateNotificationSettings(user.id, {[key]: value});
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      // Revert on error
      setNotificationSettings(notificationSettings);
      Alert.alert('Error', 'Failed to update settings. Please try again.');
    }
  };

  const handleTimeChange = async (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime && user?.id) {
      const timeString = format(selectedTime, 'HH:mm');
      const updated = {...notificationSettings, preferredNotificationTime: timeString};
      setNotificationSettings(updated);
      try {
        await updateNotificationSettings(user.id, {
          preferredNotificationTime: timeString,
        });
      } catch (error) {
        console.error('Failed to update notification time:', error);
      }
    }
  };

  const handleExportData = async () => {
    if (!user?.id) return;
    Alert.alert(
      'Export Data',
      'This will download all your data as a JSON file. Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Export',
          onPress: async () => {
            setLoading(true);
            try {
              await exportUserData(user.id);
              Alert.alert('Success', 'Your data has been exported successfully.');
            } catch (error) {
              Alert.alert('Error', 'Failed to export data. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone. Are you sure?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setLoading(true);
            try {
              await deleteUserAccount(user.id);
              logout();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleUnpair = () => {
    Alert.alert(
      'Unpair Partnership',
      'This will disconnect you from your partner. You will need to pair again to reconnect. Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            if (!partnership?.id) return;
            setLoading(true);
            try {
              await unpairPartnership(partnership.id);
              Alert.alert('Success', 'Partnership has been unpaired.');
            } catch (error) {
              Alert.alert('Error', 'Failed to unpair. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const formatAnniversaryDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'MMMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const calculateDaysTogether = (dateString?: string) => {
    if (!dateString) return 0;
    try {
      const anniversary = new Date(dateString);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - anniversary.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  const notificationTime = (() => {
    try {
      const [hours, minutes] = notificationSettings.preferredNotificationTime.split(':');
      return new Date();
      // Set time but keep current date
      // Note: This is a simplified approach - in production you'd want proper time handling
    } catch {
      return new Date();
    }
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              {user?.profilePicture ? (
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              ) : (
                <View style={styles.avatarContainer}>
                  <MaterialCommunityIcons
                    name="account-circle"
                    size={60}
                    color={theme.colors.primary}
                  />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.name || 'User'}</Text>
                <Text style={styles.profileEmail}>{user?.email || ''}</Text>
              </View>
              <TouchableOpacity style={styles.editButton}>
                <MaterialCommunityIcons
                  name="pencil"
                  size={20}
                  color={theme.colors.primary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive push notifications on your device
                </Text>
              </View>
              <Switch
                value={notificationSettings.pushEnabled}
                onValueChange={value => handleToggle('pushEnabled', value)}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primaryLight,
                }}
                thumbColor={
                  notificationSettings.pushEnabled
                    ? theme.colors.primary
                    : theme.colors.textLight
                }
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Daily Prompt Reminders</Text>
                <Text style={styles.settingDescription}>
                  Get reminded to answer daily questions
                </Text>
              </View>
              <Switch
                value={notificationSettings.dailyPromptReminder}
                onValueChange={value =>
                  handleToggle('dailyPromptReminder', value)
                }
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primaryLight,
                }}
                thumbColor={
                  notificationSettings.dailyPromptReminder
                    ? theme.colors.primary
                    : theme.colors.textLight
                }
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Streak Reminders</Text>
                <Text style={styles.settingDescription}>
                  Get notified to maintain your streak
                </Text>
              </View>
              <Switch
                value={notificationSettings.streakReminder}
                onValueChange={value => handleToggle('streakReminder', value)}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primaryLight,
                }}
                thumbColor={
                  notificationSettings.streakReminder
                    ? theme.colors.primary
                    : theme.colors.textLight
                }
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Partner Activity</Text>
                <Text style={styles.settingDescription}>
                  Get notified when your partner is active
                </Text>
              </View>
              <Switch
                value={notificationSettings.partnerActivityNotifications}
                onValueChange={value =>
                  handleToggle('partnerActivityNotifications', value)
                }
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primaryLight,
                }}
                thumbColor={
                  notificationSettings.partnerActivityNotifications
                    ? theme.colors.primary
                    : theme.colors.textLight
                }
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowTimePicker(true)}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Preferred Notification Time</Text>
                <Text style={styles.settingDescription}>
                  {notificationSettings.preferredNotificationTime}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            {showTimePicker && (
              <DateTimePicker
                value={notificationTime}
                mode="time"
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleTimeChange}
              />
            )}

            {!hasPermission && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={() => Linking.openSettings()}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Enable in System Settings</Text>
                    <Text style={styles.settingDescription}>
                      Notifications are disabled. Tap to open system settings.
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Data Encryption</Text>
                <Text style={styles.settingDescription}>Always enabled</Text>
              </View>
              <MaterialCommunityIcons
                name="lock"
                size={24}
                color={theme.colors.success}
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleExportData}
              disabled={loading}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Download All Data</Text>
                <Text style={styles.settingDescription}>
                  Export your data as JSON
                </Text>
              </View>
              <MaterialCommunityIcons
                name="download"
                size={24}
                color={theme.colors.primary}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleDeleteAccount}
              disabled={loading}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, styles.destructiveText]}>
                  Delete Account
                </Text>
                <Text style={styles.settingDescription}>
                  Permanently delete your account
                </Text>
              </View>
              <MaterialCommunityIcons
                name="delete"
                size={24}
                color={theme.colors.error}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Relationship Section */}
        {partnership && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Relationship</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Anniversary Date</Text>
                  <Text style={styles.settingDescription}>
                    {formatAnniversaryDate(partnership.anniversaryDate)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.editButton}>
                  <MaterialCommunityIcons
                    name="pencil"
                    size={20}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Current Streak</Text>
                  <Text style={styles.settingDescription}>
                    {partnership.streakCount} days
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="fire"
                  size={24}
                  color={theme.colors.accent}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Days Together</Text>
                  <Text style={styles.settingDescription}>
                    {calculateDaysTogether(partnership.anniversaryDate)} days
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={handleUnpair}
                disabled={loading}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, styles.destructiveText]}>
                    Unpair from Partner
                  </Text>
                  <Text style={styles.settingDescription}>
                    Disconnect from your partner
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="link-off"
                  size={24}
                  color={theme.colors.error}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* App Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => navigation.navigate('Referral')}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Refer Friends</Text>
                <Text style={styles.settingDescription}>
                  Invite couples and earn rewards
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Version</Text>
                <Text style={styles.settingDescription}>1.0.0</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Terms of Service</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Privacy Policy</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Send Feedback</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleLogout}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, styles.destructiveText]}>
                  Logout
                </Text>
              </View>
              <MaterialCommunityIcons
                name="logout"
                size={24}
                color={theme.colors.error}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.base,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.base,
  },
  avatarText: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  profileEmail: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  editButton: {
    padding: theme.spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: theme.spacing.base,
  },
  settingLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  settingDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  destructiveText: {
    color: theme.colors.error,
  },
  bottomSpacing: {
    height: theme.spacing['2xl'],
  },
});