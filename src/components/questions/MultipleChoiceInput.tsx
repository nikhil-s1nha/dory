/**
 * Multiple Choice Input Component
 * Display options as selectable buttons
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {Question} from '@utils/types';
import {theme} from '@theme';

interface MultipleChoiceInputProps {
  question: Question;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

export const MultipleChoiceInput: React.FC<MultipleChoiceInputProps> = ({
  question,
  onSubmit,
  disabled = false,
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleSelect = (option: string) => {
    if (!disabled) {
      setSelectedOption(option);
    }
  };

  const handleSubmit = () => {
    if (selectedOption && !disabled) {
      onSubmit(selectedOption);
    }
  };

  if (!question.options || question.options.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No options available for this question</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {question.options.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.optionButton,
            selectedOption === option && styles.optionButtonSelected,
            disabled && styles.optionButtonDisabled,
          ]}
          onPress={() => handleSelect(option)}
          disabled={disabled}>
          <Text
            style={[
              styles.optionText,
              selectedOption === option && styles.optionTextSelected,
            ]}>
            {option}
          </Text>
          {selectedOption === option && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[
          styles.submitButton,
          (!selectedOption || disabled) && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={!selectedOption || disabled}>
        <Text style={styles.submitButtonText}>Submit</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  optionButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight + '20', // 20% opacity
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    flex: 1,
  },
  optionTextSelected: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primaryDark,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.base,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.base,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.textLight,
  },
  submitButtonText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  errorContainer: {
    padding: theme.spacing.base,
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.error,
  },
});
