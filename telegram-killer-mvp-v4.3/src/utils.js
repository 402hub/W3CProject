/**
 * Utility Functions
 * Helper functions for formatting and display
 */

/**
 * Format timestamp to human-readable relative time
 * Examples: "Just now", "5m ago", "2h ago", "Yesterday", "Jan 15"
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  // Just now (< 1 minute)
  if (diff < 60 * 1000) {
    return 'Just now';
  }
  
  // Minutes ago (< 1 hour)
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }
  
  // Hours ago (< 24 hours)
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }
  
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const messageDate = new Date(timestamp);
  messageDate.setHours(0, 0, 0, 0);
  
  if (messageDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }
  
  // This week
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
  if (timestamp > weekAgo) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[new Date(timestamp).getDay()];
  }
  
  // Older dates - show month and day
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format timestamp for message display (time only)
 * Example: "2:45 PM"
 */
export function formatMessageTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Shorten Ethereum address
 * Example: "0x1234...5678"
 */
export function shortenAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
