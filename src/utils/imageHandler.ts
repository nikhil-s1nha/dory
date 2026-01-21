/**
 * Image handler utility
 * Handles photo capture, library selection, cropping, and upload
 */

import ImagePicker from 'react-native-image-crop-picker';
import {Platform, PermissionsAndroid, Alert} from 'react-native';
import {uploadFile} from '@services/firebase';
import {Image} from 'react-native';
import {useAuthStore} from '@store/authSlice';

const MAX_IMAGE_SIZE = 1080; // pixels
const MAX_FILE_SIZE = 500 * 1024; // 500KB

/**
 * Request camera permissions
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const cameraGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (cameraGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Permission Required',
          'Camera permission is required to take photos. Please enable it in your device settings.',
        );
        return false;
      }
      return true;
    }
    // iOS permissions are handled in Info.plist
    return true;
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    Alert.alert('Error', 'Failed to request camera permission. Please try again.');
    return false;
  }
}

/**
 * Request photo library permissions
 */
export async function requestLibraryPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      // Android 13+ (API 33+) uses granular media permissions
      const androidVersion = Platform.Version as number;
      if (androidVersion >= 33) {
        // Request READ_MEDIA_IMAGES for Android 13+
        // Use string directly as it may not be in PermissionsAndroid.PERMISSIONS enum
        const mediaImagesGranted = await PermissionsAndroid.request(
          'android.permission.READ_MEDIA_IMAGES' as any,
        );
        if (mediaImagesGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Required',
            'Photo library permission is required to select photos. Please enable it in your device settings.',
          );
          return false;
        }
        return true;
      } else {
        // Use READ_EXTERNAL_STORAGE for older Android versions
        const libraryGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        );
        if (libraryGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Required',
            'Photo library permission is required to select photos. Please enable it in your device settings.',
          );
          return false;
        }
        return true;
      }
    }
    // iOS permissions are handled in Info.plist
    return true;
  } catch (error) {
    console.error('Error requesting library permission:', error);
    Alert.alert('Error', 'Failed to request photo library permission. Please try again.');
    return false;
  }
}

/**
 * Take a photo using device camera
 */
export async function takePhoto(): Promise<string> {
  try {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      throw new Error('Camera permission not granted');
    }

    const result = await ImagePicker.openCamera({
      width: MAX_IMAGE_SIZE,
      height: MAX_IMAGE_SIZE,
      cropping: true,
      compressImageQuality: 0.8,
      compressImageMaxWidth: MAX_IMAGE_SIZE,
      compressImageMaxHeight: MAX_IMAGE_SIZE,
    });
    
    return result.path;
  } catch (error: any) {
    console.error('Error taking photo:', error);
    if (error.message === 'User cancelled image selection') {
      throw error;
    }
    Alert.alert('Error', `Failed to take photo: ${error.message || 'Unknown error'}`);
    throw new Error(`Failed to take photo: ${error.message}`);
  }
}

/**
 * Pick image from device library
 */
export async function pickFromLibrary(): Promise<string> {
  try {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) {
      throw new Error('Photo library permission not granted');
    }

    const result = await ImagePicker.openPicker({
      width: MAX_IMAGE_SIZE,
      height: MAX_IMAGE_SIZE,
      cropping: true,
      compressImageQuality: 0.8,
      compressImageMaxWidth: MAX_IMAGE_SIZE,
      compressImageMaxHeight: MAX_IMAGE_SIZE,
    });
    
    return result.path;
  } catch (error: any) {
    console.error('Error picking image:', error);
    if (error.message === 'User cancelled image selection') {
      throw error;
    }
    Alert.alert('Error', `Failed to pick image: ${error.message || 'Unknown error'}`);
    throw new Error(`Failed to pick image: ${error.message}`);
  }
}

/**
 * Crop an image
 */
export async function cropImage(imagePath: string): Promise<string> {
  try {
    // Note: Uncomment once package is installed
    /*
    const result = await ImagePicker.openCropper({
      path: imagePath,
      width: MAX_IMAGE_SIZE,
      height: MAX_IMAGE_SIZE,
      compressImageQuality: 0.8,
    });
    
    return result.path;
    */
    
    // Placeholder - return original path
    return imagePath;
  } catch (error: any) {
    console.error('Error cropping image:', error);
    throw new Error(`Failed to crop image: ${error.message}`);
  }
}

/**
 * Compress an image
 */
export async function compressImage(imagePath: string): Promise<string> {
  try {
    // Image compression would typically be done during cropping
    // or using a compression library
    // For now, return original path
    return imagePath;
  } catch (error: any) {
    console.error('Error compressing image:', error);
    throw new Error(`Failed to compress image: ${error.message}`);
  }
}

/**
 * Upload image to Firebase Storage
 */
export async function uploadImage(imagePath: string): Promise<string> {
  try {
    // Compress image first
    const compressedPath = await compressImage(imagePath);
    
    // Upload to Firebase Storage
    const user = useAuthStore.getState().user;
    const userId = user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    const timestamp = Date.now();
    const storagePath = `photo-answers/${userId}/${timestamp}.jpg`;
    
    const downloadURL = await uploadFile(compressedPath, storagePath);
    return downloadURL;
  } catch (error: any) {
    console.error('Error uploading image:', error);
    Alert.alert('Upload Error', `Failed to upload image: ${error.message || 'Unknown error'}`);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}
