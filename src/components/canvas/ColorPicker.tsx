/**
 * Color Picker Component
 * Sliding color picker modal with predefined palette
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';

interface ColorPickerProps {
  visible: boolean;
  currentColor: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}

const COLOR_PALETTE = [
  // Primary colors
  theme.colors.primary,
  theme.colors.secondary,
  theme.colors.accent,
  // Vibrant colors
  '#FF6B9D', // Pink
  '#C44569', // Dark pink
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#FDCB6E', // Orange
  '#E17055', // Red-orange
  '#6C5CE7', // Purple
  '#A29BFE', // Light purple
  // Pastels
  '#FFB3BA', // Pastel pink
  '#BAFFC9', // Pastel green
  '#BAE1FF', // Pastel blue
  '#FFFFBA', // Pastel yellow
  '#E6E6FA', // Pastel lavender
  '#C1FFC1', // Pastel mint
  '#FFE5B4', // Pastel peach
  '#FFB3B3', // Pastel coral
  '#DDA0DD', // Pastel lilac
  '#B0E0E6', // Pastel sky
  '#FFFACD', // Pastel lemon
  '#FFE4E1', // Pastel rose
  // Grayscale
  '#FFFFFF', // White
  '#E0E0E0', // Light gray
  '#9E9E9E', // Gray
  '#424242', // Dark gray
  '#000000', // Black
];

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export const ColorPicker: React.FC<ColorPickerProps> = ({
  visible,
  currentColor,
  onColorSelect,
  onClose,
}) => {
  const handleColorSelect = (color: string) => {
    onColorSelect(color);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose Color</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.colors.text}
              />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.colorGrid}
            showsVerticalScrollIndicator={false}>
            {COLOR_PALETTE.map((color, index) => (
              <Pressable
                key={index}
                style={[
                  styles.colorItem,
                  {
                    backgroundColor: color,
                    borderColor:
                      color === currentColor
                        ? theme.colors.primary
                        : theme.colors.border,
                    borderWidth: color === currentColor ? 3 : 1,
                  },
                ]}
                onPress={() => handleColorSelect(color)}>
                {color === currentColor && (
                  <MaterialCommunityIcons
                    name="check"
                    size={20}
                    color={
                      color === '#FFFFFF' || color === '#FFFFBA' || color === '#FFEAA7'
                        ? theme.colors.primary
                        : '#FFFFFF'
                    }
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>

          {/* Current color preview */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>Current Color</Text>
            <View
              style={[
                styles.previewColor,
                {backgroundColor: currentColor},
              ]}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.spacing.xl,
    borderTopRightRadius: theme.spacing.xl,
    padding: theme.spacing.base,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
    paddingBottom: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  scrollView: {
    maxHeight: 400,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  colorItem: {
    width: (SCREEN_WIDTH - theme.spacing.base * 4) / 6,
    height: (SCREEN_WIDTH - theme.spacing.base * 4) / 6,
    borderRadius: theme.spacing.md,
    margin: theme.spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.base,
    paddingTop: theme.spacing.base,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  previewLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  previewColor: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
});
