/**
 * Reusable auth input component with validation
 */

import React from 'react';
import {TextInput, HelperText} from 'react-native-paper';
import {StyleSheet} from 'react-native';
import {theme} from '@theme';

interface AuthInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  right?: React.ReactNode;
}

export const AuthInput: React.FC<AuthInputProps> = ({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  right,
}) => {
  return (
    <>
      <TextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        mode="outlined"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        error={!!error}
        style={styles.input}
        contentStyle={styles.inputContent}
        outlineColor={theme.colors.border}
        activeOutlineColor={theme.colors.primary}
        right={right}
      />
      {error && (
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  input: {
    marginVertical: theme.spacing.xs,
  },
  inputContent: {
    ...theme.typography.styles.body,
  },
});
