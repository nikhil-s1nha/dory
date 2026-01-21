/**
 * Sticker Generator Screen
 * Create custom couple stickers
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {GameHeader} from '@components/games';
import {recordActivity} from '@services/streaks';
import {saveImageToGallery} from '@utils/imageHandler';
import {MainStackParamList} from '@utils/types';
import {theme} from '@theme';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'StickerGenerator'>;

const STICKER_TEMPLATES = {
  cute: ['🐻', '💕', '❤️'],
  funny: ['😂', '🤪', '🎉'],
  romantic: ['❤️', '🔥', '❤️‍🔥'],
  minimalist: ['❤️', '💑', '💍'],
};

const STICKER_STYLES = ['cute', 'funny', 'romantic', 'minimalist'] as const;
type StickerStyle = typeof STICKER_STYLES[number];

export const StickerGeneratorScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<StickerStyle>('cute');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedStickers, setGeneratedStickers] = useState<string[]>([]);
  const [stickersGenerated, setStickersGenerated] = useState(0);

  useEffect(() => {
    if (!user || !partnership) {
      navigation.goBack();
    }
  }, []);

  const generateSticker = () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt');
      return;
    }

    setIsGenerating(true);

    // Simulate generation (in MVP, use emoji combinations)
    setTimeout(() => {
      const templates = STICKER_TEMPLATES[selectedStyle];
      const emoji = templates[Math.floor(Math.random() * templates.length)];
      const sticker = `${emoji} ${prompt} ${emoji}`;
      
      setGeneratedStickers(prev => [sticker, ...prev]);
      setStickersGenerated(prev => {
        const newCount = prev + 1;
        
        // Record activity after 3 stickers
        if (newCount === 3 && partnership) {
          recordActivity(partnership.id).catch(error => {
            console.error('Error recording activity:', error);
          });
        }
        
        return newCount;
      });
      setIsGenerating(false);
      setPrompt('');
    }, 1000);
  };

  const handleSaveToGallery = async (sticker: string) => {
    try {
      // For MVP, we'll just show an alert
      // In production, you'd convert the sticker to an image and save it
      Alert.alert('Saved!', 'Sticker saved to gallery');
    } catch (error) {
      Alert.alert('Error', 'Failed to save sticker');
    }
  };

  const handleShare = (sticker: string) => {
    Alert.alert('Share', 'Share functionality coming soon!');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="Sticker Generator"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.inputSection}>
          <Text style={styles.label}>Sticker Prompt</Text>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Enter text for your sticker"
            placeholderTextColor={theme.colors.textSecondary}
          />

          <Text style={styles.label}>Style</Text>
          <View style={styles.styleContainer}>
            {STICKER_STYLES.map(style => (
              <TouchableOpacity
                key={style}
                style={[
                  styles.styleButton,
                  selectedStyle === style && styles.styleButtonSelected,
                ]}
                onPress={() => setSelectedStyle(style)}>
                <Text
                  style={[
                    styles.styleButtonText,
                    selectedStyle === style && styles.styleButtonTextSelected,
                  ]}>
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            onPress={generateSticker}
            disabled={isGenerating}>
            {isGenerating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Generate Sticker</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.gallerySection}>
          <Text style={styles.sectionTitle}>Your Stickers</Text>
          {generatedStickers.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="emoticon-happy"
                size={64}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.emptyStateText}>
                Generate your first sticker!
              </Text>
            </View>
          ) : (
            <View style={styles.stickerGrid}>
              {generatedStickers.map((sticker, index) => (
                <View key={index} style={styles.stickerCard}>
                  <Text style={styles.stickerText}>{sticker}</Text>
                  <View style={styles.stickerActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleSaveToGallery(sticker)}>
                      <MaterialCommunityIcons
                        name="download"
                        size={20}
                        color={theme.colors.primary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleShare(sticker)}>
                      <MaterialCommunityIcons
                        name="share"
                        size={20}
                        color={theme.colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.base,
  },
  inputSection: {
    marginBottom: theme.spacing.xl,
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  styleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  styleButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.sm,
    paddingHorizontal: theme.spacing.base,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.backgroundDark,
  },
  styleButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
  },
  styleButtonTextSelected: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  generateButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.base,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
  gallerySection: {
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.base,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.base,
  },
  stickerCard: {
    width: '47%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    alignItems: 'center',
  },
  stickerText: {
    fontSize: theme.typography.fontSize['2xl'],
    marginBottom: theme.spacing.sm,
  },
  stickerActions: {
    flexDirection: 'row',
    gap: theme.spacing.base,
  },
  actionButton: {
    padding: theme.spacing.xs,
  },
});
