/**
 * Games Screen
 * Game selection interface with grid layout and stats
 */

import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {getUserStats} from '@services/gameScoreService';
import {MainStackParamList} from '@utils/types';
import {theme} from '@theme';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface Game {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const games: Game[] = [
  {
    id: 'whos_more_likely',
    name: "Who's More Likely",
    icon: 'account-question',
    description: 'Vote and see if you agree!',
  },
  {
    id: 'anagrams',
    name: 'Anagrams',
    icon: 'alphabetical-variant',
    description: 'Race to unscramble words',
  },
  {
    id: 'what_you_saying',
    name: "What You Saying?",
    icon: 'message-text',
    description: 'Describe and guess together',
  },
  {
    id: 'four_in_a_row',
    name: 'Four-in-a-Row',
    icon: 'view-grid',
    description: 'Classic strategy showdown',
  },
  {
    id: 'draw_duel',
    name: 'Draw Duel',
    icon: 'draw',
    description: 'Draw fast, win hearts',
  },
  {
    id: 'perfect_pair',
    name: 'Perfect Pair',
    icon: 'heart-multiple',
    description: 'Match cards, beat the clock',
  },
  {
    id: 'sticker_generator',
    name: 'Sticker Generator',
    icon: 'emoticon-happy',
    description: 'Create custom couple stickers',
  },
];

export const GamesScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [stats, setStats] = useState({
    gamesWon: 0,
    totalGames: 0,
    bestScore: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !partnership) {
        setIsLoadingStats(false);
        return;
      }

      try {
        setIsLoadingStats(true);
        // Get stats across all games
        const gameTypes = ['whos_more_likely', 'anagrams', 'what_you_saying', 'four_in_a_row', 'draw_duel', 'perfect_pair'];
        let totalWins = 0;
        let totalGames = 0;
        let bestScore = 0;

        for (const gameType of gameTypes) {
          const userStats = await getUserStats(user.id, gameType);
          totalWins += userStats.wins;
          totalGames += userStats.totalGames;
          if (userStats.bestScore > bestScore) {
            bestScore = userStats.bestScore;
          }
        }

        setStats({
          gamesWon: totalWins,
          totalGames,
          bestScore,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchStats();
  }, [user, partnership]);

  const handleGamePress = (gameId: string) => {
    const routeMap: Record<string, keyof MainStackParamList> = {
      'whos_more_likely': 'WhosMoreLikely',
      'anagrams': 'Anagrams',
      'what_you_saying': 'WhatYouSaying',
      'four_in_a_row': 'FourInARow',
      'draw_duel': 'DrawDuel',
      'perfect_pair': 'PerfectPair',
      'sticker_generator': 'StickerGenerator',
    };

    const route = routeMap[gameId];
    if (route) {
      navigation.navigate(route);
    }
  };

  const handleViewLeaderboard = () => {
    // Navigate to a general leaderboard or show all games
    // For now, we'll navigate to the first game's leaderboard as an example
    if (partnership) {
      navigation.navigate('GameLeaderboard', {
        gameType: 'whos_more_likely',
        gameName: "Who's More Likely",
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Games</Text>
        </View>

        {/* Game Grid */}
        <View style={styles.section}>
          <View style={styles.gameGrid}>
            {games.map(game => (
              <TouchableOpacity
                key={game.id}
                style={styles.gameCard}
                onPress={() => handleGamePress(game.id)}>
                <View style={styles.gameIconContainer}>
                  <MaterialCommunityIcons
                    name={game.icon as any}
                    size={40}
                    color={theme.colors.primary}
                  />
                </View>
                <Text style={styles.gameName}>{game.name}</Text>
                <Text style={styles.gameDescription}>{game.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Stats</Text>
            <TouchableOpacity onPress={handleViewLeaderboard}>
              <Text style={styles.leaderboardLink}>View Leaderboard</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.statsCard}>
            {isLoadingStats ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <>
                <View style={styles.statRow}>
                  <MaterialCommunityIcons
                    name="trophy"
                    size={24}
                    color={theme.colors.accent}
                  />
                  <View style={styles.statInfo}>
                    <Text style={styles.statLabel}>Games Won</Text>
                    <Text style={styles.statValue}>{stats.gamesWon}</Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statRow}>
                  <MaterialCommunityIcons
                    name="gamepad-variant"
                    size={24}
                    color={theme.colors.secondary}
                  />
                  <View style={styles.statInfo}>
                    <Text style={styles.statLabel}>Total Games</Text>
                    <Text style={styles.statValue}>{stats.totalGames}</Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statRow}>
                  <MaterialCommunityIcons
                    name="star"
                    size={24}
                    color={theme.colors.accent}
                  />
                  <View style={styles.statInfo}>
                    <Text style={styles.statLabel}>Best Score</Text>
                    <Text style={styles.statValue}>{stats.bestScore}</Text>
                  </View>
                </View>
              </>
            )}
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
  header: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  section: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  leaderboardLink: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  gameGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.base,
  },
  gameCard: {
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
    minHeight: 160,
  },
  gameIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  gameName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  gameDescription: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  statsCard: {
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
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  statInfo: {
    marginLeft: theme.spacing.base,
    flex: 1,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  statDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  bottomSpacing: {
    height: theme.spacing['2xl'],
  },
});
