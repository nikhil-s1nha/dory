/**
 * Canvas Gallery Screen
 * Browse past canvas drawings with download and delete options
 */

import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Dimensions,
  TextInput,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {usePartnershipStore} from '@store/partnershipSlice';
import {useAuthStore} from '@store/authSlice';
import {getCanvasHistory, deleteCanvas, downloadCanvasToDevice} from '@services/canvasService';
import {CanvasDrawing} from '@utils/types';
import {format} from 'date-fns';
import {theme} from '@theme';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_WIDTH - theme.spacing.base * 3) / 2;

export const CanvasGalleryScreen = () => {
  const navigation = useNavigation();
  const {partnership} = usePartnershipStore();
  const {user} = useAuthStore();
  const [drawings, setDrawings] = useState<CanvasDrawing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<CanvasDrawing | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'me' | 'partner'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  const loadDrawings = useCallback(async () => {
    if (!partnership) return;

    try {
      const history = await getCanvasHistory(partnership.id);
      setDrawings(history);
    } catch (error) {
      console.error('Error loading canvas history:', error);
      Alert.alert('Error', 'Failed to load canvas history');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [partnership]);

  useEffect(() => {
    loadDrawings();
  }, [loadDrawings]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDrawings();
  };

  const handleDrawingPress = (drawing: CanvasDrawing) => {
    setSelectedDrawing(drawing);
    setShowModal(true);
  };

  const handleLongPress = (drawing: CanvasDrawing) => {
    Alert.alert(
      'Canvas Options',
      'What would you like to do with this canvas?',
      [
        {
          text: 'Download',
          onPress: () => handleDownload(drawing),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(drawing),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  };

  const handleDownload = async (drawing: CanvasDrawing) => {
    try {
      setDownloadingId(drawing.id);
      await downloadCanvasToDevice(drawing.id, drawing.drawingData);
      Alert.alert('Success', 'Drawing saved to Photos');
    } catch (error) {
      console.error('Error downloading canvas:', error);
      Alert.alert('Error', 'Failed to save drawing to Photos');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (drawing: CanvasDrawing) => {
    Alert.alert(
      'Delete Canvas',
      'Are you sure you want to delete this canvas? This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCanvas(drawing.id);
              setDrawings(prev => prev.filter(d => d.id !== drawing.id));
              if (selectedDrawing?.id === drawing.id) {
                setShowModal(false);
                setSelectedDrawing(null);
              }
            } catch (error) {
              console.error('Error deleting canvas:', error);
              Alert.alert('Error', 'Failed to delete canvas');
            }
          },
        },
      ],
    );
  };

  // Filter and sort drawings
  const filteredAndSortedDrawings = useMemo(() => {
    let filtered = drawings;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(item => {
        const dateStr = format(new Date(item.createdAt), 'MMMM d, yyyy').toLowerCase();
        return dateStr.includes(searchQuery.toLowerCase());
      });
    }

    // Filter by creator
    if (filterBy === 'me') {
      filtered = filtered.filter(item => item.createdBy === user?.id);
    } else if (filterBy === 'partner') {
      filtered = filtered.filter(item => item.createdBy !== user?.id);
    }

    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [drawings, searchQuery, filterBy, sortBy, user?.id]);

  // Group drawings by month
  const groupedDrawings = useMemo(() => {
    const groups: Record<string, CanvasDrawing[]> = {};
    
    filteredAndSortedDrawings.forEach(drawing => {
      const monthKey = format(new Date(drawing.createdAt), 'MMMM yyyy');
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(drawing);
    });

    return Object.entries(groups).map(([title, data]) => ({
      title,
      data,
    }));
  }, [filteredAndSortedDrawings]);

  // Statistics
  const statistics = useMemo(() => {
    const total = drawings.length;
    const myDrawings = drawings.filter(d => d.createdBy === user?.id).length;
    const partnerDrawings = total - myDrawings;
    return {total, myDrawings, partnerDrawings};
  }, [drawings, user?.id]);

  const renderDrawingItem = ({item}: {item: CanvasDrawing}) => {
    const isDownloading = downloadingId === item.id;
    const isCurrentUser = item.createdBy === user?.id;

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => handleDrawingPress(item)}
        onLongPress={() => handleLongPress(item)}
        disabled={isDownloading}>
        {item.thumbnail ? (
          <Image
            source={{uri: item.thumbnail}}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <MaterialCommunityIcons
              name="draw-pen"
              size={32}
              color={theme.colors.textSecondary}
            />
          </View>
        )}
        {isDownloading && (
          <View style={styles.downloadingOverlay}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
        <View style={styles.itemInfo}>
          <Text style={styles.itemDate} numberOfLines={1}>
            {format(new Date(item.createdAt), 'MMM d, yyyy')}
          </Text>
          {isCurrentUser && (
            <MaterialCommunityIcons
              name="account-circle"
              size={16}
              color={theme.colors.primary}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
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
            name="arrow-left"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Canvas Gallery</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Statistics */}
      {drawings.length > 0 && (
        <View style={styles.statisticsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{statistics.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{statistics.myDrawings}</Text>
            <Text style={styles.statLabel}>Mine</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{statistics.partnerDrawings}</Text>
            <Text style={styles.statLabel}>Partner</Text>
          </View>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons
          name="magnify"
          size={20}
          color={theme.colors.textSecondary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by date..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialCommunityIcons
              name="close-circle"
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter and Sort Controls */}
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Filter:</Text>
          <TouchableOpacity
            style={[styles.filterButton, filterBy === 'all' && styles.filterButtonActive]}
            onPress={() => setFilterBy('all')}>
            <Text style={[styles.filterButtonText, filterBy === 'all' && styles.filterButtonTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filterBy === 'me' && styles.filterButtonActive]}
            onPress={() => setFilterBy('me')}>
            <Text style={[styles.filterButtonText, filterBy === 'me' && styles.filterButtonTextActive]}>
              Me
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filterBy === 'partner' && styles.filterButtonActive]}
            onPress={() => setFilterBy('partner')}>
            <Text style={[styles.filterButtonText, filterBy === 'partner' && styles.filterButtonTextActive]}>
              Partner
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sortRow}>
          <Text style={styles.filterLabel}>Sort:</Text>
          <TouchableOpacity
            style={[styles.filterButton, sortBy === 'newest' && styles.filterButtonActive]}
            onPress={() => setSortBy('newest')}>
            <Text style={[styles.filterButtonText, sortBy === 'newest' && styles.filterButtonTextActive]}>
              Newest
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, sortBy === 'oldest' && styles.filterButtonActive]}
            onPress={() => setSortBy('oldest')}>
            <Text style={[styles.filterButtonText, sortBy === 'oldest' && styles.filterButtonTextActive]}>
              Oldest
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Gallery Grid */}
      {filteredAndSortedDrawings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="image-multiple-outline"
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.emptyText}>
            {searchQuery || filterBy !== 'all'
              ? searchQuery
                ? 'No drawings match your search'
                : 'No drawings found for this filter'
              : 'No canvas drawings yet'}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery || filterBy !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Start drawing to see your creations here'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          {groupedDrawings.map((section, sectionIndex) => (
            <View key={sectionIndex}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
              <View style={styles.sectionGrid}>
                {section.data.map((item) => (
                  <View key={item.id} style={styles.itemWrapper}>
                    {renderDrawingItem({item})}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Full-size Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {selectedDrawing && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {format(new Date(selectedDrawing.createdAt), 'MMMM d, yyyy')}
                  </Text>
                  <TouchableOpacity onPress={() => setShowModal(false)}>
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.text}
                    />
                  </TouchableOpacity>
                </View>
                {selectedDrawing.thumbnail ? (
                  <Image
                    source={{uri: selectedDrawing.thumbnail}}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.modalPlaceholder}>
                    <MaterialCommunityIcons
                      name="draw-pen"
                      size={64}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalButton}
                    onPress={() => {
                      if (selectedDrawing) {
                        handleDownload(selectedDrawing);
                      }
                    }}>
                    <MaterialCommunityIcons
                      name="download"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.modalButtonText}>Download</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.deleteButton]}
                    onPress={() => {
                      if (selectedDrawing) {
                        handleDelete(selectedDrawing);
                      }
                    }}>
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={20}
                      color={theme.colors.error}
                    />
                    <Text style={[styles.modalButtonText, styles.deleteButtonText]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
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
  listContent: {
    padding: theme.spacing.base,
  },
  row: {
    justifyContent: 'space-between',
  },
  sectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.base,
    justifyContent: 'space-between',
  },
  itemWrapper: {
    width: ITEM_SIZE,
    marginBottom: theme.spacing.base,
  },
  item: {
    width: ITEM_SIZE,
    marginBottom: theme.spacing.base,
    marginRight: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  thumbnail: {
    width: '100%',
    height: ITEM_SIZE,
    backgroundColor: theme.colors.backgroundDark,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: ITEM_SIZE,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.sm,
  },
  itemDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  statisticsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
  },
  filterContainer: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  filterButton: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.backgroundDark,
    marginRight: theme.spacing.sm,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  filterButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  filterButtonTextActive: {
    color: theme.colors.textInverse,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  sectionHeaderText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.xl,
    padding: theme.spacing.base,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  modalImage: {
    width: '100%',
    height: 400,
    borderRadius: theme.spacing.md,
  },
  modalPlaceholder: {
    width: '100%',
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.base,
    paddingTop: theme.spacing.base,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.backgroundDark,
    gap: theme.spacing.xs,
  },
  deleteButton: {
    backgroundColor: theme.colors.backgroundDark,
  },
  modalButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  deleteButtonText: {
    color: theme.colors.error,
  },
});
