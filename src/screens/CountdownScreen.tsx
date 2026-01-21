/**
 * Countdown Screen
 * Main screen for managing countdowns with full CRUD capabilities
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Snackbar} from 'react-native-paper';
import {format} from 'date-fns';
import {theme} from '@theme';
import {usePartnershipStore} from '@store/partnershipSlice';
import {useAuthStore} from '@store/authSlice';
import {
  subscribeToCountdowns,
  createCountdown,
  updateCountdown,
  deleteCountdown,
  getCountdowns,
} from '@services/countdownService';
import {CountdownCard} from '@components/countdown';
import {Countdown} from '@utils/types';

export const CountdownScreen: React.FC = () => {
  const navigation = useNavigation();
  const {partnership} = usePartnershipStore();
  const {user} = useAuthStore();
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCountdown, setEditingCountdown] = useState<Countdown | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Subscribe to countdowns
  useEffect(() => {
    if (!partnership) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToCountdowns(partnership.id, updatedCountdowns => {
      setCountdowns(updatedCountdowns);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      unsubscribe();
    };
  }, [partnership]);

  // Update countdown display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render by updating state
      setCountdowns(prev => [...prev]);
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(async () => {
    if (!partnership) {
      setRefreshing(false);
      return;
    }
    
    setRefreshing(true);
    
    try {
      // Fetch countdowns directly to ensure refresh completes
      await getCountdowns(partnership.id);
      // Clear refreshing after a short delay to ensure UI updates
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    } catch (error) {
      // Clear refreshing even on error
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    }
  }, [partnership]);

  const handleAddCountdown = () => {
    setEditingCountdown(null);
    setTitle('');
    setDescription('');
    // Set default date to tomorrow to ensure it's in the future
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Set to start of day
    setTargetDate(tomorrow);
    setShowModal(true);
  };

  const handleEditCountdown = (countdown: Countdown) => {
    setEditingCountdown(countdown);
    setTitle(countdown.title);
    setDescription(countdown.description || '');
    setTargetDate(new Date(countdown.targetDate));
    setShowModal(true);
  };

  const handleDeleteCountdown = (countdown: Countdown) => {
    Alert.alert(
      'Delete Countdown',
      'Are you sure you want to delete this countdown?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCountdown(countdown.id);
              setSnackbarMessage('Countdown deleted successfully');
              setSnackbarVisible(true);
            } catch (error) {
              setSnackbarMessage('Failed to delete countdown');
              setSnackbarVisible(true);
            }
          },
        },
      ],
      {cancelable: true},
    );
  };

  const handleSaveCountdown = async () => {
    if (!title.trim()) {
      setSnackbarMessage('Please enter a title');
      setSnackbarVisible(true);
      return;
    }

    // Compare by calendar day (start-of-day values) to allow same-day dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDateStartOfDay = new Date(targetDate);
    targetDateStartOfDay.setHours(0, 0, 0, 0);
    
    if (targetDateStartOfDay < today) {
      setSnackbarMessage('Target date must be today or in the future');
      setSnackbarVisible(true);
      return;
    }

    if (!partnership || !user) {
      setSnackbarMessage('Partnership or user not found');
      setSnackbarVisible(true);
      return;
    }

    setSaving(true);
    try {
      if (editingCountdown) {
        await updateCountdown(editingCountdown.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate.toISOString(),
        });
        setSnackbarMessage('Countdown updated successfully');
      } else {
        await createCountdown({
          partnershipId: partnership.id,
          title: title.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate.toISOString(),
          createdBy: user.id,
        });
        setSnackbarMessage('Countdown created successfully');
      }
      setShowModal(false);
      setSnackbarVisible(true);
    } catch (error) {
      setSnackbarMessage(
        editingCountdown
          ? 'Failed to update countdown'
          : 'Failed to create countdown',
      );
      setSnackbarVisible(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setTargetDate(selectedDate);
      if (Platform.OS === 'ios') {
        setShowDatePicker(false);
      }
    }
  };

  const sortedCountdowns = [...countdowns].sort((a, b) => {
    return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
  });

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
        <Text style={styles.headerTitle}>Countdowns</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddCountdown}>
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          {sortedCountdowns.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="calendar-plus"
                size={64}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.emptyStateTitle}>No countdowns yet</Text>
              <Text style={styles.emptyStateDescription}>
                Create your first countdown to track special dates together
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={handleAddCountdown}>
                <Text style={styles.emptyStateButtonText}>
                  Create Countdown
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.countdownList}>
              {sortedCountdowns.map(countdown => (
                <CountdownCard
                  key={countdown.id}
                  countdown={countdown}
                  onEdit={() => handleEditCountdown(countdown)}
                  onDelete={() => handleDeleteCountdown(countdown)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Floating Action Button */}
      {!loading && sortedCountdowns.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAddCountdown}
          activeOpacity={0.8}>
          <MaterialCommunityIcons
            name="plus"
            size={28}
            color={theme.colors.textInverse}
          />
        </TouchableOpacity>
      )}

      {/* Create/Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowModal(false)}>
          <Pressable
            style={styles.modalContent}
            onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCountdown ? 'Edit Countdown' : 'Create Countdown'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.modalCloseButton}>
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={theme.colors.text}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Trip to Paris"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add a description (optional)"
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Target Date *</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}>
                  <MaterialCommunityIcons
                    name="calendar"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.dateButtonText}>
                    {format(targetDate, 'MMMM d, yyyy')}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={targetDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    minimumDate={new Date()}
                  />
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowModal(false)}
                  disabled={saving}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSaveCountdown}
                  disabled={saving}>
                  {saving ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.textInverse}
                    />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Snackbar for feedback */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}>
        {snackbarMessage}
      </Snackbar>
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
    backgroundColor: theme.colors.surface,
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
  addButton: {
    padding: theme.spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.base,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing['3xl'],
    paddingHorizontal: theme.spacing.xl,
  },
  emptyStateTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptyStateDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.fontSize.base * 1.5,
  },
  emptyStateButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.spacing.md,
  },
  emptyStateButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  countdownList: {
    paddingBottom: theme.spacing['2xl'],
  },
  fab: {
    position: 'absolute',
    right: theme.spacing.base,
    bottom: theme.spacing.base,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.xl,
    padding: theme.spacing.xl,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  form: {
    gap: theme.spacing.base,
  },
  inputGroup: {
    marginBottom: theme.spacing.base,
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  dateButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.base,
    marginTop: theme.spacing.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  snackbar: {
    backgroundColor: theme.colors.text,
  },
});