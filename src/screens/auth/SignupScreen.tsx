/**
 * Signup screen - Create new account
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Snackbar, IconButton} from 'react-native-paper';
import {signUp} from '@services/authService';
import {AuthInput} from '@components/auth/AuthInput';
import {AuthButton} from '@components/auth/AuthButton';
import {validateEmail, validatePassword, validateName} from '@utils/validation';
import {theme} from '@theme';
import {AuthError, getErrorMessage} from '@utils/errors';
import type {AuthStackParamList} from '@utils/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getReferralByCode, validateReferralCode} from '@services/referralService';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export const SignupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralCodeError, setReferralCodeError] = useState('');

  // Load pending referral code from AsyncStorage on mount
  useEffect(() => {
    const loadPendingReferralCode = async () => {
      try {
        const pendingCode = await AsyncStorage.getItem('pendingReferralCode');
        if (pendingCode) {
          // Format the code for display (add dash if needed)
          const formatted = pendingCode.length === 8 
            ? `${pendingCode.substring(0, 4)}-${pendingCode.substring(4)}`
            : pendingCode;
          setReferralCode(formatted);
        }
      } catch (error) {
        console.error('Error loading pending referral code:', error);
      }
    };

    loadPendingReferralCode();
  }, []);

  const handleSignup = async () => {
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setReferralCodeError('');
    setErrorMessage('');

    let hasError = false;

    if (!name.trim()) {
      setNameError('Name is required');
      hasError = true;
    } else if (!validateName(name)) {
      setNameError('Name must be at least 2 characters');
      hasError = true;
    }

    if (!email.trim()) {
      setEmailError('Email is required');
      hasError = true;
    } else if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    } else {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        setPasswordError(passwordValidation.message || 'Invalid password');
        hasError = true;
      }
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      hasError = true;
    }

    // Validate referral code if provided
    if (referralCode.trim()) {
      const isValid = await validateReferralCode(referralCode.trim().toUpperCase());
      if (!isValid) {
        setReferralCodeError('Invalid or expired referral code');
        hasError = true;
      }
    }

    if (hasError) {
      return;
    }

    setLoading(true);
    try {
      // Store referral code in AsyncStorage for use after signup (normalize: remove dashes, uppercase)
      if (referralCode.trim()) {
        const normalizedCode = referralCode.trim().replace(/-/g, '').toUpperCase();
        await AsyncStorage.setItem('pendingReferralCode', normalizedCode);
      }

      await signUp(email.trim(), password, name.trim());
      // Navigate to profile setup
      navigation.navigate('ProfileSetup');
    } catch (error: any) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      setShowError(true);
      // Clear referral code on error
      await AsyncStorage.removeItem('pendingReferralCode');
    } finally {
      setLoading(false);
    }
  };

  const handleReferralCodeBlur = async () => {
    if (!referralCode.trim()) {
      setReferralCodeError('');
      return;
    }

    // Normalize code (remove dashes, uppercase)
    const code = referralCode.trim().replace(/-/g, '').toUpperCase();
    const isValid = await validateReferralCode(code);
    if (!isValid) {
      setReferralCodeError('Invalid or expired referral code');
    } else {
      setReferralCodeError('');
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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join Candle and connect with your partner</Text>

            <View style={styles.form}>
              <AuthInput
                label="Name"
                value={name}
                onChangeText={setName}
                error={nameError}
                autoCapitalize="words"
              />

              <AuthInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={emailError}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <AuthInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                error={passwordError}
                secureTextEntry={!showPassword}
                right={
                  <IconButton
                    icon={showPassword ? 'eye-off' : 'eye'}
                    iconColor={theme.colors.textSecondary}
                    size={20}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />

              <AuthInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={confirmPasswordError}
                secureTextEntry={!showConfirmPassword}
                right={
                  <IconButton
                    icon={showConfirmPassword ? 'eye-off' : 'eye'}
                    iconColor={theme.colors.textSecondary}
                    size={20}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  />
                }
              />

              <AuthInput
                label="Have a referral code? (Optional)"
                value={referralCode}
                onChangeText={text => {
                  // Allow dashes for better UX, but normalize on blur/submit
                  const formatted = text.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                  setReferralCode(formatted);
                  setReferralCodeError('');
                }}
                error={referralCodeError}
                autoCapitalize="characters"
                onBlur={handleReferralCodeBlur}
                placeholder="XXXX-XXXX"
              />

              <AuthButton
                title="Create Account"
                onPress={handleSignup}
                loading={loading}
              />

              <View style={styles.signinLink}>
                <Text style={styles.signinText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.signinLinkText}>Sign In</Text>
                </TouchableOpacity>
              </View>
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
    justifyContent: 'center',
  },
  title: {
    ...theme.typography.styles.heading1,
    color: theme.colors.text,
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
  signinLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  signinText: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
  },
  signinLinkText: {
    ...theme.typography.styles.body,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  snackbar: {
    backgroundColor: theme.colors.error,
  },
});
