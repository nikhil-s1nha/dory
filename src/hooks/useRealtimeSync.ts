/**
 * Real-time sync hook
 * Sets up all real-time listeners for partnership data
 */

import {useEffect, useState, useRef} from 'react';
import {
  subscribeToPartnership,
  getUserPartnership,
} from '@services/partnershipService';
import {subscribeToMessages} from '@services/messageService';
import {subscribeToCanvas} from '@services/canvasService';
import {subscribeToCountdowns} from '@services/countdownService';
import {getDailyPrompt, subscribeToPhotoPrompt} from '@services/photoPromptService';
import {updateDailyPhotoWidget} from '@services/widgetService';
import {getUserById} from '@services/authService';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {Partnership, Message, CanvasDrawing, Countdown, PhotoPrompt} from '@utils/types';

interface UseRealtimeSyncResult {
  isLoading: boolean;
  error: string | null;
  partnership: Partnership | null;
  messages: Message[];
  currentCanvas: CanvasDrawing | null;
  countdowns: Countdown[];
  dailyPhotoPrompt: PhotoPrompt | null;
}

/**
 * Hook to sync all real-time data for a partnership
 */
export function useRealtimeSync(
  partnershipId: string | null,
): UseRealtimeSyncResult {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentCanvas, setCurrentCanvas] = useState<CanvasDrawing | null>(
    null,
  );
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [dailyPhotoPrompt, setDailyPhotoPrompt] =
    useState<PhotoPrompt | null>(null);

  const unsubscribeRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!partnershipId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Cleanup function
    const cleanup = () => {
      unsubscribeRefs.current.forEach(unsubscribe => unsubscribe());
      unsubscribeRefs.current = [];
    };

    try {
      // Subscribe to partnership updates
      const unsubscribePartnership = subscribeToPartnership(
        partnershipId,
        partnershipData => {
          setPartnership(partnershipData);
          usePartnershipStore.getState().setPartnership(partnershipData);
        },
      );
      unsubscribeRefs.current.push(unsubscribePartnership);

      // Subscribe to messages
      const unsubscribeMessages = subscribeToMessages(
        partnershipId,
        messagesData => {
          setMessages(messagesData);
        },
      );
      unsubscribeRefs.current.push(unsubscribeMessages);

      // Subscribe to current canvas
      const unsubscribeCanvas = subscribeToCanvas(
        partnershipId,
        canvasData => {
          setCurrentCanvas(canvasData);
        },
      );
      unsubscribeRefs.current.push(unsubscribeCanvas);

      // Subscribe to countdowns
      const unsubscribeCountdowns = subscribeToCountdowns(
        partnershipId,
        countdownsData => {
          setCountdowns(countdownsData);
        },
      );
      unsubscribeRefs.current.push(unsubscribeCountdowns);

      // Get and subscribe to daily photo prompt
      getDailyPrompt(partnershipId)
        .then(async prompt => {
          setDailyPhotoPrompt(prompt);
          if (prompt) {
            const unsubscribePhotoPrompt = subscribeToPhotoPrompt(
              prompt.id,
              async promptData => {
                if (promptData) {
                  setDailyPhotoPrompt(promptData);
                  
                  // Update widget when prompt changes (including partner uploads)
                  const partnership = usePartnershipStore.getState().partnership;
                  const user = useAuthStore.getState().user;
                  if (partnership && user) {
                    const isUser1 = partnership.userId1 === user.id;
                    const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
                    try {
                      const partner = await getUserById(partnerId);
                      if (partner) {
                        await updateDailyPhotoWidget(promptData, partner.name, isUser1);
                      }
                    } catch (error) {
                      console.error('Error updating daily photo widget:', error);
                    }
                  }
                }
              },
            );
            unsubscribeRefs.current.push(unsubscribePhotoPrompt);
          }
        })
        .catch(err => {
          console.error('Error fetching daily photo prompt:', err);
        });

      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to set up real-time sync');
      setIsLoading(false);
    }

    return cleanup;
  }, [partnershipId]);

  return {
    isLoading,
    error,
    partnership,
    messages,
    currentCanvas,
    countdowns,
    dailyPhotoPrompt,
  };
}
