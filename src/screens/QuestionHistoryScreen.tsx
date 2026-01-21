/**
 * Question History Screen
 * List of previously answered questions
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useNavigation} from '@react-navigation/native';
import {QuestionHistoryItem} from '@components/questions/QuestionHistoryItem';
import {getAnswers} from '@services/questionService';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {loadAllQuestions} from '@utils/questionLoader';
import {Question, Answer} from '@utils/types';

export const QuestionHistoryScreen = () => {
  const navigation = useNavigation();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [history, setHistory] = useState<Array<{question: Question; answers: Answer[]}>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [partnership, user]);

  const loadHistory = async () => {
    if (!partnership || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // In production, you'd fetch this from Firestore
      // For now, this is a placeholder that would need proper implementation
      // You'd query answers collection filtered by partnershipId and userId
      const allQuestions = loadAllQuestions();
      
      // Placeholder: In production, fetch actual answered questions from Firestore
      // const answers = await getAnswersForPartnership(partnership.id);
      setHistory([]);
      setLoading(false);
    } catch (error) {
      console.error('Error loading history:', error);
      setLoading(false);
    }
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch =
      searchQuery === '' ||
      item.question.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === null || item.question.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleItemPress = (question: Question, answers: Answer[]) => {
    navigation.navigate('QuestionDetail', {
      question,
      answers,
    } as any);
  };

  const categories = Array.from(
    new Set(history.map(item => item.question.category)),
  );

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
        <Text style={styles.headerTitle}>Question History</Text>
        <View style={styles.backButton} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={theme.colors.textSecondary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search questions..."
          placeholderTextColor={theme.colors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filter */}
      {categories.length > 0 && (
        <View style={styles.categoryFilter}>
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === null && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(null)}>
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === null && styles.categoryChipTextActive,
              ]}>
              All
            </Text>
          </TouchableOpacity>
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
                {category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : filteredHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="message-question-outline"
            size={64}
            color={theme.colors.textLight}
          />
          <Text style={styles.emptyText}>No questions answered yet</Text>
          <Text style={styles.emptySubtext}>
            Start answering questions to see your history here
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          renderItem={({item}) => (
            <QuestionHistoryItem
              question={item.question}
              answers={item.answers}
              onPress={() => handleItemPress(item.question, item.answers)}
            />
          )}
          keyExtractor={item => item.question.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    margin: theme.spacing.base,
    paddingHorizontal: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    paddingVertical: theme.spacing.sm,
  },
  categoryFilter: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.base,
    flexWrap: 'wrap',
  },
  categoryChip: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
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
    padding: theme.spacing.base,
    paddingBottom: theme.spacing['2xl'],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
