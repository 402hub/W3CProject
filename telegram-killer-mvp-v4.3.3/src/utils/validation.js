/**
 * Input Validation & Sanitization Utilities
 * v4.4.0: Security hardening
 */

/**
 * Sanitize user input to prevent XSS attacks
 * Removes potentially dangerous HTML/script tags
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Escape special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized.trim();
}

/**
 * Validate message content
 * @param {string} content - Message content to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateMessage(content) {
  // Check if empty
  if (!content || !content.trim()) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  // Check length (1000 character limit)
  if (content.length > 1000) {
    return { valid: false, error: 'Message cannot exceed 1000 characters' };
  }

  return { valid: true };
}

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean}
 */
export function validateAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}
