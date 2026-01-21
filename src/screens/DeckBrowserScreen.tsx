/**
 * Deck Browser Screen
 * Full-screen deck browser with search and filter
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {theme} from '@theme';
import {DeckBrowser} from '@components/questions/DeckBrowser';
import {useQuestionStore} from '@store/questionSlice';

export const DeckBrowserScreen = () => {
  const navigation = useNavigation();
  const {setSelectedDeck} = useQuestionStore();

  const handleSelectDeck = (deckId: string) => {
    // Set the selected deck in the store
    setSelectedDeck(deckId);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Question Decks</Text>
        <View style={styles.backButton} />
      </View>

      {/* Deck Browser */}
      <DeckBrowser onSelectDeck={handleSelectDeck} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
});
