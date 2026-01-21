/**
 * Message state slice
 * Manages message state, real-time sync, and typing indicators
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Message} from '@utils/types';
import {
  subscribeToMessages as subscribeToMessagesService,
  sendMessage as sendMessageService,
  addMessageReaction as addMessageReactionService,
  removeMessageReaction as removeMessageReactionService,
  setTyping as setTypingService,
} from '@services/messageService';

interface MessageState {
  messages: Message[];
  isLoading: boolean;
  typingUsers: string[];
  unsubscribeMessages: (() => void) | null;

  // Actions
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  setTypingUsers: (userIds: string[]) => void;
  clearMessages: () => void;
  subscribeToMessages: (partnershipId: string, limit?: number) => void;
  sendMessage: (
    message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<Message>;
  addReaction: (
    messageId: string,
    userId: string,
    emoji: string,
  ) => Promise<void>;
  removeReaction: (messageId: string, userId: string) => Promise<void>;
}

export const useMessageStore = create<MessageState>()(
  persist(
    set => ({
      messages: [],
      isLoading: false,
      typingUsers: [],
      unsubscribeMessages: null,

      setMessages: messages => set({messages}),

      addMessage: message =>
        set(state => ({
          messages: [...state.messages, message],
        })),

      updateMessage: (messageId, updates) =>
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === messageId ? {...msg, ...updates} : msg,
          ),
        })),

      setTyping: (userId, isTyping) =>
        set(state => {
          if (isTyping) {
            return {
              typingUsers: state.typingUsers.includes(userId)
                ? state.typingUsers
                : [...state.typingUsers, userId],
            };
          } else {
            return {
              typingUsers: state.typingUsers.filter(id => id !== userId),
            };
          }
        }),

      setTypingUsers: userIds => set({typingUsers: userIds}),

      clearMessages: () => {
        const unsubscribe = useMessageStore.getState().unsubscribeMessages;
        if (unsubscribe) {
          unsubscribe();
        }
        set({
          messages: [],
          typingUsers: [],
          unsubscribeMessages: null,
        });
      },

      subscribeToMessages: (partnershipId: string, limit: number = 100) => {
        // Unsubscribe from previous subscription if exists
        const currentUnsubscribe = useMessageStore.getState().unsubscribeMessages;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }

        const unsubscribe = subscribeToMessagesService(
          partnershipId,
          messages => {
            set({messages});
          },
          limit,
        );

        set({unsubscribeMessages: unsubscribe});
      },

      sendMessage: async message => {
        try {
          const sentMessage = await sendMessageService(message);
          
          // Add message optimistically
          set(state => ({
            messages: [...state.messages, sentMessage],
          }));

          return sentMessage;
        } catch (error) {
          console.error('Error sending message:', error);
          throw error;
        }
      },

      addReaction: async (messageId, userId, emoji) => {
        try {
          const reaction = {
            userId,
            emoji,
            createdAt: new Date().toISOString(),
          };
          
          await addMessageReactionService(messageId, reaction);

          // Update local state
          const state = useMessageStore.getState();
          const message = state.messages.find(m => m.id === messageId);
          if (message) {
            const updatedReactions = [...(message.reactions || []), reaction];
            useMessageStore.getState().updateMessage(messageId, {
              reactions: updatedReactions,
            });
          }
        } catch (error) {
          console.error('Error adding reaction:', error);
          throw error;
        }
      },

      removeReaction: async (messageId, userId) => {
        try {
          await removeMessageReactionService(messageId, userId);

          // Update local state
          const state = useMessageStore.getState();
          const message = state.messages.find(m => m.id === messageId);
          if (message) {
            const updatedReactions =
              message.reactions?.filter(r => r.userId !== userId) || [];
            useMessageStore.getState().updateMessage(messageId, {
              reactions: updatedReactions,
            });
          }
        } catch (error) {
          console.error('Error removing reaction:', error);
          throw error;
        }
      },
    }),
    {
      name: 'message-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        // Don't persist messages, typing users, or subscriptions
        messages: [],
        typingUsers: [],
      }),
    },
  ),
);
