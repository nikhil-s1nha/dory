/**
 * Canvas Editor Screen
 * Full-screen canvas editor with drawing tools
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Canvas, CanvasErrorBoundary} from '@components/canvas';
import {usePartnershipStore} from '@store/partnershipSlice';
import {useAuthStore} from '@store/authSlice';
import {getCurrentCanvas} from '@services/canvasService';
import {theme} from '@theme';

export const CanvasEditorScreen = () => {
  const navigation = useNavigation();
  const {partnership} = usePartnershipStore();
  const {user} = useAuthStore();
  const [initialDrawingData, setInitialDrawingData] = useState<string | undefined>();
  const [initialBackgroundColor, setInitialBackgroundColor] = useState<'black' | 'white' | 'beige' | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCanvas = async () => {
      if (partnership && user) {
        try {
          const canvas = await getCurrentCanvas(partnership.id);
          if (canvas) {
            setInitialDrawingData(canvas.drawingData);
            // Load background color from canvas metadata
            const bgColor = canvas.backgroundColor || canvas.metadata?.backgroundColor;
            if (bgColor === 'white' || bgColor === 'beige' || bgColor === 'black') {
              setInitialBackgroundColor(bgColor);
            }
          }
        } catch (error) {
          console.error('Error loading canvas:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadCanvas();
  }, [partnership, user]);

  const handleSave = (drawingData: string) => {
    // Canvas auto-saves via sync service
    console.log('Canvas saved');
  };

  const handleGalleryPress = () => {
    navigation.navigate('CanvasGallery' as any);
  };

  if (!partnership || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Partnership not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="close"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Canvas</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleGalleryPress}>
          <MaterialCommunityIcons
            name="image-multiple"
            size={24}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Canvas */}
      <View style={styles.canvasContainer}>
        <CanvasErrorBoundary>
          <Canvas
            partnershipId={partnership.id}
            userId={user.id}
            onSave={handleSave}
            initialDrawingData={initialDrawingData}
            initialBackgroundColor={initialBackgroundColor}
            editable={true}
            size="large"
          />
        </CanvasErrorBoundary>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  canvasContainer: {
    flex: 1,
    padding: theme.spacing.base,
  },
});
