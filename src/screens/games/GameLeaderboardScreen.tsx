/**
 * Game Leaderboard Screen
 * Displays game history and leaderboard for a specific game
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {GameHeader} from '@components/games';
import {getLeaderboard, getUserStats} from '@services/gameScoreService';
import {getUserById} from '@services/authService';
import {MainStackParamList} from '@utils/types';
import {theme} from '@theme';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'GameLeaderboard'>;
type RouteProp = RouteProp<MainStackParamList, 'GameLeaderboard'>;

export const GameLeaderboardScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp>();
  const {gameType, gameName} = route.params;
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [scores, setScores] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any>(null);
  const [partnerStats, setPartnerStats] = useState<any>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'us' | 'global'>('us');

  useEffect(() => {
    if (!user || !partnership) {
      navigation.goBack();
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const partnerId = user.id === partnership.userId1 
          ? partnership.userId2 
          : partnership.userId1;
        
        const partner = await getUserById(partnerId);
        if (partner) {
          setPartnerName(partner.name);
        }

        // Fetch leaderboard
        const leaderboard = await getLeaderboard(partnership.id, gameType);
        setScores(leaderboard);

        // Fetch user stats
        const myStats = await getUserStats(user.id, gameType);
        setUserStats(myStats);

        // Fetch partner stats
        const partnerStatsData = await getUserStats(partnerId, gameType);
        setPartnerStats(partnerStatsData);
      } catch (error) {
        console.error('Error fetching leaderboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, partnership, gameType]);

  const getGameIcon = () => {
    const iconMap: Record<string, string> = {
      'whos_more_likely': 'account-question',
      'anagrams': 'alphabetical-variant',
      'what_you_saying': 'message-text',
      'four_in_a_row': 'view-grid',
      'draw_duel': 'draw',
      'perfect_pair': 'heart-multiple',
      'sticker_generator': 'emoticon-happy',
    };
    return iconMap[gameType] || 'gamepad-variant';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title={gameName}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'us' && styles.tabActive]}
          onPress={() => setActiveTab('us')}>
          <Text style={[styles.tabText, activeTab === 'us' && styles.tabTextActive]}>
            Us
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'global' && styles.tabActive]}
          onPress={() => setActiveTab('global')}>
          <Text style={[styles.tabText, activeTab === 'global' && styles.tabTextActive]}>
            Global
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'us' ? (
          <View style={styles.usTab}>
            <View style={styles.statsContainer}>
              <View style={styles.playerStatsCard}>
                <Text style={styles.playerName}>You</Text>
                {userStats ? (
                  <>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Best Score</Text>
                      <Text style={styles.statValue}>{userStats.bestScore}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Games Played</Text>
                      <Text style={styles.statValue}>{userStats.totalGames}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Wins</Text>
                      <Text style={styles.statValue}>{userStats.wins}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Average Score</Text>
                      <Text style={styles.statValue}>{userStats.averageScore.toFixed(1)}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.noDataText}>No stats yet</Text>
                )}
              </View>

              <View style={styles.playerStatsCard}>
                <Text style={styles.playerName}>{partnerName}</Text>
                {partnerStats ? (
                  <>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Best Score</Text>
                      <Text style={styles.statValue}>{partnerStats.bestScore}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Games Played</Text>
                      <Text style={styles.statValue}>{partnerStats.totalGames}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Wins</Text>
                      <Text style={styles.statValue}>{partnerStats.wins}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Average Score</Text>
                      <Text style={styles.statValue}>{partnerStats.averageScore.toFixed(1)}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.noDataText}>No stats yet</Text>
                )}
              </View>
            </View>

            <View style={styles.recentGamesSection}>
              <Text style={styles.sectionTitle}>Recent Games</Text>
              {scores.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No games played yet</Text>
                </View>
              ) : (
                <View style={styles.scoresList}>
                  {scores.slice(0, 10).map((score, index) => (
                    <View key={score.id} style={styles.scoreItem}>
                      <View style={styles.scoreItemLeft}>
                        <Text style={styles.scoreRank}>#{index + 1}</Text>
                        <Text style={styles.scoreDate}>
                          {new Date(score.playedAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={styles.scoreValue}>{score.score}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.globalTab}>
            <View style={styles.placeholderContainer}>
              <MaterialCommunityIcons
                name="earth"
                size={64}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.placeholderText}>
                Global leaderboard coming soon!
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  content: {
    flex: 1,
    padding: theme.spacing.base,
  },
  usTab: {
    gap: theme.spacing.lg,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.base,
  },
  playerStatsCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
  },
  playerName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  statValue: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  noDataText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  recentGamesSection: {
    marginTop: theme.spacing.base,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  scoresList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
  },
  scoreItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  scoreItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.base,
  },
  scoreRank: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
  },
  scoreDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  globalTab: {
    flex: 1,
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    marginTop: theme.spacing['2xl'],
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.base,
    textAlign: 'center',
  },
});
