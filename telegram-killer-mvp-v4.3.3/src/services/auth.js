/**
 * Firebase Wallet Authentication Helper
 * Handles wallet signature flow and Firebase custom token sign-in
 */

import { auth, isFirebaseConfigured } from '../firebase';
import { signInWithCustomToken, signOut } from 'firebase/auth';

const AUTH_MESSAGE_PREFIX = 'Tello Wallet Authentication';
const AUTH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const authCache = new Map();

const getAuthEndpoint = () => import.meta.env.VITE_WALLET_AUTH_ENDPOINT;

const isBrowser = typeof window !== 'undefined';

const getProvider = () => {
  if (!isBrowser || !window.ethereum) {
    throw new Error('No EVM-compatible wallet found');
  }
  return window.ethereum;
};

const buildAuthMessage = (walletAddress) => {
  const timestamp = Date.now();
  return `${AUTH_MESSAGE_PREFIX}\n\nWallet: ${walletAddress}\nNonce: ${timestamp}`;
};

const requestWalletSignature = async (walletAddress) => {
  const provider = getProvider();
  const message = buildAuthMessage(walletAddress);
  const signature = await provider.request({
    method: 'personal_sign',
    params: [message, walletAddress],
  });

  return { message, signature };
};

const fetchCustomToken = async (payload) => {
  const endpoint = getAuthEndpoint();
  if (!endpoint) {
    throw new Error('Wallet auth endpoint is not configured. Set VITE_WALLET_AUTH_ENDPOINT in your .env file.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to obtain Firebase custom token');
  }

  const { token } = await response.json();
  if (!token) {
    throw new Error('Auth endpoint did not return a custom token');
  }

  return token;
};

export const isAuthReady = () => isFirebaseConfigured && !!getAuthEndpoint();

export const ensureWalletAuth = async (walletAddress) => {
  if (!isFirebaseConfigured) {
    console.warn('ℹ️  [AUTH] Firebase not configured. Skipping wallet auth.');
    return null;
  }

  if (!auth) {
    console.warn('ℹ️  [AUTH] Firebase auth unavailable in this environment.');
    return null;
  }

  const normalizedAddress = walletAddress?.toLowerCase();
  if (!normalizedAddress) {
    throw new Error('Wallet address is required for authentication');
  }

  const now = Date.now();
  const cached = authCache.get(normalizedAddress);
  if (cached && cached.expiresAt > now && auth.currentUser?.uid === cached.uid) {
    return auth.currentUser;
  }

  const { message, signature } = await requestWalletSignature(normalizedAddress);

  const token = await fetchCustomToken({
    address: normalizedAddress,
    message,
    signature,
  });

  const credential = await signInWithCustomToken(auth, token);

  authCache.set(normalizedAddress, {
    uid: credential.user.uid,
    expiresAt: now + AUTH_CACHE_TTL,
  });

  return credential.user;
};

export const signOutWalletAuth = async () => {
  if (!auth) return;
  await signOut(auth);
  authCache.clear();
};
