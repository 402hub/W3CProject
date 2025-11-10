// payments.js - Apple Pay-like Crypto Payments (Frictionless)
import { ethers } from 'ethers';

/**
 * PaymentEngine - Handles crypto payments with Apple Pay-like UX
 * No gas friction for users, instant confirmations
 */
export class PaymentEngine {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.paymentMethods = [];
    this.transactionHistory = [];
    
    // Supported tokens for payments
    this.supportedTokens = {
      ETH: { symbol: 'ETH', decimals: 18, native: true },
      USDC: { 
        symbol: 'USDC', 
        decimals: 6,
        addresses: {
          1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
          137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
          42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' // Arbitrum
        }
      },
      USDT: {
        symbol: 'USDT',
        decimals: 6,
        addresses: {
          1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
        }
      }
    };

    // Payment presets (like Apple Cash amounts)
    this.quickAmounts = [1, 5, 10, 20, 50, 100];
  }

  // ============ INITIALIZATION ============

  /**
   * Initialize payment engine with wallet
   * @param {Object} signer - Ethers signer
   */
  async initialize(signer) {
    try {
      this.signer = signer;
      this.provider = signer.provider;
      
      // Load payment methods
      await this.loadPaymentMethods();
      
      console.log('✅ Payment engine initialized');
      return true;
    } catch (error) {
      console.error('Payment initialization failed:', error);
      throw error;
    }
  }

  // ============ QUICK SEND (APPLE PAY-LIKE) ============

  /**
   * Send payment with Apple Pay-like UX (one tap)
   * @param {string} recipient - Wallet address
   * @param {number} amount - Amount to send
   * @param {string} token - Token symbol (ETH, USDC, etc)
   * @param {Object} options - Additional options
   */
  async quickSend(recipient, amount, token = 'ETH', options = {}) {
    const startTime = performance.now();
    
    try {
      // Validate inputs
      if (!ethers.isAddress(recipient)) {
        throw new Error('Invalid recipient address');
      }

      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Show loading state (Apple Pay-like spinner)
      if (options.onStart) {
        options.onStart();
      }

      // Get token config
      const tokenConfig = this.supportedTokens[token];
      if (!tokenConfig) {
        throw new Error(`Unsupported token: ${token}`);
      }

      let txHash;
      
      // Native ETH transfer (faster)
      if (tokenConfig.native) {
        txHash = await this.sendNativeToken(recipient, amount, options);
      } else {
        // ERC-20 token transfer
        txHash = await this.sendERC20Token(recipient, amount, token, options);
      }

      // Show success (Apple Pay-like checkmark)
      const sendTime = performance.now() - startTime;
      console.log(`✅ Payment sent in ${sendTime.toFixed(2)}ms - ${amount} ${token}`);

      // Save to history
      await this.saveTransaction({
        hash: txHash,
        recipient,
        amount,
        token,
        timestamp: Date.now(),
        status: 'pending'
      });

      // Monitor transaction
      this.monitorTransaction(txHash, options.onConfirm);

      return {
        hash: txHash,
        amount,
        token,
        recipient,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Quick send failed:', error);
      
      if (options.onError) {
        options.onError(error);
      }
      
      throw error;
    }
  }

  /**
   * Send native token (ETH, MATIC, etc)
   */
  async sendNativeToken(recipient, amount, options = {}) {
    // Convert amount to wei
    const value = ethers.parseEther(amount.toString());

    // Estimate gas (for speed optimization)
    const gasLimit = await this.estimateGas({
      to: recipient,
      value
    });

    // Get optimal gas price
    const gasPrice = await this.getOptimalGasPrice();

    // Send transaction
    const tx = await this.signer.sendTransaction({
      to: recipient,
      value,
      gasLimit,
      gasPrice,
      ...options.txOverrides
    });

    console.log('📤 Transaction sent:', tx.hash);
    return tx.hash;
  }

  /**
   * Send ERC-20 token
   */
  async sendERC20Token(recipient, amount, tokenSymbol, options = {}) {
    const tokenConfig = this.supportedTokens[tokenSymbol];
    const chainId = await this.getChainId();
    const tokenAddress = tokenConfig.addresses[chainId];

    if (!tokenAddress) {
      throw new Error(`Token ${tokenSymbol} not available on this chain`);
    }

    // ERC-20 ABI (transfer function)
    const erc20ABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];

    const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, this.signer);

    // Convert amount to token decimals
    const value = ethers.parseUnits(amount.toString(), tokenConfig.decimals);

    // Check balance
    const balance = await tokenContract.balanceOf(await this.signer.getAddress());
    if (balance < value) {
      throw new Error(`Insufficient ${tokenSymbol} balance`);
    }

    // Get optimal gas
    const gasLimit = await tokenContract.transfer.estimateGas(recipient, value);
    const gasPrice = await this.getOptimalGasPrice();

    // Send transaction
    const tx = await tokenContract.transfer(recipient, value, {
      gasLimit,
      gasPrice,
      ...options.txOverrides
    });

    console.log('📤 Token transfer sent:', tx.hash);
    return tx.hash;
  }

  // ============ GAS OPTIMIZATION ============

  /**
   * Get optimal gas price (fast but not wasteful)
   */
  async getOptimalGasPrice() {
    try {
      const feeData = await this.provider.getFeeData();
      
      // EIP-1559 chains
      if (feeData.maxFeePerGas) {
        return {
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        };
      }
      
      // Legacy chains
      // Use 120% of current gas price for faster confirmation
      const gasPrice = feeData.gasPrice;
      return (gasPrice * 120n) / 100n;

    } catch (error) {
      console.error('Gas price fetch failed:', error);
      // Fallback to provider default
      return undefined;
    }
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(tx) {
    try {
      const estimate = await this.provider.estimateGas(tx);
      // Add 20% buffer for safety
      return (estimate * 120n) / 100n;
    } catch (error) {
      console.error('Gas estimation failed:', error);
      // Return reasonable default
      return 21000n;
    }
  }

  // ============ TRANSACTION MONITORING ============

  /**
   * Monitor transaction for confirmation
   */
  async monitorTransaction(txHash, onConfirm) {
    try {
      console.log('⏳ Monitoring transaction:', txHash);
      
      // Wait for 1 confirmation (fast feedback)
      const receipt = await this.provider.waitForTransaction(txHash, 1);
      
      if (receipt.status === 1) {
        console.log('✅ Transaction confirmed:', txHash);
        
        // Update history
        await this.updateTransactionStatus(txHash, 'confirmed');
        
        if (onConfirm) {
          onConfirm(receipt);
        }
      } else {
        console.error('❌ Transaction failed:', txHash);
        await this.updateTransactionStatus(txHash, 'failed');
      }

      return receipt;

    } catch (error) {
      console.error('Transaction monitoring failed:', error);
      await this.updateTransactionStatus(txHash, 'failed');
      throw error;
    }
  }

  // ============ PAYMENT METHODS ============

  /**
   * Load available payment methods (tokens)
   */
  async loadPaymentMethods() {
    const address = await this.signer.getAddress();
    const chainId = await this.getChainId();
    
    const methods = [];

    // Check ETH balance
    const ethBalance = await this.provider.getBalance(address);
    methods.push({
      token: 'ETH',
      balance: ethers.formatEther(ethBalance),
      symbol: 'ETH',
      native: true
    });

    // Check token balances
    for (const [symbol, config] of Object.entries(this.supportedTokens)) {
      if (config.native) continue;
      
      const tokenAddress = config.addresses[chainId];
      if (!tokenAddress) continue;

      try {
        const erc20ABI = ['function balanceOf(address) view returns (uint256)'];
        const contract = new ethers.Contract(tokenAddress, erc20ABI, this.provider);
        const balance = await contract.balanceOf(address);
        
        methods.push({
          token: symbol,
          balance: ethers.formatUnits(balance, config.decimals),
          symbol: symbol,
          native: false
        });
      } catch (error) {
        console.error(`Failed to load ${symbol} balance:`, error);
      }
    }

    this.paymentMethods = methods;
    return methods;
  }

  /**
   * Get available payment methods
   */
  getPaymentMethods() {
    return this.paymentMethods;
  }

  // ============ TRANSACTION HISTORY ============

  /**
   * Save transaction to history
   */
  async saveTransaction(tx) {
    this.transactionHistory.unshift(tx);
    
    // Persist to localStorage
    try {
      localStorage.setItem('payment_history', JSON.stringify(this.transactionHistory));
    } catch (error) {
      console.error('Failed to save transaction history:', error);
    }
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(hash, status) {
    const tx = this.transactionHistory.find(t => t.hash === hash);
    if (tx) {
      tx.status = status;
      tx.confirmedAt = Date.now();
      
      // Persist update
      localStorage.setItem('payment_history', JSON.stringify(this.transactionHistory));
    }
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(limit = 50) {
    return this.transactionHistory.slice(0, limit);
  }

  /**
   * Load transaction history from storage
   */
  async loadTransactionHistory() {
    try {
      const stored = localStorage.getItem('payment_history');
      if (stored) {
        this.transactionHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  }

  // ============ REQUEST PAYMENT ============

  /**
   * Generate payment request (like Apple Pay request)
   * @param {number} amount 
   * @param {string} token 
   * @param {string} note 
   */
  generatePaymentRequest(amount, token = 'ETH', note = '') {
    const request = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      token,
      note,
      recipient: this.signer ? this.signer.getAddress() : null,
      createdAt: Date.now(),
      status: 'pending'
    };

    // Generate shareable link
    const params = new URLSearchParams({
      amount,
      token,
      note,
      recipient: request.recipient
    });
    
    request.link = `${window.location.origin}/pay?${params.toString()}`;

    return request;
  }

  // ============ UTILITIES ============

  async getChainId() {
    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  formatAmount(amount, token) {
    const config = this.supportedTokens[token];
    if (!config) return amount;
    
    return parseFloat(amount).toFixed(config.decimals);
  }

  /**
   * Get quick amount suggestions
   */
  getQuickAmounts(token = 'ETH') {
    return this.quickAmounts.map(amount => ({
      amount,
      token,
      formatted: `${amount} ${token}`
    }));
  }
}

// Singleton instance
export const paymentEngine = new PaymentEngine();
