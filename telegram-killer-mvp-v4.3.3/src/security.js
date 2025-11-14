import { recoverMessageAddress } from 'viem';

export const MESSAGE_CHAR_LIMIT = 1000;
export const RATE_LIMIT_MAX_PER_MINUTE = 60;
export const ETHEREUM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/i;

const SCRIPT_TAG_REGEX = /<script\b[^>]*>(.*?)<\/script>/gi;

export function sanitizeWalletAddressInput(value = '') {
  return value.trim().toLowerCase();
}

export function isValidWalletAddress(value = '') {
  return ETHEREUM_ADDRESS_REGEX.test(value);
}

export function sanitizeTextInput(value = '') {
  return value.replace(/[<>]/g, '').trim();
}

export function sanitizeMessageContent(raw = '') {
  if (!raw) return '';
  const normalized = raw.replace(/\s+/g, ' ').trim();
  return normalized.replace(SCRIPT_TAG_REGEX, '');
}

export function enforceMessagePolicies(rawMessage = '') {
  const trimmed = rawMessage.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }
  if (trimmed.length > MESSAGE_CHAR_LIMIT) {
    throw new Error(`Message must be ${MESSAGE_CHAR_LIMIT} characters or less.`);
  }
  return sanitizeMessageContent(trimmed);
}

export function buildMessagePayload({ sender, recipient, content, timestamp }) {
  return [
    'tello',
    'v4.4.0',
    `sender:${sender}`,
    `recipient:${recipient}`,
    `timestamp:${timestamp}`,
    `content:${content}`,
  ].join('|');
}

export async function verifyMessageSignature({ payload, signature, expectedAddress }) {
  if (!signature || !payload || !expectedAddress) {
    return false;
  }
  try {
    const recovered = await recoverMessageAddress({ message: payload, signature });
    return recovered?.toLowerCase() === expectedAddress?.toLowerCase();
  } catch (error) {
    console.warn('Signature verification failed', error);
    return false;
  }
}

export function getMessageCharactersRemaining(message = '') {
  return Math.max(MESSAGE_CHAR_LIMIT - message.length, 0);
}
