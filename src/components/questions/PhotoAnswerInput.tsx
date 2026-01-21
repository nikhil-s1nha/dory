/**
 * Photo Answer Input Component
 * Image picker with preview and upload
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Question} from '@utils/types';
import {theme} from '@theme';
import {takePhoto, pickFromLibrary, uploadImage} from '@utils/imageHandler';

interface PhotoAnswerInputProps {
  question: Question;
  onSubmit: (answer: string, mediaUrl: string) => void;
  disabled?: boolean;
}

export const PhotoAnswerInput: React.FC<PhotoAnswerInputProps> = ({
  question,
  onSubmit,
  disabled = false,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleTakePhoto = async () => {
    try {
      const imageUri = await takePhoto();
      if (imageUri) {
        setSelectedImage(imageUri);
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to take photo: ${error.message}`);
    }
  };

  const handlePickFromLibrary = async () => {
    try {
      const imageUri = await pickFromLibrary();
      if (imageUri) {
        setSelectedImage(imageUri);
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to pick image: ${error.message}`);
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    setUploading(true);
    try {
      const url = await uploadImage(selectedImage);
      setUploadedUrl(url);
      setUploading(false);
    } catch (error: any) {
      Alert.alert('Error', `Failed to upload image: ${error.message}`);
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (uploadedUrl && !disabled) {
      onSubmit('Photo answer', uploadedUrl);
    }
  };

  return (
    <View style={styles.container}>
      {!selectedImage ? (
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[styles.optionButton, disabled && styles.optionButtonDisabled]}
            onPress={handleTakePhoto}
            disabled={disabled}>
            <MaterialCommunityIcons
              name="camera"
              size={48}
              color={theme.colors.primary}
            />
            <Text style={styles.optionText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionButton, disabled && styles.optionButtonDisabled]}
            onPress={handlePickFromLibrary}
            disabled={disabled}>
            <MaterialCommunityIcons
              name="image"
              size={48}
              color={theme.colors.secondary}
            />
            <Text style={styles.optionText}>Choose from Library</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.previewContainer}>
          <Image source={{uri: selectedImage}} style={styles.previewImage} />

          {!uploadedUrl && (
            <TouchableOpacity
              style={[styles.uploadButton, disabled && styles.uploadButtonDisabled]}
              onPress={handleUpload}
              disabled={disabled || uploading}>
              {uploading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.uploadButtonText}>Upload Photo</Text>
              )}
            </TouchableOpacity>
          )}

          {uploadedUrl && (
            <TouchableOpacity
              style={[styles.submitButton, disabled && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={disabled}>
              <Text style={styles.submitButtonText}>Submit</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.changeButton}
            onPress={() => {
              setSelectedImage(null);
              setUploadedUrl(null);
            }}
            disabled={disabled}>
            <Text style={styles.changeButtonText}>Choose Different Photo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.xl,
  },
  optionButton: {
    alignItems: 'center',
    padding: theme.spacing.base,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  previewContainer: {
    width: '100%',
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: theme.spacing.md,
    marginBottom: theme.spacing.base,
    resizeMode: 'cover',
  },
  uploadButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.base,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  uploadButtonDisabled: {
    backgroundColor: theme.colors.textLight,
  },
  uploadButtonText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.base,
    borderRadius: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.textLight,
  },
  submitButtonText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  changeButton: {
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  changeButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.base,
  },
});
