/**
 * Partnership pairing utilities
 * Helper functions for invite code sharing and clipboard operations
 */

import Clipboard from '@react-native-clipboard/clipboard';
import {Share} from 'react-native';

/**
 * Generate shareable deep link for invite code
 */
export function generateShareableLink(inviteCode: string): string {
  return `candle://invite/${inviteCode}`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setString(text);
}

/**
 * Share invite code via native share sheet
 */
export async function shareInviteCode(code: string): Promise<void> {
  const shareableLink = generateShareableLink(code);
  const message = `Join me on Candle! Use invite code: ${code}\n\n${shareableLink}`;

  try {
    await Share.share({
      message,
      title: 'Join me on Candle',
    });
  } catch (error) {
    console.error('Error sharing invite code:', error);
    throw error;
  }
}
