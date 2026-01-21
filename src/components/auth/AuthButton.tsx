/**
 * Reusable auth button component with loading state
 */

import React from 'react';
import {Button} from 'react-native-paper';
import {StyleSheet} from 'react-native';
import {theme} from '@theme';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}) => {
  const isPrimary = variant === 'primary';

  return (
    <Button
      mode={isPrimary ? 'contained' : 'outlined'}
      onPress={onPress}
      loading={loading}
      disabled={disabled || loading}
      style={styles.button}
      contentStyle={styles.buttonContent}
      labelStyle={[
        styles.buttonLabel,
        !isPrimary && {color: theme.colors.primary},
      ]}
      buttonColor={isPrimary ? theme.colors.primary : undefined}
      textColor={isPrimary ? theme.colors.textInverse : theme.colors.primary}>
      {title}
    </Button>
  );
};

const styles = StyleSheet.create({
  button: {
    marginVertical: theme.spacing.xs,
  },
  buttonContent: {
    paddingVertical: theme.spacing.sm,
  },
  buttonLabel: {
    ...theme.typography.styles.button,
  },
});
