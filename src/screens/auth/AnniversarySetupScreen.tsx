/**
 * Anniversary Setup screen - Step 3 of onboarding
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Snackbar} from 'react-native-paper';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {updateProfile} from '@services/authService';
import {updatePartnership} from '@services/partnershipService';
import {AuthButton} from '@components/auth/AuthButton';
import {ProgressIndicator} from '@components/auth/ProgressIndicator';
import {theme} from '@theme';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import type {AuthStackParamList} from '@utils/types';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export const AnniversarySetupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const user = useAuthStore(state => state.user);
  const partnership = usePartnershipStore(state => state.partnership);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);

  const handleDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleSave = async () => {
    if (!user?.id || !partnership?.id) {
      setErrorMessage('User or partnership not found. Please try again.');
      setShowError(true);
      return;
    }

    setLoading(true);
    try {
      const dateString = selectedDate.toISOString().split('T')[0];

      // Update both user profile and partnership
      await Promise.all([
        updateProfile(user.id, {anniversaryDate: dateString}),
        updatePartnership(partnership.id, {anniversaryDate: dateString}),
      ]);

      navigation.navigate('OnboardingTutorial');
    } catch (error: any) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigation.navigate('OnboardingTutorial');
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <ProgressIndicator currentStep={3} totalSteps={3} />

          <Text style={styles.title}>When did you two start dating?</Text>
          <Text style={styles.subtitle}>
            This helps us celebrate your milestones together
          </Text>

          <View style={styles.form}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateButtonText}>
                {formatDate(selectedDate)}
              </Text>
              <Text style={styles.dateButtonHint}>Tap to change date</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}

            <View style={styles.actions}>
              <AuthButton
                title="Save Anniversary"
                onPress={handleSave}
                loading={loading}
              />
              <TouchableOpacity onPress={handleSkip}>
                <Text style={styles.skipText}>Skip for Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      <Snackbar
        visible={showError}
        onDismiss={() => setShowError(false)}
        duration={4000}
        style={styles.snackbar}>
        {errorMessage}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.typography.styles.heading2,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  form: {
    marginTop: theme.spacing.lg,
  },
  dateButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  dateButtonText: {
    ...theme.typography.styles.heading3,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  dateButtonHint: {
    ...theme.typography.styles.caption,
    color: theme.colors.textSecondary,
  },
  actions: {
    marginTop: theme.spacing.md,
  },
  skipText: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  snackbar: {
    backgroundColor: theme.colors.error,
  },
});
