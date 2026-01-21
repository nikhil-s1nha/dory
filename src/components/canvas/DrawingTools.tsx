/**
 * Drawing Tools Component
 * Toolbar with brush widths, color picker, eraser, background toggle, and clear
 */

import React, {useState} from 'react';
import {View, StyleSheet, TouchableOpacity, Alert} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {ColorPicker} from './ColorPicker';

export type BrushWidth = 2 | 5 | 10;
export type BackgroundColor = 'black' | 'white' | 'beige';
export type DrawingTool = 'brush' | 'eraser' | 'paintBucket';

interface DrawingToolsProps {
  currentColor: string;
  currentBrushWidth: BrushWidth;
  currentTool: DrawingTool;
  backgroundColor: BackgroundColor;
  onColorChange: (color: string) => void;
  onBrushWidthChange: (width: BrushWidth) => void;
  onToolChange: (tool: DrawingTool) => void;
  onBackgroundChange: (bg: BackgroundColor) => void;
  onClear: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const BRUSH_WIDTHS: {width: BrushWidth; label: string}[] = [
  {width: 2, label: 'Thin'},
  {width: 5, label: 'Medium'},
  {width: 10, label: 'Thick'},
];

export const DrawingTools: React.FC<DrawingToolsProps> = ({
  currentColor,
  currentBrushWidth,
  currentTool,
  backgroundColor,
  onColorChange,
  onBrushWidthChange,
  onToolChange,
  onBackgroundChange,
  onClear,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleClear = () => {
    Alert.alert(
      'Clear Canvas',
      'Are you sure you want to clear the entire canvas? This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Clear', style: 'destructive', onPress: onClear},
      ],
    );
  };

  const getBackgroundColorValue = (bg: BackgroundColor): string => {
    switch (bg) {
      case 'black':
        return '#000000';
      case 'white':
        return '#FFFFFF';
      case 'beige':
        return theme.colors.background;
      default:
        return '#000000';
    }
  };

  const handleBackgroundToggle = () => {
    if (backgroundColor === 'black') {
      onBackgroundChange('white');
    } else if (backgroundColor === 'white') {
      onBackgroundChange('beige');
    } else {
      onBackgroundChange('black');
    }
  };

  return (
    <View style={styles.container}>
      {/* Brush Width Selector */}
      <View style={styles.brushWidthContainer}>
        {BRUSH_WIDTHS.map(({width, label}) => (
          <TouchableOpacity
            key={width}
            style={[
              styles.brushWidthButton,
              currentBrushWidth === width && styles.brushWidthButtonActive,
            ]}
            onPress={() => onBrushWidthChange(width)}>
            <View
              style={[
                styles.brushPreview,
                {
                  width: width * 2,
                  height: width * 2,
                  backgroundColor:
                    currentTool === 'eraser'
                      ? getBackgroundColorValue(backgroundColor)
                      : currentColor,
                },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Tool Buttons */}
      <View style={styles.toolsContainer}>
        {/* Undo Button */}
        {onUndo && (
          <TouchableOpacity
            style={[styles.toolButton, !canUndo && styles.toolButtonDisabled]}
            onPress={onUndo}
            disabled={!canUndo}>
            <MaterialCommunityIcons
              name="arrow-u-left-top"
              size={24}
              color={
                canUndo
                  ? theme.colors.textSecondary
                  : theme.colors.textLight
              }
            />
          </TouchableOpacity>
        )}

        {/* Redo Button */}
        {onRedo && (
          <TouchableOpacity
            style={[styles.toolButton, !canRedo && styles.toolButtonDisabled]}
            onPress={onRedo}
            disabled={!canRedo}>
            <MaterialCommunityIcons
              name="arrow-u-right-top"
              size={24}
              color={
                canRedo
                  ? theme.colors.textSecondary
                  : theme.colors.textLight
              }
            />
          </TouchableOpacity>
        )}

        {/* Color Picker Button */}
        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => setShowColorPicker(true)}>
          <View
            style={[
              styles.colorPreview,
              {backgroundColor: currentColor},
            ]}
          />
          <MaterialCommunityIcons
            name="palette"
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Eraser Toggle */}
        <TouchableOpacity
          style={[
            styles.toolButton,
            currentTool === 'eraser' && styles.toolButtonActive,
          ]}
          onPress={() =>
            onToolChange(currentTool === 'brush' ? 'eraser' : 'brush')
          }>
          <MaterialCommunityIcons
            name="eraser"
            size={24}
            color={
              currentTool === 'eraser'
                ? theme.colors.primary
                : theme.colors.textSecondary
            }
          />
        </TouchableOpacity>

        {/* Background Toggle */}
        <TouchableOpacity
          style={[
            styles.toolButton,
            styles.backgroundButton,
            {borderColor: getBackgroundColorValue(backgroundColor)},
          ]}
          onPress={handleBackgroundToggle}>
          <View
            style={[
              styles.backgroundPreview,
              {backgroundColor: getBackgroundColorValue(backgroundColor)},
            ]}
          />
          <MaterialCommunityIcons
            name="invert-colors"
            size={20}
            color={theme.colors.textSecondary}
            style={styles.backgroundIcon}
          />
        </TouchableOpacity>

        {/* Paint Bucket Tool */}
        <TouchableOpacity
          style={[
            styles.toolButton,
            currentTool === 'paintBucket' && styles.toolButtonActive,
          ]}
          onPress={() => {
            onToolChange(currentTool === 'paintBucket' ? 'brush' : 'paintBucket');
          }}>
          <MaterialCommunityIcons
            name="format-color-fill"
            size={24}
            color={
              currentTool === 'paintBucket'
                ? theme.colors.primary
                : theme.colors.textSecondary
            }
          />
        </TouchableOpacity>

        {/* Clear Button */}
        <TouchableOpacity
          style={[styles.toolButton, styles.clearButton]}
          onPress={handleClear}>
          <MaterialCommunityIcons
            name="delete-outline"
            size={24}
            color={theme.colors.error}
          />
        </TouchableOpacity>
      </View>

      {/* Color Picker Modal */}
      <ColorPicker
        visible={showColorPicker}
        currentColor={currentColor}
        onColorSelect={onColorChange}
        onClose={() => setShowColorPicker(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  brushWidthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  brushWidthButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  brushWidthButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.backgroundDark,
  },
  brushPreview: {
    borderRadius: 20,
  },
  toolsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  toolButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
  },
  toolButtonActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  toolButtonDisabled: {
    opacity: 0.4,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginBottom: 2,
  },
  clearButton: {
    backgroundColor: theme.colors.backgroundDark,
  },
  backgroundButton: {
    borderWidth: 2,
    position: 'relative',
  },
  backgroundPreview: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 16,
  },
  backgroundIcon: {
    zIndex: 1,
  },
});
