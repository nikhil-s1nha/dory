/**
 * Date Ideas Screen
 * Date discovery interface with swipeable cards and matched dates
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {DateCard} from '@components/dateIdeas';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {
  requestLocationPermission,
  getUserLocation,
  fetchDateIdeas,
  swipeOnDate,
  getUserSwipes,
  subscribeToMatches,
  updateMatchStatus,
} from '@services/dateIdeasService';
import type {DateIdea, DateMatch, MainStackParamList} from '@utils/types';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const categories = ['All', 'Restaurants', 'Activities', 'Events', 'Outdoors'];

export const DateIdeasScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();

  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [dateIdeas, setDateIdeas] = useState<DateIdea[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState<(DateMatch & {dateIdea?: DateIdea})[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [lastMatch, setLastMatch] = useState<DateMatch | null>(null);
  const [lastFetchCount, setLastFetchCount] = useState<number | null>(null);

  // Initialize location and fetch date ideas
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const hasPermission = await requestLocationPermission();
        if (hasPermission) {
          const location = await getUserLocation();
          setCurrentLocation(location);
        } else {
          // Use default location
          setCurrentLocation({latitude: 37.7749, longitude: -122.4194});
        }
      } catch (error) {
        console.error('Error initializing location:', error);
        setCurrentLocation({latitude: 37.7749, longitude: -122.4194});
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  // Fetch date ideas when location or category changes
  useEffect(() => {
    const loadDateIdeas = async () => {
      if (!currentLocation || !partnership || !user) return;

      try {
        setLoading(true);
        const ideas = await fetchDateIdeas(
          currentLocation,
          selectedCategory === 'All' ? undefined : selectedCategory,
        );

        // Get user's swipe history to filter out already-swiped dates
        const userSwipes = await getUserSwipes(partnership.id, user.id);
        const swipedDateIds = new Set(userSwipes.map(swipe => swipe.dateIdeaId));
        setSwipedIds(swipedDateIds);

        // Filter out already-swiped dates
        const availableIdeas = ideas.filter(
          idea => !swipedDateIds.has(idea.id),
        );

        setDateIdeas(availableIdeas);
        setCurrentIndex(0);
        setLastFetchCount(availableIdeas.length);
      } catch (error: any) {
        console.error('Error fetching date ideas:', error);
        Alert.alert('Error', 'Failed to load date ideas. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadDateIdeas();
  }, [currentLocation, selectedCategory, partnership, user]);

  // Subscribe to matches
  useEffect(() => {
    if (!partnership) return;

    const unsubscribe = subscribeToMatches(partnership.id, updatedMatches => {
      setMatches(updatedMatches);
    });

    return unsubscribe;
  }, [partnership]);

  // Handle swipe left (pass)
  const handleSwipeLeft = useCallback(async () => {
    if (!partnership || !user || currentIndex >= dateIdeas.length) return;

    const currentIdea = dateIdeas[currentIndex];
    try {
      await swipeOnDate(partnership.id, user.id, currentIdea.id, 'left');
      setSwipedIds(prev => new Set([...prev, currentIdea.id]));
      setCurrentIndex(prev => prev + 1);
    } catch (error: any) {
      console.error('Error swiping left:', error);
      Alert.alert('Error', 'Failed to record swipe. Please try again.');
    }
  }, [partnership, user, dateIdeas, currentIndex]);

  // Handle swipe right (like)
  const handleSwipeRight = useCallback(async () => {
    if (!partnership || !user || currentIndex >= dateIdeas.length) return;

    const currentIdea = dateIdeas[currentIndex];
    try {
      const result = await swipeOnDate(
        partnership.id,
        user.id,
        currentIdea.id,
        'right',
      );
      setSwipedIds(prev => new Set([...prev, currentIdea.id]));
      setCurrentIndex(prev => prev + 1);

      // Show match modal if matched
      if (result.matched && result.match) {
        setLastMatch(result.match);
        setShowMatchModal(true);
      }
    } catch (error: any) {
      console.error('Error swiping right:', error);
      Alert.alert('Error', 'Failed to record swipe. Please try again.');
    }
  }, [partnership, user, dateIdeas, currentIndex]);

  // Refresh date ideas
  const handleRefresh = useCallback(async () => {
    if (!currentLocation || !partnership || !user) return;

    try {
      setRefreshing(true);
      const ideas = await fetchDateIdeas(
        currentLocation,
        selectedCategory === 'All' ? undefined : selectedCategory,
      );

      // Get user's swipe history
      const userSwipes = await getUserSwipes(partnership.id, user.id);
      const swipedDateIds = new Set(userSwipes.map(swipe => swipe.dateIdeaId));

      // Filter out already-swiped dates
      const availableIdeas = ideas.filter(
        idea => !swipedDateIds.has(idea.id),
      );

      setDateIdeas(availableIdeas);
      setCurrentIndex(0);
      setLastFetchCount(availableIdeas.length);
    } catch (error: any) {
      console.error('Error refreshing date ideas:', error);
      Alert.alert('Error', 'Failed to refresh date ideas. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [currentLocation, selectedCategory, partnership, user]);

  // Load more ideas when running low
  useEffect(() => {
    // Only auto-refresh if:
    // 1. We're running low on cards
    // 2. Not currently loading or refreshing
    // 3. We have ideas currently (dateIdeas.length > 0)
    // 4. Previous fetch returned results (lastFetchCount !== 0)
    if (
      dateIdeas.length - currentIndex < 3 &&
      !loading &&
      !refreshing &&
      dateIdeas.length > 0 &&
      lastFetchCount !== 0
    ) {
      // Load more ideas
      handleRefresh();
    }
  }, [currentIndex, dateIdeas.length, loading, refreshing, handleRefresh, lastFetchCount]);

  // Render card stack (top 3 cards)
  const renderCardStack = () => {
    if (loading && dateIdeas.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading date ideas...</Text>
        </View>
      );
    }

    if (currentIndex >= dateIdeas.length) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="calendar-heart"
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.emptyText}>No more date ideas</Text>
          <Text style={styles.emptyDescription}>
            Check back later for new suggestions!
          </Text>
          <TouchableOpacity
            style={styles.refreshButtonSmall}
            onPress={handleRefresh}>
            <MaterialCommunityIcons
              name="refresh"
              size={20}
              color={theme.colors.primary}
            />
            <Text style={styles.refreshButtonTextSmall}>Refresh</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const visibleCards = dateIdeas.slice(currentIndex, currentIndex + 3);

    return (
      <View style={styles.cardStack}>
        {visibleCards.map((idea, index) => {
          const isTopCard = index === 0;
          const zIndex = 3 - index;
          const scale = 1 - index * 0.05;
          const opacity = 1 - index * 0.3;

          return (
            <View
              key={idea.id}
              style={[
                styles.cardWrapper,
                {
                  zIndex,
                  transform: [{scale}],
                  opacity,
                },
              ]}>
              <DateCard
                dateIdea={idea}
                onSwipeLeft={isTopCard ? handleSwipeLeft : undefined}
                onSwipeRight={isTopCard ? handleSwipeRight : undefined}
                isActive={isTopCard}
              />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Date Ideas</Text>
        <View style={styles.locationContainer}>
          <MaterialCommunityIcons
            name="map-marker"
            size={16}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.locationText}>
            {currentLocation
              ? 'Current Location'
              : 'San Francisco, CA'}
          </Text>
        </View>
      </View>

      {/* Swipeable Card Stack */}
      <View style={styles.swipeSection}>{renderCardStack()}</View>

      {/* Filter Categories */}
      <View style={styles.section}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContainer}>
          {categories.map(category => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(category)}>
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category && styles.categoryTextActive,
                ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Matched Dates Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Matched Dates</Text>
          {matches.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{matches.length}</Text>
            </View>
          )}
        </View>
        {matches.length === 0 ? (
          <View style={styles.matchedCard}>
            <MaterialCommunityIcons
              name="heart-multiple"
              size={32}
              color={theme.colors.primary}
            />
            <Text style={styles.matchedText}>
              You haven't matched on any dates yet
            </Text>
            <Text style={styles.matchedDescription}>
              Swipe on date ideas and see which ones you both like!
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchesContainer}>
            {matches.map(match => (
              <TouchableOpacity
                key={match.id}
                style={styles.matchCard}
                onPress={() => {
                  if (match.dateIdea) {
                    navigation.navigate('DateIdeaDetail', {
                      dateIdea: match.dateIdea,
                    });
                  } else {
                    navigation.navigate('DateIdeaDetail', {
                      dateIdeaId: match.dateIdeaId,
                    });
                  }
                }}>
                {match.dateIdea?.imageUrl ? (
                  <Image
                    source={{uri: match.dateIdea.imageUrl}}
                    style={styles.matchImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.matchImagePlaceholder}>
                    <MaterialCommunityIcons
                      name="calendar-heart"
                      size={32}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                )}
                <View style={styles.matchBadge}>
                  <MaterialCommunityIcons
                    name="heart"
                    size={16}
                    color={theme.colors.textInverse}
                  />
                </View>
                <Text style={styles.matchTitle} numberOfLines={2}>
                  {match.dateIdea?.title || 'Date Idea'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Refresh Ideas Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <MaterialCommunityIcons
              name="refresh"
              size={24}
              color={theme.colors.primary}
            />
          )}
          <Text style={styles.refreshButtonText}>Refresh Ideas</Text>
        </TouchableOpacity>
      </View>

      {/* Match Modal */}
      <Modal
        visible={showMatchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMatchModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <MaterialCommunityIcons
              name="heart"
              size={64}
              color={theme.colors.success}
            />
            <Text style={styles.modalTitle}>It's a Match!</Text>
            <Text style={styles.modalText}>
              You both liked this date idea!
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowMatchModal(false);
                if (lastMatch?.dateIdeaId) {
                  navigation.navigate('DateIdeaDetail', {
                    dateIdeaId: lastMatch.dateIdeaId,
                  });
                }
              }}>
              <Text style={styles.modalButtonText}>View Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalButtonSecondary}
              onPress={() => setShowMatchModal(false)}>
              <Text style={styles.modalButtonTextSecondary}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  swipeSection: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
    height: 500,
  },
  cardStack: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.xs,
  },
  emptyDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.base,
  },
  refreshButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
  },
  refreshButtonTextSmall: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  section: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  badgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  categoryContainer: {
    gap: theme.spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
  },
  categoryButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  categoryText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  categoryTextActive: {
    color: theme.colors.textInverse,
  },
  matchedCard: {
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
  matchedText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.sm,
  },
  matchedDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  matchesContainer: {
    gap: theme.spacing.base,
  },
  matchCard: {
    width: 150,
    marginRight: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  matchImage: {
    width: '100%',
    height: 120,
  },
  matchImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchBadge: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    backgroundColor: theme.colors.success,
    borderRadius: theme.spacing.md,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    padding: theme.spacing.sm,
  },
  refreshButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  refreshButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
    alignItems: 'center',
    width: '80%',
  },
  modalTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.sm,
  },
  modalText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  modalButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  modalButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  modalButtonSecondary: {
    backgroundColor: 'transparent',
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonTextSecondary: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
});
