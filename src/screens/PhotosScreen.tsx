/**
 * Photos Screen
 * Photo journal interface with daily prompts and photo grid
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {
  getDailyPrompt,
  uploadPhoto,
  getPhotoHistory,
  subscribeToPhotoHistory,
  subscribeToPhotoPrompt,
  checkBothPartnersUploaded,
  downloadPhoto,
} from '@services/photoPromptService';
import {takePhoto, pickFromLibrary} from '@utils/imageHandler';
import {recordActivity} from '@services/streaks';
import {updateDailyPhotoWidget} from '@services/widgetService';
import {getUser} from '@services/authService';
import {PhotoPrompt} from '@utils/types';
import {format} from 'date-fns';

export const PhotosScreen = () => {
  const navigation = useNavigation();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [todayPrompt, setTodayPrompt] = useState<PhotoPrompt | null>(null);
  const [photoHistory, setPhotoHistory] = useState<PhotoPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load today's prompt and subscribe to updates
  useEffect(() => {
    if (!partnership || !user) return;

    let unsubscribe: (() => void) | undefined;
    let previousPrompt: PhotoPrompt | null = null;

    const loadAndSubscribe = async () => {
      try {
        const prompt = await getDailyPrompt(partnership.id);
        setTodayPrompt(prompt);
        previousPrompt = prompt;
        setLoading(false);
        
        // Subscribe to today's prompt updates
        unsubscribe = subscribeToPhotoPrompt(prompt.id, async updatedPrompt => {
          if (updatedPrompt) {
            // Show notification if partner uploaded
            if (
              previousPrompt &&
              updatedPrompt.user1PhotoUrl && updatedPrompt.user2PhotoUrl &&
              !(previousPrompt.user1PhotoUrl && previousPrompt.user2PhotoUrl)
            ) {
              Alert.alert('Partner Update', 'Your partner shared a photo!');
            }
            setTodayPrompt(updatedPrompt);
            
            // Update widget when prompt changes (including partner uploads)
            const isUser1 = partnership.userId1 === user.id;
            const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
            try {
              const partner = await getUser(partnerId);
              await updateDailyPhotoWidget(updatedPrompt, partner.name, isUser1);
            } catch (error) {
              console.error('Error updating daily photo widget:', error);
            }
            
            previousPrompt = updatedPrompt;
          }
        });
      } catch (error) {
        console.error('Error loading today prompt:', error);
        Alert.alert('Error', 'Failed to load today\'s photo prompt');
        setLoading(false);
      }
    };

    loadAndSubscribe();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [partnership, user]);

  // Load and subscribe to photo history
  useEffect(() => {
    if (!partnership) return;

    const loadHistory = async () => {
      try {
        const history = await getPhotoHistory(partnership.id);
        setPhotoHistory(history);
      } catch (error) {
        console.error('Error loading photo history:', error);
      }
    };

    loadHistory();

    const unsubscribe = subscribeToPhotoHistory(partnership.id, async history => {
      setPhotoHistory(history);
      
      // Update widget when photo history changes (including partner uploads)
      if (history.length > 0 && user) {
        // Get today's prompt from history
        const today = new Date().toISOString().split('T')[0];
        const todayPrompt = history.find(p => p.promptDate === today);
        
        if (todayPrompt) {
          const isUser1 = partnership.userId1 === user.id;
          const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
          try {
            const partner = await getUser(partnerId);
            await updateDailyPhotoWidget(todayPrompt, partner.name, isUser1);
          } catch (error) {
            console.error('Error updating daily photo widget:', error);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [partnership]);

  const handleTakePhoto = async () => {
    setShowCameraModal(false);
    try {
      setUploading(true);
      const photoUri = await takePhoto();
      if (todayPrompt && partnership && user) {
        await uploadPhoto(todayPrompt.id, user.id, photoUri, partnership.id);
        
        // Check if both partners uploaded and record activity
        const updatedPrompt = await getDailyPrompt(partnership.id);
        if (checkBothPartnersUploaded(updatedPrompt)) {
          await recordActivity(partnership.id);
        }
        
        Alert.alert('Success', 'Photo uploaded successfully!');
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled image selection') {
        console.error('Error taking photo:', error);
        Alert.alert('Error', `Failed to upload photo: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handlePickFromLibrary = async () => {
    setShowCameraModal(false);
    try {
      setUploading(true);
      const photoUri = await pickFromLibrary();
      if (todayPrompt && partnership && user) {
        await uploadPhoto(todayPrompt.id, user.id, photoUri, partnership.id);
        
        // Check if both partners uploaded and record activity
        const updatedPrompt = await getDailyPrompt(partnership.id);
        if (checkBothPartnersUploaded(updatedPrompt)) {
          await recordActivity(partnership.id);
        }
        
        Alert.alert('Success', 'Photo uploaded successfully!');
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled image selection') {
        console.error('Error picking photo:', error);
        Alert.alert('Error', `Failed to upload photo: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (photoHistory.length === 0) {
      Alert.alert('No Photos', 'No photos available to download');
      return;
    }

    try {
      setUploading(true);
      let successCount = 0;
      let failedCount = 0;
      
      for (const prompt of photoHistory) {
        if (prompt.user1PhotoUrl) {
          try {
            await downloadPhoto(prompt.user1PhotoUrl);
            successCount++;
          } catch (error) {
            console.error('Error downloading photo:', error);
            failedCount++;
          }
        }
        if (prompt.user2PhotoUrl) {
          try {
            await downloadPhoto(prompt.user2PhotoUrl);
            successCount++;
          } catch (error) {
            console.error('Error downloading photo:', error);
            failedCount++;
          }
        }
      }

      if (successCount > 0) {
        Alert.alert('Success', `Saved ${successCount} photo${successCount > 1 ? 's' : ''} to gallery${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
      } else if (failedCount > 0) {
        // All downloads failed, try sharing as fallback
        const photosToShare = photoHistory
          .flatMap(p => [p.user1PhotoUrl, p.user2PhotoUrl])
          .filter(Boolean) as string[];
        
        if (photosToShare.length > 0) {
          try {
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
              await Share.share({
                message: `Sharing ${photosToShare.length} photos from our photo journal`,
                url: photosToShare[0],
              });
            }
          } catch (shareError) {
            console.error('Error sharing photos:', shareError);
            Alert.alert('Error', 'Failed to download or share photos');
          }
        } else {
          Alert.alert('Error', 'Failed to download photos');
        }
      }
    } catch (error) {
      console.error('Error downloading photos:', error);
      Alert.alert('Error', 'Failed to download photos');
    } finally {
      setUploading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (partnership && user) {
      try {
        const prompt = await getDailyPrompt(partnership.id);
        setTodayPrompt(prompt);
        const history = await getPhotoHistory(partnership.id);
        setPhotoHistory(history);
        
        // Update widget after refresh
        const isUser1 = partnership.userId1 === user.id;
        const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
        try {
          const partner = await getUser(partnerId);
          await updateDailyPhotoWidget(prompt, partner.name, isUser1);
        } catch (error) {
          console.error('Error updating daily photo widget:', error);
        }
      } catch (error) {
        console.error('Error refreshing:', error);
      }
    }
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const renderPhotoItem = ({item, index}: {item: PhotoPrompt; index: number}) => {
    const isUser1 = partnership?.userId1 === user?.id;
    const photoUrl = isUser1 ? item.user1PhotoUrl || item.user2PhotoUrl : item.user2PhotoUrl || item.user1PhotoUrl;
    const partnerPhotoUrl = isUser1 ? item.user2PhotoUrl : item.user1PhotoUrl;

    const displayPhoto = photoUrl || partnerPhotoUrl;

    return (
      <TouchableOpacity
        style={[
          styles.photoItem,
          index % 3 !== 2 && styles.photoItemMargin,
        ]}
        onPress={() => {
          navigation.navigate('PhotoDetail' as any, {
            promptId: item.id,
            prompt: item,
          });
        }}>
        {displayPhoto ? (
          <Image source={{uri: displayPhoto}} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialCommunityIcons
              name="image"
              size={32}
              color={theme.colors.textLight}
            />
          </View>
        )}
        {photoUrl && partnerPhotoUrl && (
          <View style={styles.completedBadge}>
            <MaterialCommunityIcons
              name="check-circle"
              size={16}
              color={theme.colors.primary}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const getPromptStatus = () => {
    if (!todayPrompt || !partnership || !user) return 'Tap to start';
    const isUser1 = partnership.userId1 === user.id;
    const userPhoto = isUser1 ? todayPrompt.user1PhotoUrl : todayPrompt.user2PhotoUrl;
    const partnerPhoto = isUser1 ? todayPrompt.user2PhotoUrl : todayPrompt.user1PhotoUrl;

    if (userPhoto && partnerPhoto) return 'Both photos shared!';
    if (userPhoto) return 'Waiting for partner';
    return 'Tap to start';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading photos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memories</Text>
        {photoHistory.length > 0 && (
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownloadAll}
            disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <>
          <MaterialCommunityIcons
            name="download"
            size={20}
            color={theme.colors.primary}
          />
          <Text style={styles.downloadButtonText}>Download All</Text>
              </>
            )}
        </TouchableOpacity>
        )}
      </View>

      {/* Today's Photo Prompt */}
      <View style={styles.section}>
        <View style={styles.promptCard}>
          <View style={styles.promptHeader}>
            <MaterialCommunityIcons
              name="camera-image"
              size={24}
              color={theme.colors.secondary}
            />
            <Text style={styles.promptTitle}>Today's Photo Prompt</Text>
          </View>
          <Text style={styles.promptText}>
            {todayPrompt?.promptText || 'Share a photo of something that made you smile today'}
          </Text>
          <View style={styles.promptStatus}>
            <Text style={styles.promptStatusText}>{getPromptStatus()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.cameraButton, uploading && styles.cameraButtonDisabled]}
            onPress={() => setShowCameraModal(true)}
            disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <>
            <MaterialCommunityIcons
              name="camera"
              size={24}
              color={theme.colors.textInverse}
            />
            <Text style={styles.cameraButtonText}>Take Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Photo Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shared Photos</Text>
        {photoHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={64}
              color={theme.colors.textLight}
            />
            <Text style={styles.emptyStateText}>
              Start your photo journey together!
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Share daily photos to build memories
            </Text>
          </View>
        ) : (
        <FlatList
            data={photoHistory}
          renderItem={renderPhotoItem}
          keyExtractor={item => item.id}
          numColumns={3}
          scrollEnabled={true}
          contentContainerStyle={styles.photoGrid}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        />
        )}
      </View>

      {/* Camera Modal */}
      <Modal
        visible={showCameraModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCameraModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Photo Source</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleTakePhoto}>
              <MaterialCommunityIcons
                name="camera"
                size={24}
                color={theme.colors.primary}
              />
              <Text style={styles.modalButtonText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handlePickFromLibrary}>
              <MaterialCommunityIcons
                name="image-multiple"
                size={24}
                color={theme.colors.primary}
              />
              <Text style={styles.modalButtonText}>Choose from Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowCameraModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  downloadButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  section: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  promptCard: {
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
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  promptTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  promptText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.base,
    lineHeight: theme.typography.fontSize.base * 1.5,
  },
  cameraButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cameraButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  photoGrid: {
    gap: theme.spacing.xs,
  },
  photoItem: {
    width: '33.33%',
    aspectRatio: 1,
  },
  photoItemMargin: {
    marginRight: theme.spacing.xs,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: theme.spacing.xs,
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedBadge: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.xl,
    padding: theme.spacing.xxs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['2xl'],
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
  },
  emptyStateSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  promptStatus: {
    marginBottom: theme.spacing.sm,
  },
  promptStatusText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  cameraButtonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.spacing.xl,
    borderTopRightRadius: theme.spacing.xl,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing['2xl'],
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.base,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  modalButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  modalCancelButton: {
    alignItems: 'center',
    paddingVertical: theme.spacing.base,
    marginTop: theme.spacing.base,
  },
  modalCancelText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
});
