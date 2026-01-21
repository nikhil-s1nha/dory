/**
 * Game Result Modal Component
 * Displays game results with winner announcement
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';

interface GameResultModalProps {
  visible: boolean;
  winner?: string; // userId or 'draw'
  scores: {userId: string; score: number; name: string}[];
  onPlayAgain: () => void;
  onClose: () => void;
}

export const GameResultModal: React.FC<GameResultModalProps> = ({
  visible,
  winner,
  scores,
  onPlayAgain,
  onClose,
}) => {
  const winnerData = winner && winner !== 'draw' 
    ? scores.find(s => s.userId === winner)
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.content}>
            {winner === 'draw' ? (
              <>
                <MaterialCommunityIcons
                  name="handshake"
                  size={64}
                  color={theme.colors.primary}
                />
                <Text style={styles.title}>It's a Draw!</Text>
              </>
            ) : winnerData ? (
              <>
                <MaterialCommunityIcons
                  name="trophy"
                  size={64}
                  color={theme.colors.accent}
                />
                <Text style={styles.title}>{winnerData.name} Wins!</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={64}
                  color={theme.colors.primary}
                />
                <Text style={styles.title}>Game Complete!</Text>
              </>
            )}

            <View style={styles.scoresContainer}>
              {scores.map((score, index) => (
                <View key={score.userId} style={styles.scoreRow}>
                  <Text style={styles.playerName}>{score.name}</Text>
                  <Text style={styles.scoreValue}>{score.score}</Text>
                </View>
              ))}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.playAgainButton]}
                onPress={onPlayAgain}>
                <Text style={styles.playAgainText}>Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.closeButton]}
                onPress={onClose}>
                <Text style={styles.closeText}>Back to Games</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    maxWidth: 400,
  },
  content: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  scoresContainer: {
    width: '100%',
    marginBottom: theme.spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  playerName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  buttonContainer: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  button: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
  },
  playAgainButton: {
    backgroundColor: theme.colors.primary,
  },
  playAgainText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
  closeButton: {
    backgroundColor: theme.colors.backgroundDark,
  },
  closeText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
});
