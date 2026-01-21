/**
 * Referral Screen
 * Displays referral code, stats, and sharing options
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';
import {
  createReferral,
  getUserReferrals,
  getReferralStats,
  subscribeToUserReferrals,
} from '@services/referralService';
import {Referral, ReferralStats} from '@utils/types';
import {format} from 'date-fns';

interface ReferralScreenProps {
  navigation: any;
}

export const ReferralScreen: React.FC<ReferralScreenProps> = ({navigation}) => {
  const {user} = useAuthStore();
  const [referralCode, setReferralCode] = useState<string>('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    completedReferrals: 0,
    pendingReferrals: 0,
    totalRewardsEarned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    loadReferralData();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToUserReferrals(user.id, updatedReferrals => {
      setReferrals(updatedReferrals);
      updateStats(updatedReferrals);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  const loadReferralData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Get or create referral code
      const referral = await createReferral(user.id);
      setReferralCode(referral.referralCode);

      // Load referrals and stats
      const userReferrals = await getUserReferrals(user.id);
      setReferrals(userReferrals);
      updateStats(userReferrals);
    } catch (error: any) {
      console.error('Error loading referral data:', error);
      Alert.alert('Error', 'Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const updateStats = async (referralsList: Referral[]) => {
    if (!user?.id) return;

    try {
      const referralStats = await getReferralStats(user.id);
      setStats(referralStats);
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;

    try {
      await Clipboard.setString(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Haptic feedback (if available)
      if (Platform.OS === 'ios') {
        // You can add haptic feedback here if using react-native-haptic-feedback
      }
    } catch (error) {
      console.error('Error copying code:', error);
    }
  };

  const handleShareInvite = async () => {
    if (!referralCode) return;

    const deepLink = `candle://referral?code=${referralCode}`;
    const message = `Join me on Candle! Use code ${referralCode} or click ${deepLink} to connect with your partner every day. 💕`;

    try {
      await Share.share({
        message,
        title: 'Join me on Candle',
      });
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        console.error('Error sharing invite:', error);
        Alert.alert('Error', 'Failed to share invite');
      }
    }
  };

  const formatReferralCode = (code: string) => {
    // Format as XXXX-XXXX (remove any existing dashes first)
    const cleanCode = code.replace(/-/g, '');
    if (cleanCode.length === 8) {
      return `${cleanCode.substring(0, 4)}-${cleanCode.substring(4)}`;
    }
    return code;
  };

  const getStatusBadge = (status: Referral['status']) => {
    switch (status) {
      case 'completed':
        return {
          label: 'Completed',
          color: theme.colors.success,
          icon: 'check-circle',
        };
      case 'pending':
        return {
          label: 'Pending',
          color: theme.colors.warning,
          icon: 'clock-outline',
        };
      case 'expired':
        return {
          label: 'Expired',
          color: theme.colors.textSecondary,
          icon: 'close-circle',
        };
      default:
        return {
          label: status,
          color: theme.colors.textSecondary,
          icon: 'help-circle',
        };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="account-multiple-plus"
            size={48}
            color={theme.colors.primary}
          />
          <Text style={styles.headerTitle}>Invite Couple Friends</Text>
          <Text style={styles.headerSubtitle}>
            Get 1 free month for each couple that joins
          </Text>
        </View>

        {/* Referral Code Card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your Referral Code</Text>
          <View style={styles.codeContainer}>
            <Text style={styles.codeText}>
              {referralCode ? formatReferralCode(referralCode) : 'Loading...'}
            </Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={handleCopyCode}
              disabled={!referralCode}>
              <MaterialCommunityIcons
                name={copied ? 'check' : 'content-copy'}
                size={20}
                color={copied ? theme.colors.success : theme.colors.primary}
              />
              <Text
                style={[
                  styles.copyButtonText,
                  copied && styles.copyButtonTextActive,
                ]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareInvite}
          disabled={!referralCode}>
          <MaterialCommunityIcons
            name="share-variant"
            size={24}
            color={theme.colors.textInverse}
          />
          <Text style={styles.shareButtonText}>Share Invite Link</Text>
        </TouchableOpacity>

        {/* Referral Stats Section */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your Referrals</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <MaterialCommunityIcons
                name="send"
                size={32}
                color={theme.colors.primary}
              />
              <Text style={styles.statValue}>{stats.totalReferrals}</Text>
              <Text style={styles.statLabel}>Total Invites</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialCommunityIcons
                name="check-circle"
                size={32}
                color={theme.colors.success}
              />
              <Text style={styles.statValue}>
                {stats.completedReferrals}
              </Text>
              <Text style={styles.statLabel}>Successful</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialCommunityIcons
                name="gift"
                size={32}
                color={theme.colors.accent}
              />
              <Text style={styles.statValue}>
                {stats.totalRewardsEarned}
              </Text>
              <Text style={styles.statLabel}>Rewards Earned</Text>
            </View>
          </View>
          {stats.currentReward && (
            <View style={styles.rewardCard}>
              <MaterialCommunityIcons
                name="star"
                size={24}
                color={theme.colors.accent}
              />
              <Text style={styles.rewardText}>
                Current Reward: {stats.currentReward}
              </Text>
            </View>
          )}
        </View>

        {/* Referral History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Referral History</Text>
          {referrals.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="account-plus-outline"
                size={48}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.emptyStateText}>
                No referrals yet. Share your code to get started!
              </Text>
            </View>
          ) : (
            <View style={styles.referralList}>
              {referrals.map(referral => {
                const badge = getStatusBadge(referral.status);
                return (
                  <View key={referral.id} style={styles.referralItem}>
                    <View style={styles.referralItemContent}>
                      <View style={styles.referralItemHeader}>
                        <View
                          style={[
                            styles.statusBadge,
                            {backgroundColor: `${badge.color}20`},
                          ]}>
                          <MaterialCommunityIcons
                            name={badge.icon}
                            size={16}
                            color={badge.color}
                          />
                          <Text
                            style={[styles.statusText, {color: badge.color}]}>
                            {badge.label}
                          </Text>
                        </View>
                        {referral.rewardGranted && (
                          <MaterialCommunityIcons
                            name="gift"
                            size={20}
                            color={theme.colors.accent}
                          />
                        )}
                      </View>
                      <Text style={styles.referralDate}>
                        {format(
                          new Date(referral.createdAt),
                          'MMM d, yyyy',
                        )}
                      </Text>
                      {referral.completedAt && (
                        <Text style={styles.referralCompletedDate}>
                          Completed: {format(
                            new Date(referral.completedAt),
                            'MMM d, yyyy',
                          )}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.base,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.sm,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  codeCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.base,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  codeLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.backgroundDark,
    padding: theme.spacing.base,
    borderRadius: theme.spacing.md,
  },
  codeText: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 2,
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.spacing.sm,
  },
  copyButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  copyButtonTextActive: {
    color: theme.colors.success,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.spacing.md,
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shareButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  statsSection: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.base,
    marginBottom: theme.spacing.base,
  },
  statCard: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accentLight,
    padding: theme.spacing.base,
    borderRadius: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.base,
  },
  rewardText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  historySection: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.base,
    textAlign: 'center',
  },
  referralList: {
    gap: theme.spacing.sm,
  },
  referralItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  referralItemContent: {
    gap: theme.spacing.xs,
  },
  referralItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  statusText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  referralDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  referralCompletedDate: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.success,
  },
  bottomSpacing: {
    height: theme.spacing['2xl'],
  },
});
