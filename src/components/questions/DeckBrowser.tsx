/**
 * Deck Browser Component
 * Grid layout of deck categories
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {theme} from '@theme';
import {getDeckMetadata, DeckMetadata} from '@utils/questionLoader';
import {DeckCard} from './DeckCard';

interface DeckBrowserProps {
  onSelectDeck: (deckId: string) => void;
}

const ALL_CATEGORIES = 'all';

export const DeckBrowser: React.FC<DeckBrowserProps> = ({onSelectDeck}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);
  const decks = getDeckMetadata();

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(decks.map(deck => deck.category)),
    );
    return [ALL_CATEGORIES, ...uniqueCategories];
  }, [decks]);

  const filteredDecks = useMemo(() => {
    if (selectedCategory === ALL_CATEGORIES) {
      return decks;
    }
    return decks.filter(deck => deck.category === selectedCategory);
  }, [decks, selectedCategory]);

  const getCategoryLabel = (category: string) => {
    if (category === ALL_CATEGORIES) return 'All';
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
  };

  return (
    <View style={styles.container}>
      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}>
        {categories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}>
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === category && styles.categoryChipTextActive,
              ]}>
              {getCategoryLabel(category)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Deck List */}
      <FlatList
        data={filteredDecks}
        renderItem={({item}) => (
          <DeckCard deck={item} onPress={() => onSelectDeck(item.id)} />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  categoryScroll: {
    maxHeight: 60,
    marginBottom: theme.spacing.base,
  },
  categoryScrollContent: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryChipText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  categoryChipTextActive: {
    color: theme.colors.textInverse,
  },
  listContent: {
    paddingHorizontal: theme.spacing.base,
    paddingBottom: theme.spacing.xl,
  },
});
