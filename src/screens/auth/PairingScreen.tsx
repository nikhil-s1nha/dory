/**
 * Pairing screen - Step 2 of onboarding
 * Create invite code or join with code
 */

import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Snackbar} from 'react-native-paper';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {createPartnership, acceptInvite} from '@services/partnershipService';
import {AuthInput} from '@components/auth/AuthInput';
import {AuthButton} from '@components/auth/AuthButton';
import {ProgressIndicator} from '@components/auth/ProgressIndicator';
import {copyToClipboard, shareInviteCode} from '@services/pairing';
import {validateInviteCode} from '@utils/validation';
import {theme} from '@theme';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import type {AuthStackParamList} from '@utils/types';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

type TabType = 'create' | 'join';

export const PairingScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const user = useAuthStore(state => state.user);
  const partnership = usePartnershipStore(state => state.partnership);
  const isConnected = usePartnershipStore(state => state.isConnected);
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeError, setJoinCodeError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Handle deep link code parameter
  useEffect(() => {
    const params = route.params as {code?: string} | undefined;
    if (params?.code) {
      setActiveTab('join');
      setJoinCode(params.code);
    }
  }, [route.params]);

  // Subscribe to partnership changes and navigate when partnership becomes active
  useEffect(() => {
    if (!user?.id) return;

    // Clean up previous subscription if exists
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Initialize partnership subscription
    const initializePartnership = async () => {
      const unsubscribe = await usePartnershipStore
        .getState()
        .initializePartnership(user.id);
      return unsubscribe;
    };

    initializePartnership().then(unsub => {
      unsubscribeRef.current = unsub;
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.id]);

  // Navigate to AnniversarySetup when partnership becomes active
  useEffect(() => {
    if (isConnected && partnership?.status === 'active') {
      navigation.navigate('AnniversarySetup');
    }
  }, [isConnected, partnership?.status, navigation]);

  const handleCreateInvite = async () => {
    if (!user?.id) {
      setErrorMessage('User not found. Please sign in again.');
      setShowError(true);
      return;
    }

    setLoading(true);
    try {
      const partnership = await createPartnership(user.id);
      setInviteCode(partnership.inviteCode || '');
      setSuccessMessage('Invite code generated! Share it with your partner.');
      setShowSuccess(true);
      
      // Subscribe to partnership changes after creating it
      // This ensures creators are notified when their partner joins
      if (partnership.id) {
        // Clean up previous subscription if exists
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        
        // Re-initialize subscription to include the newly created partnership
        const unsubscribe = await usePartnershipStore
          .getState()
          .initializePartnership(user.id);
        unsubscribeRef.current = unsubscribe;
      }
    } catch (error: any) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (inviteCode) {
      try {
        await copyToClipboard(inviteCode);
        setSuccessMessage('Code copied to clipboard!');
        setShowSuccess(true);
      } catch (error) {
        setErrorMessage('Failed to copy code');
        setShowError(true);
      }
    }
  };

  const handleShareCode = async () => {
    if (inviteCode) {
      try {
        await shareInviteCode(inviteCode);
      } catch (error) {
        setErrorMessage('Failed to share code');
        setShowError(true);
      }
    }
  };

  const handleJoinPartnership = async () => {
    setJoinCodeError('');
    setErrorMessage('');

    if (!joinCode.trim()) {
      setJoinCodeError('Invite code is required');
      return;
    }

    if (!validateInviteCode(joinCode)) {
      setJoinCodeError('Please enter a valid 6-digit code');
      return;
    }

    if (!user?.id) {
      setErrorMessage('User not found. Please sign in again.');
      setShowError(true);
      return;
    }

    setLoading(true);
    try {
      await acceptInvite(joinCode.trim(), user.id);
      navigation.navigate('AnniversarySetup');
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <ProgressIndicator currentStep={2} totalSteps={3} />

          <Text style={styles.title}>Connect with Your Partner</Text>
          <Text style={styles.subtitle}>
            Create an invite or join with a code
          </Text>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'create' && styles.tabActive]}
              onPress={() => setActiveTab('create')}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'create' && styles.tabTextActive,
                ]}>
                Create Invite
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'join' && styles.tabActive]}
              onPress={() => setActiveTab('join')}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'join' && styles.tabTextActive,
                ]}>
                Join with Code
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'create' ? (
            <View style={styles.createSection}>
              {!inviteCode ? (
                <>
                  <Text style={styles.sectionText}>
                    Generate a unique 6-digit code to share with your partner
                  </Text>
                  <AuthButton
                    title="Generate Invite Code"
                    onPress={handleCreateInvite}
                    loading={loading}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.sectionText}>
                    Share this code with your partner:
                  </Text>
                  <View style={styles.codeContainer}>
                    <Text style={styles.codeText}>{inviteCode}</Text>
                  </View>
                  <View style={styles.codeActions}>
                    <AuthButton
                      title="Copy Code"
                      onPress={handleCopyCode}
                      variant="secondary"
                    />
                    <AuthButton
                      title="Share Link"
                      onPress={handleShareCode}
                      variant="secondary"
                    />
                  </View>
                  <Text style={styles.hint}>
                    Once your partner joins, you'll be automatically connected!
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.joinSection}>
              <Text style={styles.sectionText}>
                Enter the 6-digit code your partner shared with you
              </Text>
              <AuthInput
                label="Invite Code"
                value={joinCode}
                onChangeText={setJoinCode}
                error={joinCodeError}
                keyboardType="numeric"
              />
              <AuthButton
                title="Join Partnership"
                onPress={handleJoinPartnership}
                loading={loading}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <Snackbar
        visible={showError}
        onDismiss={() => setShowError(false)}
        duration={4000}
        style={styles.snackbarError}>
        {errorMessage}
      </Snackbar>

      <Snackbar
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        duration={3000}
        style={styles.snackbarSuccess}>
        {successMessage}
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
  },
  subtitle: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 4,
    marginBottom: theme.spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.textInverse,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  createSection: {
    marginTop: theme.spacing.md,
  },
  joinSection: {
    marginTop: theme.spacing.md,
  },
  sectionText: {
    ...theme.typography.styles.body,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  codeContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  codeText: {
    ...theme.typography.styles.heading1,
    fontSize: 48,
    color: theme.colors.primary,
    letterSpacing: 8,
    fontWeight: theme.typography.fontWeight.bold,
  },
  codeActions: {
    gap: theme.spacing.sm,
  },
  hint: {
    ...theme.typography.styles.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  snackbarError: {
    backgroundColor: theme.colors.error,
  },
  snackbarSuccess: {
    backgroundColor: theme.colors.success,
  },
});
