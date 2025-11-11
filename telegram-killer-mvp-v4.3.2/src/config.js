/**
 * Wagmi Configuration
 * Web3 wallet connection setup with multiple connectors for mobile support
 */

import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// WalletConnect Project ID - Get yours at https://cloud.walletconnect.com
const projectId = 'REPLACE WITH ID'; // Replace with your actual project ID

export const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    // MetaMask and browser wallets
    injected(),
    
    // WalletConnect - Supports mobile wallets (Trust, Rainbow, MetaMask Mobile, etc.)
    walletConnect({
      projectId,
      showQrModal: true,
    }),
    
    // Coinbase Wallet
    coinbaseWallet({
      appName: 'Telegram Killer',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

