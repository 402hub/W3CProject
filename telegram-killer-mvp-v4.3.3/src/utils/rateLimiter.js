/**
 * Rate Limiting Service
 * v4.4.0: Prevent spam and abuse
 * Limits: 60 messages per minute per user
 */

class RateLimiter {
  constructor() {
    // Store message timestamps per wallet address
    this.messageHistory = new Map();
    // 60 messages per minute
    this.maxMessages = 60;
    this.windowMs = 60 * 1000; // 1 minute
  }

  /**
   * Check if user can send a message
   * @param {string} walletAddress - User's wallet address
   * @returns {{allowed: boolean, remaining?: number, resetAt?: number}}
   */
  canSend(walletAddress) {
    if (!walletAddress) {
      return { allowed: false };
    }

    const address = walletAddress.toLowerCase();
    const now = Date.now();
    
    // Get user's message history
    let messages = this.messageHistory.get(address) || [];
    
    // Remove messages outside the time window
    messages = messages.filter(timestamp => now - timestamp < this.windowMs);
    
    // Check if limit exceeded
    if (messages.length >= this.maxMessages) {
      const oldestMessage = messages[0];
      const resetAt = oldestMessage + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }
    
    // Add current message timestamp
    messages.push(now);
    this.messageHistory.set(address, messages);
    
    return {
      allowed: true,
      remaining: this.maxMessages - messages.length,
      resetAt: now + this.windowMs,
    };
  }

  /**
   * Get remaining messages for user
   * @param {string} walletAddress - User's wallet address
   * @returns {number}
   */
  getRemaining(walletAddress) {
    if (!walletAddress) return 0;
    
    const address = walletAddress.toLowerCase();
    const now = Date.now();
    const messages = this.messageHistory.get(address) || [];
    const validMessages = messages.filter(timestamp => now - timestamp < this.windowMs);
    
    return Math.max(0, this.maxMessages - validMessages.length);
  }

  /**
   * Reset rate limit for a user (for testing/admin)
   * @param {string} walletAddress - User's wallet address
   */
  reset(walletAddress) {
    if (walletAddress) {
      this.messageHistory.delete(walletAddress.toLowerCase());
    }
  }

  /**
   * Cleanup old entries (periodic cleanup)
   */
  cleanup() {
    const now = Date.now();
    for (const [address, messages] of this.messageHistory.entries()) {
      const validMessages = messages.filter(timestamp => now - timestamp < this.windowMs);
      if (validMessages.length === 0) {
        this.messageHistory.delete(address);
      } else {
        this.messageHistory.set(address, validMessages);
      }
    }
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

// Periodic cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    rateLimiter.cleanup();
  }, 5 * 60 * 1000);
}

export default RateLimiter;
