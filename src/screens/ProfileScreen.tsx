/**
 * Profile Screen
 * Displays user profile information, stats, and navigation to settings
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {format, differenceInDays, addYears} from 'date-fns';
import {subscribeToCountdowns} from '@services/countdownService';
import {Countdown} from '@utils/types';
import {getReferralStats} from '@services/referralService';
import {ReferralStats} from '@utils/types';

interface ProfileScreenProps {
  navigation: any;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({navigation}) => {
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);

  // Subscribe to countdowns
  useEffect(() => {
    if (!partnership) return;

    const unsubscribe = subscribeToCountdowns(partnership.id, updatedCountdowns => {
      // Filter to only future countdowns and sort by date
      const futureCountdowns = updatedCountdowns
        .filter(c => new Date(c.targetDate) > new Date())
        .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime());
      setCountdowns(futureCountdowns);
    });

    return () => {
      unsubscribe();
    };
  }, [partnership]);

  // Load referral stats
  useEffect(() => {
    if (!user?.id) return;

    const loadReferralStats = async () => {
      try {
        const stats = await getReferralStats(user.id);
        setReferralStats(stats);
      } catch (error) {
        console.error('Error loading referral stats:', error);
      }
    };

    loadReferralStats();
  }, [user?.id]);

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

  const formatAnniversaryDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'MMMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const getNextAnniversaryCountdown = () => {
    if (!partnership?.anniversaryDate) return null;
    try {
      const anniversary = new Date(partnership.anniversaryDate);
      const today = new Date();
      const currentYear = today.getFullYear();
      
      // Calculate next anniversary
      let nextAnniversary = new Date(anniversary);
      nextAnniversary.setFullYear(currentYear);
      
      // If this year's anniversary has passed, use next year
      if (nextAnniversary < today) {
        nextAnniversary.setFullYear(currentYear + 1);
      }
      
      const daysUntil = differenceInDays(nextAnniversary, today);
      return {date: nextAnniversary, days: daysUntil};
    } catch {
      return null;
    }
  };

  const nextAnniversary = getNextAnniversaryCountdown();
  const upcomingCountdowns = countdowns.slice(0, 3);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {user?.profilePicture ? (
              <Image
                source={{uri: user.profilePicture}}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          {partnership?.anniversaryDate && (
            <View style={styles.anniversaryContainer}>
              <TouchableOpacity
                style={styles.anniversaryRow}
                onPress={() => navigation.getParent()?.navigate('Countdown')}>
                <MaterialCommunityIcons
                  name="heart"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text style={styles.anniversaryText}>
                  Together since {formatAnniversaryDate(partnership.anniversaryDate)}
                </Text>
              </TouchableOpacity>
              {nextAnniversary && (
                <Text style={styles.anniversaryCountdown}>
                  {nextAnniversary.days === 0
                    ? 'Today is your anniversary!'
                    : `${nextAnniversary.days} day${nextAnniversary.days !== 1 ? 's' : ''} until ${nextAnniversary.date.getFullYear()} anniversary`}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons
              name="pencil"
              size={20}
              color={theme.colors.primary}
            />
            <Text style={styles.actionButtonText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.getParent()?.navigate('Settings')}>
            <MaterialCommunityIcons
              name="cog"
              size={20}
              color={theme.colors.primary}
            />
            <Text style={styles.actionButtonText}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Relationship Stats */}
        {partnership ? (
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Relationship Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons
                    name="fire"
                    size={32}
                    color={theme.colors.accent}
                  />
                </View>
                <Text style={styles.statValue}>{partnership.streakCount}</Text>
                <Text style={styles.statLabel}>Day Streak</Text>
              </View>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons
                    name="calendar-heart"
                    size={32}
                    color={theme.colors.primary}
                  />
                </View>
                <Text style={styles.statValue}>
                  {calculateDaysTogether(partnership.anniversaryDate)}
                </Text>
                <Text style={styles.statLabel}>Days Together</Text>
              </View>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons
                    name="message-question"
                    size={32}
                    color={theme.colors.secondary}
                  />
                </View>
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>Questions</Text>
              </View>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons
                    name="gamepad-variant"
                    size={32}
                    color={theme.colors.accent}
                  />
                </View>
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>Games Played</Text>
              </View>
            </View>
          </View>

          {/* Invite Friends Section */}
          <View style={styles.inviteFriendsSection}>
            <Text style={styles.sectionTitle}>Invite Friends</Text>
            <TouchableOpacity
              style={styles.inviteFriendsCard}
              onPress={() => navigation.getParent()?.navigate('Referral')}>
              <View style={styles.inviteFriendsContent}>
                <MaterialCommunityIcons
                  name="gift"
                  size={32}
                  color={theme.colors.primary}
                />
                <View style={styles.inviteFriendsText}>
                  <Text style={styles.inviteFriendsTitle}>
                    Refer Couple Friends
                  </Text>
                  <Text style={styles.inviteFriendsDescription}>
                    Earn 1 free month per referral
                  </Text>
                  {referralStats && referralStats.completedReferrals > 0 && (
                    <Text style={styles.inviteFriendsCount}>
                      You've referred {referralStats.completedReferrals} couple
                      {referralStats.completedReferrals !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={theme.colors.textSecondary}
                />
              </View>
              <TouchableOpacity
                style={styles.inviteFriendsButton}
                onPress={() => navigation.getParent()?.navigate('Referral')}>
                <Text style={styles.inviteFriendsButtonText}>Get Started</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>

          {/* Upcoming Events */}
          <View style={styles.countdownSection}>
            <View style={styles.countdownHeader}>
              <Text style={styles.sectionTitle}>Upcoming Events</Text>
              {countdowns.length > 0 && (
                <TouchableOpacity
                  onPress={() => navigation.getParent()?.navigate('Countdown')}>
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              )}
            </View>
            {upcomingCountdowns.length === 0 ? (
              <View style={styles.noCountdownsCard}>
                <MaterialCommunityIcons
                  name="calendar-plus"
                  size={32}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.noCountdownsText}>No upcoming events</Text>
                <TouchableOpacity
                  style={styles.addCountdownButton}
                  onPress={() => navigation.getParent()?.navigate('Countdown')}>
                  <Text style={styles.addCountdownButtonText}>Add Countdown</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.countdownList}>
                {upcomingCountdowns.map(countdown => {
                  const targetDate = new Date(countdown.targetDate);
                  const days = differenceInDays(targetDate, new Date());
                  return (
                    <TouchableOpacity
                      key={countdown.id}
                      style={styles.countdownCard}
                      onPress={() => navigation.getParent()?.navigate('Countdown')}>
                      <MaterialCommunityIcons
                        name="calendar-clock"
                        size={20}
                        color={theme.colors.primary}
                      />
                      <View style={styles.countdownCardContent}>
                        <Text style={styles.countdownCardTitle} numberOfLines={1}>
                          {countdown.title}
                        </Text>
                        <Text style={styles.countdownCardDays}>
                          {days} day{days !== 1 ? 's' : ''} remaining
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.inviteSection}>
            <Text style={styles.sectionTitle}>Get Started</Text>
            <View style={styles.inviteCard}>
              <MaterialCommunityIcons
                name="account-plus"
                size={48}
                color={theme.colors.primary}
              />
              <Text style={styles.inviteTitle}>Invite Your Partner</Text>
              <Text style={styles.inviteDescription}>
                Connect with your partner to start sharing moments and building
                your relationship together.
              </Text>
              <TouchableOpacity style={styles.inviteButton}>
                <Text style={styles.inviteButtonText}>Invite Partner</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
  profileHeader: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.base,
  },
  avatarContainer: {
    marginBottom: theme.spacing.base,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  userName: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  userEmail: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  anniversaryContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  anniversaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  anniversaryText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  anniversaryCountdown: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    marginTop: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.base,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
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
  actionButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
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
  },
  statCard: {
    width: '47%',
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
  statIconContainer: {
    marginBottom: theme.spacing.sm,
  },
  statValue: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  inviteSection: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  inviteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
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
  inviteTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.sm,
  },
  inviteDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: theme.typography.fontSize.base * 1.5,
  },
  inviteButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.spacing.md,
  },
  inviteButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  bottomSpacing: {
    height: theme.spacing['2xl'],
  },
  countdownSection: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  countdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  viewAllText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  noCountdownsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
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
  noCountdownsText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  addCountdownButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
  },
  addCountdownButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  countdownList: {
    gap: theme.spacing.sm,
  },
  countdownCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    flexDirection: 'row',
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
  countdownCardContent: {
    flex: 1,
    marginLeft: theme.spacing.base,
  },
  countdownCardTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  countdownCardDays: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  inviteFriendsSection: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  inviteFriendsCard: {
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
  inviteFriendsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  inviteFriendsText: {
    flex: 1,
    marginLeft: theme.spacing.base,
  },
  inviteFriendsTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  inviteFriendsDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  inviteFriendsCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  inviteFriendsButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.base,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
  },
  inviteFriendsButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
});
