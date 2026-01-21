/**
 * This or That Input Component
 * Two large buttons side-by-side with immediate submission
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {Question} from '@utils/types';
import {theme} from '@theme';

interface ThisOrThatInputProps {
  question: Question;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

export const ThisOrThatInput: React.FC<ThisOrThatInputProps> = ({
  question,
  onSubmit,
  disabled = false,
}) => {
  const handleSelect = (option: string) => {
    if (!disabled) {
      onSubmit(option);
    }
  };

  if (!question.options || question.options.length !== 2) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          This question requires exactly 2 options
        </Text>
      </View>
    );
  }

  const [option1, option2] = question.options;

  return (
    <View style={styles.container}>
      <View style={styles.optionsRow}>
        <TouchableOpacity
          style={[
            styles.optionButton,
            styles.optionButtonLeft,
            disabled && styles.optionButtonDisabled,
          ]}
          onPress={() => handleSelect(option1)}
          disabled={disabled}>
          <Text style={styles.optionText}>{option1}</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <Text style={styles.orText}>OR</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.optionButton,
            styles.optionButtonRight,
            disabled && styles.optionButtonDisabled,
          ]}
          onPress={() => handleSelect(option2)}
          disabled={disabled}>
          <Text style={styles.optionText}>{option2}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  optionsRow: {
    flexDirection: 'row',
    height: 200,
    marginVertical: theme.spacing.base,
  },
  optionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
  },
  optionButtonLeft: {
    backgroundColor: theme.colors.primary,
    marginRight: theme.spacing.xs,
  },
  optionButtonRight: {
    backgroundColor: theme.colors.secondary,
    marginLeft: theme.spacing.xs,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
    textAlign: 'center',
  },
  divider: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{translateX: -20}, {translateY: -10}],
    backgroundColor: theme.colors.surface,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    zIndex: 1,
  },
  orText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  errorContainer: {
    padding: theme.spacing.base,
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.error,
    textAlign: 'center',
  },
});
