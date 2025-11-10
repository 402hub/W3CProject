// App.jsx - Main Application (Faster than Telegram!)
import React, { useState, useEffect, useRef } from 'react';
import { WagmiProvider, createConfig, useAccount, useConnect, useDisconnect } from 'wagmi';
import { mainnet, polygon, arbitrum } from 'wagmi/chains';
import { http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected, metaMask, walletConnect } from 'wagmi/connectors';
import { messagingEngine } from './messaging-simple';
import { paymentEngine } from './payments';
import { db } from './db';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

// Wagmi configuration - Simplified for better compatibility
const config = createConfig({
  chains: [mainnet, polygon, arbitrum],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http()
  },
  connectors: [
    injected({ target: 'metaMask' }),
    injected({ target: 'brave' }),
    injected()  // Fallback for any injected wallet
  ]
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-right" />
        <MainApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function MainApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [peerAddress, setPeerAddress] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isXmtpReady, setIsXmtpReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [metrics, setMetrics] = useState({});
  const [showPayment, setShowPayment] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // ============ INITIALIZATION ============

  useEffect(() => {
    if (isConnected && address) {
      initializeMessaging();
    }
  }, [isConnected, address]);

  async function initializeMessaging() {
    if (isInitializing || isXmtpReady) {
      console.log('Already initializing or initialized');
      return;
    }

    try {
      setIsInitializing(true);
      setIsXmtpReady(false);
      toast.loading('Initializing XMTP...', { id: 'init' });

      console.log('🔄 Starting initialization...');
      
      // Get signer from wagmi
      const provider = await getEthersProvider();
      const signer = await provider.getSigner();

      console.log('🔄 Initializing XMTP client...');
      
      // Initialize XMTP (simplified - just the core messaging)
      await messagingEngine.initialize(signer, { env: 'dev' });
      
      console.log('✅ XMTP initialized!');
      
      // Load conversations
      const convos = await messagingEngine.listConversations();
      setConversations(convos);
      console.log(`📋 Loaded ${convos.length} conversations`);
      
      setIsXmtpReady(true);
      setIsInitializing(false);
      
      toast.dismiss('init');
      toast.success('Ready! XMTP is initialized 🚀', {
        icon: '⚡',
        duration: 3000
      });

      // Subscribe to message events
      messagingEngine.subscribe(handleMessagingEvent);

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      setIsInitializing(false);
      setIsXmtpReady(false);
      
      toast.dismiss('init');
      
      // Handle specific error types
      if (error.message.includes('user rejected') || error.message.includes('User rejected')) {
        toast.error('You rejected the signature request. Please try connecting again and approve the XMTP signature.', {
          duration: 8000
        });
      } else {
        toast.error(`Initialization failed: ${error.message}`, {
          duration: 5000
        });
      }
    }
  }

  // ============ MESSAGING EVENTS ============

  function handleMessagingEvent({ event, data }) {
    console.log('📨 Messaging event:', event, data);
    
    switch (event) {
      case 'message':
        // New message received or sent
        if (data.conversationId === currentConversation) {
          setMessages(prev => {
            // Avoid duplicates
            const exists = prev.some(m => m.id === data.id || m.id === data.tempId);
            if (exists) {
              // Update existing message
              return prev.map(m => 
                (m.id === data.id || m.id === data.tempId) ? { ...m, ...data } : m
              );
            }
            // Add new message
            return [...prev, data];
          });
          scrollToBottom();
        }
        
        // Update conversation list
        updateConversationsList();
        
        // Show notification
        if (data.senderAddress !== address && data.senderAddress !== 'unknown') {
          showNotification(data);
        }
        break;

      case 'messageUpdate':
        // Message status updated (sent, delivered, etc)
        setMessages(prev => 
          prev.map(msg => {
            if (msg.id === data.tempId || msg.id === data.id) {
              return { ...msg, ...data };
            }
            return msg;
          })
        );
        break;

      case 'online':
        setIsOnline(true);
        toast.success('Back online! 🌐');
        break;

      case 'offline':
        setIsOnline(false);
        toast.error('Offline mode 📴');
        break;
    }
  }

  // ============ MESSAGE OPERATIONS ============

  async function sendMessage() {
    if (!messageText.trim()) return;

    // Validate XMTP is ready
    if (!isXmtpReady) {
      toast.error('Please wait for XMTP to initialize');
      return;
    }

    // Validate conversation is selected
    if (!currentConversation) {
      toast.error('Please select a conversation first');
      return;
    }

    try {
      console.log('📤 Sending message...');
      
      // Send message (simple version - no optimistic updates)
      await messagingEngine.sendMessage(currentConversation, messageText);

      console.log('✅ Message sent!');

      // Clear input
      setMessageText('');
      
      // Reload messages to show the sent message
      await loadMessages(currentConversation);
      
      // Update conversation list
      await updateConversationsList();

    } catch (error) {
      console.error('Send error:', error);
      toast.error(`Send failed: ${error.message}`);
    }
  }

  async function loadMessages(peerAddress) {
    try {
      setCurrentConversation(peerAddress);
      
      console.log('📨 Loading messages...');
      const msgs = await messagingEngine.getMessages(peerAddress);
      setMessages(msgs);
      
      console.log(`✅ Loaded ${msgs.length} messages`);
      scrollToBottom();

    } catch (error) {
      toast.error('Load failed: ' + error.message);
      console.error(error);
    }
  }

  async function startNewConversation() {
    // Validate XMTP is ready
    if (!isXmtpReady) {
      toast.error('Please wait for XMTP to initialize', {
        duration: 3000
      });
      return;
    }

    // Validate peer address
    if (!peerAddress || !peerAddress.startsWith('0x')) {
      toast.error('Invalid wallet address');
      return;
    }

    try {
      toast.loading('Creating conversation...', { id: 'create-conv' });
      
      console.log('Creating conversation with:', peerAddress);
      
      // Create the conversation
      await messagingEngine.getOrCreateConversation(peerAddress);
      
      // Load messages for this conversation
      await loadMessages(peerAddress);
      
      // Update conversations list to show in sidebar
      await updateConversationsList();
      
      // Clear input
      setPeerAddress('');
      
      toast.dismiss('create-conv');
      toast.success('Conversation started! 🎉', {
        duration: 2000
      });

    } catch (error) {
      console.error('Failed to start conversation:', error);
      toast.dismiss('create-conv');
      toast.error('Failed to start conversation: ' + error.message, {
        duration: 5000
      });
    }
  }

  async function updateConversationsList() {
    try {
      const convos = await messagingEngine.listConversations();
      console.log('📋 Updated conversation list:', convos.length, 'conversations');
      setConversations(convos);
    } catch (error) {
      console.error('Failed to update conversations:', error);
    }
  }

  // ============ MEDIA HANDLING ============

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      // Validate file size (100MB max)
      if (file.size > 100 * 1024 * 1024) {
        toast.error('File too large (max 100MB)');
        return;
      }

      setMediaFile(file);
      toast.success(`File selected: ${file.name}`);
    }
  }

  async function downloadMedia(ipfsHash) {
    try {
      toast.loading('Downloading...');
      
      const blob = await mediaHandler.downloadFile(ipfsHash, (progress) => {
        console.log(`Download progress: ${progress.toFixed(0)}%`);
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `file_${ipfsHash.substring(0, 8)}`;
      a.click();

      toast.dismiss();
      toast.success('Downloaded!');

    } catch (error) {
      toast.dismiss();
      toast.error('Download failed');
      console.error(error);
    }
  }

  // ============ PAYMENTS ============

  async function sendPayment(recipientAddress, amount, token = 'ETH') {
    try {
      toast.loading('Sending payment...');

      const result = await paymentEngine.quickSend(
        recipientAddress,
        amount,
        token,
        {
          onStart: () => console.log('Payment starting...'),
          onConfirm: (receipt) => {
            toast.dismiss();
            toast.success(`Payment confirmed! 💸`);
            
            // Send message notification
            messagingEngine.sendMessage(
              recipientAddress,
              `💰 Sent you ${amount} ${token}!`
            );
          },
          onError: (error) => {
            toast.dismiss();
            toast.error('Payment failed: ' + error.message);
          }
        }
      );

      toast.dismiss();
      toast.success('Payment sent! ⏳');
      console.log('Payment hash:', result.hash);

    } catch (error) {
      toast.dismiss();
      toast.error('Payment failed');
      console.error(error);
    }
  }

  // ============ UTILITIES ============

  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('New Message', {
        body: message.content.substring(0, 100),
        icon: '/icon-192.png',
        tag: message.conversationId
      });
    }
  }

  async function updateMetrics() {
    try {
      const engineMetrics = messagingEngine.getMetrics();
      setMetrics(engineMetrics);
    } catch (error) {
      console.error('Error updating metrics:', error);
    }
  }

  async function getEthersProvider() {
    const { BrowserProvider } = await import('ethers');
    return new BrowserProvider(window.ethereum);
  }

  function formatAddress(addr) {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  }

  function formatTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ============ RENDER ============

  if (!isConnected) {
    return (
      <div className="connect-screen">
        <div className="connect-container">
          <h1>⚡ Telegram Killer</h1>
          <p className="subtitle">Faster than Telegram. Powered by Web3.</p>
          <p className="subtitle">Connect your wallet to start messaging</p>
          <p className="info">⚠️ You'll need to sign a message to enable XMTP - this is normal and safe!</p>
          
          <div className="connectors">
            {connectors.filter((connector, index, self) => 
              // Remove duplicates and only show unique wallet names
              index === self.findIndex((c) => c.name === connector.name)
            ).map(connector => (
              <button
                key={connector.id}
                onClick={() => connect({ connector })}
                className="connect-button"
              >
                Connect {connector.name === 'Injected' ? 'Your Wallet' : connector.name}
              </button>
            ))}
          </div>
          
          <div className="connection-note">
            <strong>Important:</strong> After connecting, you must <strong>sign the XMTP message</strong> in your wallet. Don't reject it or initialization will fail!
          </div>
          
          <div className="features">
            <div className="feature">⚡ Lightning fast</div>
            <div className="feature">🔒 End-to-end encrypted</div>
            <div className="feature">💰 Crypto payments</div>
            <div className="feature">📴 Offline support</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1>⚡ Telegram Killer</h1>
          <div className="status">
            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
            {isOnline ? 'Online' : 'Offline'}
            {' • '}
            {isXmtpReady ? '✅ XMTP Ready' : isInitializing ? '⏳ Initializing' : '❌ XMTP Not Ready'}
          </div>
        </div>
        
        <div className="header-right">
          <div className="metrics">
            <span>📊 {metrics.messages || 0} messages</span>
            <span>⚡ {metrics.averageSendTime?.toFixed(0) || 0}ms avg</span>
          </div>
          <div className="wallet-info">
            {formatAddress(address)}
          </div>
          <button onClick={() => disconnect()} className="disconnect-btn">
            Disconnect
          </button>
        </div>
      </header>

      <div className="main">
        {/* Sidebar - Conversations */}
        <aside className="sidebar">
          <div className="new-conversation">
            <input
              type="text"
              placeholder={isXmtpReady ? "Enter wallet address (0x...)" : "Initializing XMTP..."}
              value={peerAddress}
              onChange={(e) => setPeerAddress(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && isXmtpReady && startNewConversation()}
              disabled={!isXmtpReady}
            />
            <button 
              onClick={startNewConversation}
              disabled={!isXmtpReady || isInitializing}
              title={!isXmtpReady ? 'Waiting for XMTP to initialize...' : 'Start new conversation'}
            >
              {isInitializing ? '...' : isXmtpReady ? 'Start' : '⏳'}
            </button>
          </div>

          <div className="conversations">
            {conversations.length === 0 && (
              <div className="empty-state">
                No conversations yet.<br />Start one above!
              </div>
            )}
            
            {conversations.map(convo => (
              <div
                key={convo.id}
                className={`conversation-item ${currentConversation === convo.id ? 'active' : ''}`}
                onClick={() => loadMessages(convo.id)}
              >
                <div className="avatar">{convo.peerAddress.substring(2, 4)}</div>
                <div className="conversation-info">
                  <div className="peer-address">{formatAddress(convo.peerAddress)}</div>
                  <div className="last-message">{convo.lastMessage || 'No messages yet'}</div>
                </div>
                <div className="conversation-meta">
                  <div className="timestamp">{formatTimestamp(convo.lastMessageTime)}</div>
                  {convo.unreadCount > 0 && (
                    <div className="unread-badge">{convo.unreadCount}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="chat-area">
          {!currentConversation ? (
            <div className="empty-chat">
              <h2>⚡ Select a conversation or start a new one</h2>
              <p>Messages are encrypted, instant, and stored locally for speed</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="chat-peer">
                  <div className="avatar">{currentConversation.substring(2, 4)}</div>
                  <div>
                    <div className="peer-name">{formatAddress(currentConversation)}</div>
                    <div className="peer-status">Online</div>
                  </div>
                </div>
                
                <div className="chat-actions">
                  <button onClick={() => setShowPayment(true)} className="pay-btn">
                    💰 Pay
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="messages">
                {messages.map((msg, index) => (
                  <div
                    key={msg.id || index}
                    className={`message ${msg.senderAddress === address ? 'sent' : 'received'}`}
                  >
                    <div className="message-content">
                      {msg.content}
                      
                      {msg.media && (
                        <div className="message-media">
                          {msg.media.fileType === 'image' && msg.media.data && (
                            <img
                              src={msg.media.data}
                              alt="attachment"
                              style={{ maxWidth: '300px', borderRadius: '8px', marginTop: '8px', cursor: 'pointer' }}
                              onClick={() => {
                                // Open full image in new tab
                                const win = window.open();
                                win.document.write(`<img src="${msg.media.data}" style="max-width: 100%;">`);
                              }}
                            />
                          )}
                          {msg.media.fileName && (
                            <div style={{ fontSize: '0.85rem', marginTop: '4px', opacity: 0.8 }}>
                              📎 {msg.media.fileName} ({(msg.media.fileSize / 1024).toFixed(1)} KB)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="message-meta">
                      {formatTimestamp(msg.timestamp)}
                      {msg.status === 'sending' && ' ⏳'}
                      {msg.status === 'sent' && ' ✓'}
                      {msg.status === 'failed' && ' ❌'}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="message-input">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="attach-btn"
                  title="Attach file"
                >
                  📎
                </button>

                {mediaFile && (
                  <div className="media-preview">
                    {mediaFile.name}
                    <button onClick={() => setMediaFile(null)}>✕</button>
                  </div>
                )}

                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />

                <button onClick={sendMessage} className="send-btn">
                  Send
                </button>
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="upload-progress">
                  Uploading: {uploadProgress.toFixed(0)}%
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>💰 Send Payment</h2>
            <p>Apple Pay-like crypto payments</p>
            
            <div className="payment-form">
              <input
                type="number"
                placeholder="Amount"
                id="paymentAmount"
              />
              
              <select id="paymentToken">
                <option value="ETH">ETH</option>
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>

              <div className="quick-amounts">
                {[1, 5, 10, 20, 50].map(amount => (
                  <button
                    key={amount}
                    onClick={() => document.getElementById('paymentAmount').value = amount}
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  const amount = document.getElementById('paymentAmount').value;
                  const token = document.getElementById('paymentToken').value;
                  sendPayment(currentConversation, amount, token);
                  setShowPayment(false);
                }}
                className="primary-btn"
              >
                Send Payment
              </button>
            </div>

            <button onClick={() => setShowPayment(false)} className="close-btn">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
