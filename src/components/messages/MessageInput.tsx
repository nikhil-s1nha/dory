/**
 * Message Input Component
 * Multi-line text input with media support (photo, voice)
 */

import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {takePhoto, pickFromLibrary} from '@utils/imageHandler';
import {startRecording, stopRecording} from '@utils/audioRecorder';
import {uploadMessageMedia, setTyping as setTypingService} from '@services/messageService';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';

interface MessageInputProps {
  partnershipId: string;
  onSendMessage: (
    content: string,
    type: 'text' | 'photo' | 'voice',
    mediaUrl?: string,
  ) => Promise<void>;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  partnershipId,
  onSendMessage,
}) => {
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Set typing indicator
    if (partnershipId && user?.id) {
      setTypingService(partnershipId, user.id, true).catch(error => {
        console.error('Error setting typing indicator:', error);
      });

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set typing to false after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        if (partnershipId && user?.id) {
          setTypingService(partnershipId, user.id, false).catch(error => {
            console.error('Error clearing typing indicator:', error);
          });
        }
      }, 2000);
    }
  };

  const handleSendText = async () => {
    if (!text.trim() || isUploading) return;

    const content = text.trim();
    setText('');
    inputRef.current?.blur();

    // Clear typing indicator
    if (partnershipId && user?.id) {
      setTypingService(partnershipId, user.id, false).catch(error => {
        console.error('Error clearing typing indicator:', error);
      });
    }

    try {
      await onSendMessage(content, 'text');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setText(content); // Restore text on error
    }
  };

  const handlePickPhoto = async () => {
    try {
      setShowPhotoPicker(true);
      Alert.alert(
        'Add Photo',
        'Choose an option',
        [
          {
            text: 'Camera',
            onPress: async () => {
              try {
                setIsUploading(true);
                const imagePath = await takePhoto();
                await handleSendPhoto(imagePath);
              } catch (error: any) {
                if (error.message !== 'User cancelled image selection') {
                  Alert.alert('Error', 'Failed to take photo');
                }
              } finally {
                setIsUploading(false);
                setShowPhotoPicker(false);
              }
            },
          },
          {
            text: 'Photo Library',
            onPress: async () => {
              try {
                setIsUploading(true);
                const imagePath = await pickFromLibrary();
                await handleSendPhoto(imagePath);
              } catch (error: any) {
                if (error.message !== 'User cancelled image selection') {
                  Alert.alert('Error', 'Failed to pick image');
                }
              } finally {
                setIsUploading(false);
                setShowPhotoPicker(false);
              }
            },
          },
          {text: 'Cancel', onPress: () => setShowPhotoPicker(false), style: 'cancel'},
        ],
        {cancelable: true},
      );
    } catch (error) {
      console.error('Error showing photo picker:', error);
      setShowPhotoPicker(false);
    }
  };

  const handleSendPhoto = async (imagePath: string) => {
    if (!user?.id) return;

    try {
      // Generate a temporary message ID for upload path
      const tempMessageId = `temp_${Date.now()}`;

      // Upload photo
      const mediaUrl = await uploadMessageMedia(
        imagePath,
        'photo',
        partnershipId,
        tempMessageId,
      );

      // Send message with photo
      await onSendMessage(text.trim() || '', 'photo', mediaUrl);
      setText(''); // Clear any caption text
    } catch (error) {
      console.error('Error sending photo:', error);
      Alert.alert('Error', 'Failed to send photo. Please try again.');
    }
  };

  const handleRecordVoice = async () => {
    if (isRecording) {
      // Stop recording
      try {
        const audioPath = await stopRecording();
        setIsRecording(false);
        setRecordingTime(0);

        if (audioPath) {
          // Check if it's already a remote URL (shouldn't be, but check just in case)
          const isRemoteUrl = audioPath.startsWith('http://') || audioPath.startsWith('https://');
          
          if (isRemoteUrl) {
            // Already uploaded, send message with remote URL
            await onSendMessage('', 'voice', audioPath);
          } else {
            // Local file path, upload it
            setIsUploading(true);
            // Generate a temporary message ID for upload path
            const tempMessageId = `temp_${Date.now()}`;

            // Upload audio
            const mediaUrl = await uploadMessageMedia(
              audioPath,
              'voice',
              partnershipId,
              tempMessageId,
            );

            // Send message with voice
            await onSendMessage('', 'voice', mediaUrl);
          }
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
        Alert.alert('Error', 'Failed to record voice message');
      } finally {
        setIsUploading(false);
      }
    } else {
      // Start recording
      try {
        await startRecording();
        setIsRecording(true);
        setRecordingTime(0);

        // Simple timer for display (in production, use actual recorder duration)
        const timer = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);

        // Store timer reference for cleanup
        (handleRecordVoice as any).timer = timer;
      } catch (error) {
        console.error('Error starting recording:', error);
        Alert.alert('Error', 'Failed to start recording');
      }
    }
  };

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={styles.container}>
        {/* Action buttons row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, isUploading && styles.actionButtonDisabled]}
            onPress={handlePickPhoto}
            disabled={isUploading}>
            <MaterialCommunityIcons
              name="camera"
              size={24}
              color={isUploading ? theme.colors.textSecondary : theme.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              isRecording && styles.actionButtonRecording,
              isUploading && styles.actionButtonDisabled,
            ]}
            onPress={handleRecordVoice}
            disabled={isUploading}>
            <MaterialCommunityIcons
              name={isRecording ? 'stop' : 'microphone'}
              size={24}
              color={
                isRecording
                  ? theme.colors.error
                  : isUploading
                  ? theme.colors.textSecondary
                  : theme.colors.primary
              }
            />
          </TouchableOpacity>

          {isRecording && (
            <Text style={styles.recordingTime}>
              {formatRecordingTime(recordingTime)}
            </Text>
          )}
        </View>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            maxLength={1000}
            editable={!isUploading && !isRecording}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!text.trim() || isUploading) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendText}
            disabled={!text.trim() || isUploading}>
            {isUploading ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <MaterialCommunityIcons
                name="send"
                size={20}
                color={
                  !text.trim() || isUploading
                    ? theme.colors.textSecondary
                    : theme.colors.textInverse
                }
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  actionButtonRecording: {
    backgroundColor: theme.colors.error + '20',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  recordingTime: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.error,
    marginLeft: theme.spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.xs,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    maxHeight: 100,
    minHeight: 40,
    paddingVertical: theme.spacing.xs,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.backgroundDark,
  },
});
