/**
 * Profile Setup screen - Step 1 of onboarding
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Snackbar} from 'react-native-paper';
import {useAuthStore} from '@store/authSlice';
import {updateProfile} from '@services/authService';
import {AuthInput} from '@components/auth/AuthInput';
import {AuthButton} from '@components/auth/AuthButton';
import {ProgressIndicator} from '@components/auth/ProgressIndicator';
import {validateName} from '@utils/validation';
import {theme} from '@theme';
import {AuthError, getErrorMessage} from '@utils/errors';
import type {AuthStackParamList} from '@utils/types';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export const ProfileSetupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const user = useAuthStore(state => state.user);
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);

  const handleContinue = async () => {
    setNameError('');
    setErrorMessage('');

    if (!displayName.trim()) {
      setNameError('Display name is required');
      return;
    }

    if (!validateName(displayName)) {
      setNameError('Name must be at least 2 characters');
      return;
    }

    if (!user?.id) {
      setErrorMessage('User not found. Please sign in again.');
      setShowError(true);
      return;
    }

    setLoading(true);
    try {
      await updateProfile(user.id, {name: displayName.trim()});
      navigation.navigate('Pairing');
    } catch (error: any) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <ProgressIndicator currentStep={1} totalSteps={3} />

            <Text style={styles.title}>Let's set up your profile</Text>
            <Text style={styles.subtitle}>
              This helps your partner recognize you
            </Text>

            <View style={styles.form}>
              <Text style={styles.label}>Profile Picture (Optional)</Text>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {displayName.charAt(0).toUpperCase() || '👤'}
                </Text>
              </View>
              <Text style={styles.avatarHint}>
                Profile picture picker coming soon
              </Text>

              <AuthInput
                label="Display Name"
                value={displayName}
                onChangeText={setDisplayName}
                error={nameError}
                autoCapitalize="words"
              />

              <AuthButton
                title="Continue"
                onPress={handleContinue}
                loading={loading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  keyboardView: {
    flex: 1,
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
  },
  subtitle: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  form: {
    marginTop: theme.spacing.lg,
  },
  label: {
    ...theme.typography.styles.bodySmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing.sm,
  },
  avatarText: {
    fontSize: 48,
    color: theme.colors.textInverse,
  },
  avatarHint: {
    ...theme.typography.styles.caption,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  snackbar: {
    backgroundColor: theme.colors.error,
  },
});
