// App.jsx - Main Application (Faster than Telegram!)
import React, { useState, useEffect, useRef } from 'react';
import { WagmiProvider, createConfig, useAccount, useConnect, useDisconnect } from 'wagmi';
import { mainnet, polygon, arbitrum } from 'wagmi/chains';
import { http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected, metaMask, walletConnect } from 'wagmi/connectors';
import { messagingEngine } from './messaging';
import { paymentEngine } from './payments';
import { mediaHandler } from './media';
import { db } from './db';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

// Wagmi configuration
const config = createConfig({
  chains: [mainnet, polygon, arbitrum],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http()
  },
  connectors: [
    metaMask(),
    injected(),
    walletConnect({ 
      projectId: 'YOUR_PROJECT_ID', // Get from walletconnect.com
      showQrModal: true 
    })
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
    try {
      const loadStart = performance.now();
      toast.loading('Initializing...');

      // Get signer from wagmi
      const provider = await getEthersProvider();
      const signer = await provider.getSigner();

      // Initialize messaging engine
      await messagingEngine.initialize(signer, { env: 'dev' });
      
      // Initialize payment engine
      await paymentEngine.initialize(signer);

      // Load conversations from cache (instant!)
      const convos = await messagingEngine.listConversations();
      setConversations(convos);

      const loadTime = performance.now() - loadStart;
      toast.dismiss();
      toast.success(`Ready! Loaded in ${loadTime.toFixed(0)}ms 🚀`, {
        icon: '⚡'
      });

      // Subscribe to message events
      messagingEngine.subscribe(handleMessagingEvent);

      // Update metrics
      updateMetrics();

    } catch (error) {
      toast.dismiss();
      toast.error('Initialization failed: ' + error.message);
      console.error(error);
    }
  }

  // ============ MESSAGING EVENTS ============

  function handleMessagingEvent({ event, data }) {
    switch (event) {
      case 'message':
        // New message received
        if (data.conversationId === currentConversation) {
          setMessages(prev => [...prev, data]);
          scrollToBottom();
        }
        
        // Update conversation list
        updateConversationsList();
        
        // Show notification
        if (data.senderAddress !== address) {
          showNotification(data);
        }
        break;

      case 'messageUpdate':
        // Message status updated (sent, delivered, etc)
        setMessages(prev => 
          prev.map(msg => msg.id === data.tempId ? { ...msg, ...data } : msg)
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
    if (!messageText.trim() && !mediaFile) return;

    // Validate conversation is selected
    if (!currentConversation) {
      toast.error('Please select a conversation first');
      return;
    }

    const startTime = performance.now();

    try {
      const options = {};
      
      // Handle media attachment
      if (mediaFile) {
        options.media = mediaFile;
        setUploadProgress(0);
      }

      // Send message (optimistic update = instant UI!)
      await messagingEngine.sendMessage(
        currentConversation,
        messageText,
        options
      );

      const sendTime = performance.now() - startTime;
      console.log(`⚡ Message sent in ${sendTime.toFixed(2)}ms`);

      // Clear input
      setMessageText('');
      setMediaFile(null);
      setUploadProgress(0);
      
      // Update metrics
      updateMetrics();

    } catch (error) {
      console.error('Send error:', error);
      toast.error(`Send failed: ${error.message}`);
      
      // If it's an XMTP V2 error, show helpful message
      if (error.message.includes('V2') || error.message.includes('legacy')) {
        toast.error('XMTP upgrade needed. Trying dev network...', {
          duration: 5000
        });
      }
    }
  }

  async function loadMessages(conversationId) {
    const loadStart = performance.now();
    
    try {
      setCurrentConversation(conversationId);
      
      // Load from cache first (instant!)
      const msgs = await messagingEngine.loadMessages(conversationId, 50);
      setMessages(msgs);
      
      const loadTime = performance.now() - loadStart;
      console.log(`⚡ Loaded ${msgs.length} messages in ${loadTime.toFixed(2)}ms`);
      
      scrollToBottom();

    } catch (error) {
      toast.error('Load failed: ' + error.message);
      console.error(error);
    }
  }

  async function startNewConversation() {
    if (!peerAddress || !peerAddress.startsWith('0x')) {
      toast.error('Invalid wallet address');
      return;
    }

    try {
      await loadMessages(peerAddress);
      setPeerAddress('');
      
      // Update conversations list
      await updateConversationsList();
      
      toast.success('Conversation started!');

    } catch (error) {
      toast.error('Failed to start conversation');
      console.error(error);
    }
  }

  async function updateConversationsList() {
    const convos = await messagingEngine.listConversations();
    setConversations(convos);
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
    const stats = await db.getStats();
    const engineMetrics = messagingEngine.getMetrics();
    setMetrics({ ...stats, ...engineMetrics });
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
          
          <div className="connectors">
            {connectors.map(connector => (
              <button
                key={connector.id}
                onClick={() => connect({ connector })}
                className="connect-button"
              >
                Connect {connector.name}
              </button>
            ))}
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
              placeholder="Enter wallet address (0x...)"
              value={peerAddress}
              onChange={(e) => setPeerAddress(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && startNewConversation()}
            />
            <button onClick={startNewConversation}>Start</button>
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
