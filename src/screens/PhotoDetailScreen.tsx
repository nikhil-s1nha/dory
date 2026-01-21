/**
 * Photo Detail Screen
 * Full view of individual photo prompts with both partners' photos
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {getPhotoPromptById, subscribeToPhotoPrompt, downloadPhoto, getDailyPrompt} from '@services/photoPromptService';
import {updateDailyPhotoWidget} from '@services/widgetService';
import {getUserById} from '@services/authService';
import {getPartnership} from '@services/partnershipService';
import {PhotoPrompt} from '@utils/types';
import {format} from 'date-fns';

export const PhotoDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [prompt, setPrompt] = useState<PhotoPrompt | null>(null);
  const [loading, setLoading] = useState(true);

  // @ts-ignore - Route params
  const promptId = route.params?.promptId || route.params?.prompt?.id;
  const initialPrompt = route.params?.prompt as PhotoPrompt | undefined;

  useEffect(() => {
    // Always derive promptId and set up subscription
    if (!promptId) {
      setLoading(false);
      return;
    }

    // If initial prompt is provided, use it but still refresh to avoid stale data
    if (initialPrompt) {
      setPrompt(initialPrompt);
      setLoading(false);
      
      // Refresh with latest data
      const refreshPrompt = async () => {
        try {
          const loadedPrompt = await getPhotoPromptById(promptId);
          setPrompt(loadedPrompt);
        } catch (error) {
          console.error('Error refreshing prompt:', error);
        }
      };
      refreshPrompt();
    } else {
      // Load prompt if not provided
      const loadPrompt = async () => {
        try {
          const loadedPrompt = await getPhotoPromptById(promptId);
          setPrompt(loadedPrompt);
        } catch (error) {
          console.error('Error loading prompt:', error);
          Alert.alert('Error', 'Failed to load photo prompt');
        } finally {
          setLoading(false);
        }
      };
      loadPrompt();
    }

    // Always subscribe to real-time updates regardless of initialPrompt
    const unsubscribe = subscribeToPhotoPrompt(promptId, async updatedPrompt => {
      if (updatedPrompt) {
        setPrompt(updatedPrompt);
        
        // Update widget when prompt changes (including partner uploads)
        if (partnership && user) {
          const isUser1 = partnership.userId1 === user.id;
          const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
          try {
            const partner = await getUserById(partnerId);
            if (partner) {
              await updateDailyPhotoWidget(updatedPrompt, partner.name, isUser1);
            }
          } catch (error) {
            console.error('Error updating daily photo widget:', error);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [promptId, initialPrompt]);

  const handleDownload = async (photoUrl: string) => {
    try {
      await downloadPhoto(photoUrl);
      Alert.alert('Success', 'Photo saved to gallery');
    } catch (error: any) {
      console.error('Error downloading photo:', error);
      // Fallback to sharing if download fails
      try {
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          await Share.share({
            message: 'Sharing photo from our photo journal',
            url: photoUrl,
          });
        }
      } catch (shareError) {
        console.error('Error sharing photo:', shareError);
        Alert.alert('Error', error.message || 'Failed to download or share photo');
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading photo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!prompt) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Photo prompt not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isUser1 = partnership?.userId1 === user?.id;
  const userPhoto = isUser1 ? prompt.user1PhotoUrl : prompt.user2PhotoUrl;
  const partnerPhoto = isUser1 ? prompt.user2PhotoUrl : prompt.user1PhotoUrl;
  const userUploadedAt = isUser1 ? prompt.user1UploadedAt : prompt.user2UploadedAt;
  const partnerUploadedAt = isUser1 ? prompt.user2UploadedAt : prompt.user1UploadedAt;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Photo Memory</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Prompt Text */}
        <View style={styles.promptSection}>
          <Text style={styles.promptText}>{prompt.promptText}</Text>
          <Text style={styles.promptDate}>
            {format(new Date(prompt.promptDate), 'EEEE, MMMM d, yyyy')}
          </Text>
        </View>

        {/* Photos */}
        <View style={styles.photosSection}>
          {/* User Photo */}
          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>Your Photo</Text>
            {userPhoto ? (
              <>
                <Image source={{uri: userPhoto}} style={styles.photo} />
                {userUploadedAt && (
                  <Text style={styles.photoTimestamp}>
                    {format(new Date(userUploadedAt), 'MMM d, h:mm a')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => handleDownload(userPhoto)}>
                  <MaterialCommunityIcons
                    name="download"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialCommunityIcons
                  name="camera-off"
                  size={48}
                  color={theme.colors.textLight}
                />
                <Text style={styles.placeholderText}>No photo uploaded</Text>
              </View>
            )}
          </View>

          {/* Partner Photo */}
          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>Partner's Photo</Text>
            {partnerPhoto ? (
              <>
                <Image source={{uri: partnerPhoto}} style={styles.photo} />
                {partnerUploadedAt && (
                  <Text style={styles.photoTimestamp}>
                    {format(new Date(partnerUploadedAt), 'MMM d, h:mm a')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => handleDownload(partnerPhoto)}>
                  <MaterialCommunityIcons
                    name="download"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialCommunityIcons
                  name="account-clock"
                  size={48}
                  color={theme.colors.textLight}
                />
                <Text style={styles.placeholderText}>Waiting for partner</Text>
              </View>
            )}
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  placeholder: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.base,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  promptSection: {
    padding: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.base,
    borderRadius: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  promptText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  promptDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  photosSection: {
    padding: theme.spacing.base,
    gap: theme.spacing.lg,
  },
  photoContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  photoLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.backgroundDark,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  photoTimestamp: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  downloadButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
});
