/**
 * Date Idea Detail Screen
 * Displays full details of a matched date idea
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  TextInput,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRoute, useNavigation} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {getDateIdea, updateMatchStatus, getMatches} from '@services/dateIdeasService';
import type {DateIdea, DateMatch, MainStackParamList} from '@utils/types';
import {usePartnershipStore} from '@store/partnershipSlice';

type RoutePropType = RouteProp<MainStackParamList, 'DateIdeaDetail'>;
type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

export const DateIdeaDetailScreen = () => {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const {partnership} = usePartnershipStore();

  const [dateIdea, setDateIdea] = useState<DateIdea | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchStatus, setMatchStatus] = useState<DateMatch['status'] | null>(
    null,
  );
  const [notes, setNotes] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesInput, setNotesInput] = useState('');

  useEffect(() => {
    const loadDateIdea = async () => {
      try {
        setLoading(true);
        let idea: DateIdea | null = null;

        if ('dateIdea' in route.params && route.params.dateIdea) {
          idea = route.params.dateIdea;
        } else if ('dateIdeaId' in route.params) {
          idea = await getDateIdea(route.params.dateIdeaId);
        }

        setDateIdea(idea);
      } catch (error: any) {
        console.error('Error loading date idea:', error);
        Alert.alert('Error', 'Failed to load date idea details.');
      } finally {
        setLoading(false);
      }
    };

    loadDateIdea();
  }, [route.params]);

  const handleMarkCompleted = async () => {
    if (!dateIdea || !partnership) return;

    try {
      // Find the match for this date idea
      const matches = await getMatches(partnership.id);
      const match = matches.find(m => m.dateIdeaId === dateIdea.id);

      if (match) {
        await updateMatchStatus(match.id, 'completed', notes);
        setMatchStatus('completed');
        Alert.alert('Success', 'Date marked as completed!');
      } else {
        Alert.alert('Error', 'Match not found.');
      }
    } catch (error: any) {
      console.error('Error updating match status:', error);
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  const handleAddNotes = () => {
    setNotesInput(notes);
    setShowNotesModal(true);
  };

  const handleSaveNotes = async () => {
    if (!dateIdea || !partnership) return;

    try {
      const matches = await getMatches(partnership.id);
      const match = matches.find(m => m.dateIdeaId === dateIdea.id);

      if (match) {
        await updateMatchStatus(match.id, match.status, notesInput);
        setNotes(notesInput);
        setShowNotesModal(false);
        Alert.alert('Success', 'Notes saved!');
      }
    } catch (error: any) {
      console.error('Error saving notes:', error);
      Alert.alert('Error', 'Failed to save notes.');
    }
  };

  const handleShare = async () => {
    if (!dateIdea) return;

    try {
      await Share.share({
        message: `Check out this date idea: ${dateIdea.title}\n\n${dateIdea.description}\n\nLocation: ${dateIdea.location.name}`,
        title: dateIdea.title,
      });
    } catch (error: any) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!dateIdea) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Date idea not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <MaterialCommunityIcons
            name="share-variant"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Image */}
        <View style={styles.imageContainer}>
          <Image
            source={
              dateIdea.imageUrl
                ? {uri: dateIdea.imageUrl}
                : require('@assets/images/placeholder.png')
            }
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {dateIdea.category.charAt(0).toUpperCase() +
                dateIdea.category.slice(1)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.title}>{dateIdea.title}</Text>

          {/* Location */}
          <View style={styles.locationRow}>
            <MaterialCommunityIcons
              name="map-marker"
              size={20}
              color={theme.colors.primary}
            />
            <View style={styles.locationInfo}>
              <Text style={styles.locationName}>{dateIdea.location.name}</Text>
              <Text style={styles.locationAddress}>
                {dateIdea.location.address}
              </Text>
            </View>
          </View>

          {/* Meta Info */}
          <View style={styles.metaRow}>
            {dateIdea.price && (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="currency-usd"
                  size={18}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.metaText}>{dateIdea.price}</Text>
              </View>
            )}
            {dateIdea.duration && (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={18}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.metaText}>{dateIdea.duration}</Text>
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{dateIdea.description}</Text>
          </View>

          {/* Tags */}
          {dateIdea.tags && dateIdea.tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagsContainer}>
                {dateIdea.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Event Date */}
          {dateIdea.eventDate && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Date</Text>
              <Text style={styles.eventDate}>{dateIdea.eventDate}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleMarkCompleted}>
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={theme.colors.textInverse}
              />
              <Text style={styles.actionButtonText}>Mark as Completed</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={handleAddNotes}>
              <MaterialCommunityIcons
                name="note-text"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  styles.actionButtonTextSecondary,
                ]}>
                {notes ? 'Edit Notes' : 'Add Notes'}
              </Text>
            </TouchableOpacity>
          </View>

          {notes && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesTitle}>Your Notes</Text>
              <Text style={styles.notesText}>{notes}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Notes Modal */}
      <Modal
        visible={showNotesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Notes</Text>
            <Text style={styles.modalSubtitle}>
              Add notes about this date idea:
            </Text>
            <TextInput
              style={styles.notesInput}
              multiline
              numberOfLines={6}
              placeholder="Enter your notes..."
              value={notesInput}
              onChangeText={setNotesInput}
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowNotesModal(false)}>
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveNotes}>
                <Text style={styles.modalButtonTextSave}>Save</Text>
              </TouchableOpacity>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  shareButton: {
    padding: theme.spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: theme.spacing.base,
    left: theme.spacing.base,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
  },
  categoryText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primaryDark,
  },
  content: {
    padding: theme.spacing.base,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.base,
  },
  locationInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  locationName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  locationAddress: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  metaText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  tag: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
  },
  tagText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primaryDark,
  },
  eventDate: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  actionsContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    gap: theme.spacing.sm,
  },
  actionButtonSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  actionButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  actionButtonTextSecondary: {
    color: theme.colors.primary,
  },
  notesContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  notesTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  notesText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.spacing.md,
    borderTopRightRadius: theme.spacing.md,
    padding: theme.spacing.base,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  modalSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.base,
  },
  notesInput: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.spacing.sm,
    padding: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    minHeight: 120,
    marginBottom: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalButton: {
    flex: 1,
    padding: theme.spacing.base,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalButtonSave: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonTextCancel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  modalButtonTextSave: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
});
