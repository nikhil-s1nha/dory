/**
 * Welcome screen - First screen users see when not authenticated
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {AuthButton} from '@components/auth/AuthButton';
import {theme} from '@theme';
import type {AuthStackParamList} from '@utils/types';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <LinearGradient
      colors={[theme.colors.primary, theme.colors.secondary]}
      style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.appName}>Candle</Text>
            <Text style={styles.tagline}>
              Feel closer every day, in just minutes
            </Text>
          </View>

          <View style={styles.illustration}>
            <Text style={styles.emoji}>🕯️</Text>
          </View>

          <View style={styles.actions}>
            <AuthButton
              title="Sign In"
              onPress={() => navigation.navigate('Login')}
              variant="primary"
            />
            <AuthButton
              title="Create Account"
              onPress={() => navigation.navigate('Signup')}
              variant="secondary"
            />
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: theme.spacing.xl,
  },
  hero: {
    marginTop: theme.spacing['3xl'],
    alignItems: 'center',
  },
  appName: {
    ...theme.typography.styles.heading1,
    color: theme.colors.textInverse,
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  tagline: {
    ...theme.typography.styles.bodyLarge,
    color: theme.colors.textInverse,
    textAlign: 'center',
    opacity: 0.9,
  },
  illustration: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emoji: {
    fontSize: 120,
  },
  actions: {
    paddingBottom: theme.spacing.lg,
  },
});
