/**
 * Question History Item Component
 * List item showing question summary in history
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Question, Answer} from '@utils/types';
import {theme} from '@theme';
import {format} from 'date-fns';

interface QuestionHistoryItemProps {
  question: Question;
  answers: Answer[];
  onPress: () => void;
}

export const QuestionHistoryItem: React.FC<QuestionHistoryItemProps> = ({
  question,
  answers,
  onPress,
}) => {
  const bothAnswered = answers.length === 2;
  const answerDate = answers[0]?.createdAt
    ? format(new Date(answers[0].createdAt), 'MMM d, yyyy')
    : '';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.category}>{question.category}</Text>
          {bothAnswered && (
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name="check-circle"
                size={16}
                color={theme.colors.success}
              />
            </View>
          )}
        </View>
        <Text style={styles.questionText} numberOfLines={2}>
          {question.text}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.date}>{answerDate}</Text>
          {bothAnswered && (
            <Text style={styles.status}>Both answered</Text>
          )}
        </View>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color={theme.colors.textSecondary}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  category: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  badge: {
    marginLeft: theme.spacing.xs,
  },
  questionText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
  },
  status: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
