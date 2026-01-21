/**
 * Voice Answer Input Component
 * Record button with visual feedback and playback preview
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Question} from '@utils/types';
import {theme} from '@theme';
import {startRecording, stopRecording, playAudio, pauseAudio} from '@utils/audioRecorder';

interface VoiceAnswerInputProps {
  question: Question;
  onSubmit: (answer: string, mediaUrl: string) => void;
  disabled?: boolean;
}

const MAX_DURATION = 60; // seconds

export const VoiceAnswerInput: React.FC<VoiceAnswerInputProps> = ({
  question,
  onSubmit,
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationInterval, setDurationInterval] = useState<NodeJS.Timeout | null>(null);

  const startRecordingHandler = async () => {
    try {
      await startRecording();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      const interval = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= MAX_DURATION) {
            stopRecordingHandler();
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
      setDurationInterval(interval);
    } catch (error: any) {
      Alert.alert('Error', `Failed to start recording: ${error.message}`);
    }
  };

  const stopRecordingHandler = async () => {
    try {
      if (durationInterval) {
        clearInterval(durationInterval);
        setDurationInterval(null);
      }

      const url = await stopRecording();
      setIsRecording(false);
      setAudioUrl(url);
      setRecordingDuration(0);
    } catch (error: any) {
      Alert.alert('Error', `Failed to stop recording: ${error.message}`);
      setIsRecording(false);
      if (durationInterval) {
        clearInterval(durationInterval);
        setDurationInterval(null);
      }
    }
  };

  const handlePlayback = async () => {
    if (!audioUrl) return;

    try {
      if (isPlaying) {
        await pauseAudio();
        setIsPlaying(false);
      } else {
        await playAudio(audioUrl);
        setIsPlaying(true);
        // Note: In real implementation, you'd listen for playback end event
        // For now, we'll just toggle state
        setTimeout(() => setIsPlaying(false), recordingDuration * 1000);
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to play audio: ${error.message}`);
    }
  };

  const handleSubmit = () => {
    if (audioUrl && !disabled) {
      onSubmit('Voice answer', audioUrl);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.recordingContainer}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
            disabled && styles.recordButtonDisabled,
          ]}
          onPress={isRecording ? stopRecordingHandler : startRecordingHandler}
          disabled={disabled}>
          <MaterialCommunityIcons
            name={isRecording ? 'stop' : 'microphone'}
            size={48}
            color={theme.colors.textInverse}
          />
        </TouchableOpacity>

        {recordingDuration > 0 && (
          <Text style={styles.durationText}>
            {formatDuration(recordingDuration)} / {MAX_DURATION}s
          </Text>
        )}
      </View>

      {audioUrl && (
        <View style={styles.playbackContainer}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={handlePlayback}
            disabled={disabled}>
            <MaterialCommunityIcons
              name={isPlaying ? 'pause' : 'play'}
              size={32}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
          <Text style={styles.playbackText}>Preview your recording</Text>
          <TouchableOpacity
            style={[
              styles.submitButton,
              disabled && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={disabled}>
            <Text style={styles.submitButtonText}>Submit</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  recordingContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  recordButtonActive: {
    backgroundColor: theme.colors.error,
    // Add pulsing animation class here if needed
  },
  recordButtonDisabled: {
    backgroundColor: theme.colors.textLight,
  },
  durationText: {
    marginTop: theme.spacing.base,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  playbackContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
  },
  playButton: {
    padding: theme.spacing.sm,
  },
  playbackText: {
    flex: 1,
    marginLeft: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.spacing.md,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.textLight,
  },
  submitButtonText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
});
