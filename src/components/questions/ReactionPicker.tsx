/**
 * Reaction Picker Component
 * Modal/bottom sheet with emoji picker
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
} from 'react-native';
import {theme} from '@theme';

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const COMMON_REACTIONS = ['❤️', '😂', '😍', '🥰', '😮', '🤔', '👏', '🔥'];

// Extended emoji list (you can expand this)
const EXTENDED_EMOJIS = [
  '😊', '😢', '😡', '🤗', '👍', '👎', '🎉', '💯',
  '✨', '🌟', '💕', '💖', '💝', '🎊', '🙌', '😎',
];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  visible,
  onSelect,
  onClose,
}) => {
  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  const renderEmoji = ({item}: {item: string}) => (
    <TouchableOpacity
      style={styles.emojiButton}
      onPress={() => handleSelect(item)}>
      <Text style={styles.emoji}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              <Text style={styles.title}>Add a Reaction</Text>

              {/* Common Reactions */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Reactions</Text>
                <FlatList
                  data={COMMON_REACTIONS}
                  renderItem={renderEmoji}
                  keyExtractor={(item, index) => `common-${index}`}
                  numColumns={4}
                  scrollEnabled={false}
                />
              </View>

              {/* Extended Reactions */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>More Reactions</Text>
                <FlatList
                  data={EXTENDED_EMOJIS}
                  renderItem={renderEmoji}
                  keyExtractor={(item, index) => `extended-${index}`}
                  numColumns={4}
                  scrollEnabled={false}
                />
              </View>

              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.spacing.lg,
    borderTopRightRadius: theme.spacing.lg,
    padding: theme.spacing.base,
    maxHeight: '70%',
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  emojiButton: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    margin: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.sm,
  },
  emoji: {
    fontSize: theme.typography.fontSize['2xl'],
  },
  closeButton: {
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    alignItems: 'center',
    marginTop: theme.spacing.base,
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
});
