/**
 * Text Answer Input Component
 * Multi-line text input with character counter
 */

import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import {Question} from '@utils/types';
import {theme} from '@theme';

interface TextAnswerInputProps {
  question: Question;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

const MAX_LENGTH = 500;

export const TextAnswerInput: React.FC<TextAnswerInputProps> = ({
  question,
  onSubmit,
  disabled = false,
}) => {
  const [answer, setAnswer] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (answer.trim().length > 0 && !disabled) {
      onSubmit(answer.trim());
      Keyboard.dismiss();
    }
  };

  const characterCount = answer.length;
  const isOverLimit = characterCount > MAX_LENGTH;

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          isOverLimit && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
        placeholder="Type your answer here..."
        placeholderTextColor={theme.colors.textLight}
        value={answer}
        onChangeText={setAnswer}
        multiline
        maxLength={MAX_LENGTH}
        editable={!disabled}
        textAlignVertical="top"
      />
      <View style={styles.footer}>
        <Text
          style={[
            styles.counter,
            isOverLimit && styles.counterError,
          ]}>
          {characterCount}/{MAX_LENGTH}
        </Text>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (answer.trim().length === 0 || disabled || isOverLimit) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={answer.trim().length === 0 || disabled || isOverLimit}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    minHeight: 120,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.base,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  inputDisabled: {
    backgroundColor: theme.colors.backgroundDark,
    color: theme.colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  counterError: {
    color: theme.colors.error,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.spacing.md,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.textLight,
  },
  submitButtonText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
});
