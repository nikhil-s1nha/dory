/**
 * Game Timer Component
 * Countdown timer with visual indicator
 */

import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {theme} from '@theme';

interface GameTimerProps {
  duration: number; // seconds
  onComplete: () => void;
  paused?: boolean;
}

export const GameTimer: React.FC<GameTimerProps> = ({
  duration,
  onComplete,
  paused = false,
}) => {
  const [timeRemaining, setTimeRemaining] = useState(duration);

  useEffect(() => {
    setTimeRemaining(duration);
  }, [duration]);

  useEffect(() => {
    if (paused || timeRemaining <= 0) {
      if (timeRemaining <= 0) {
        onComplete();
      }
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, paused, onComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = timeRemaining / duration;

  return (
    <View style={styles.container}>
      <View style={styles.timerContainer}>
        <Text style={styles.timeText}>{formatTime(timeRemaining)}</Text>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {width: `${progress * 100}%`},
              timeRemaining < 10 && styles.progressBarWarning,
            ]}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  timerContainer: {
    width: 200,
    alignItems: 'center',
  },
  timeText: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  progressBarWarning: {
    backgroundColor: theme.colors.accent,
  },
});
