# 🚀 SETUP & DEPLOYMENT GUIDE

## Complete Setup Instructions

### Step 1: Prerequisites Check

```bash
# Check Node.js version (should be 18+)
node --version

# Check npm version
npm --version

# If not installed, get Node.js from: https://nodejs.org
```

### Step 2: Install Dependencies

```bash
cd telegram-killer-mvp

# Install all dependencies
npm install

# This will install:
# - React & React DOM
# - XMTP SDK for messaging
# - Wagmi for wallet connections
# - Dexie for IndexedDB
# - IPFS client for media
# - Ethers.js for payments
# - Vite for blazing-fast builds
```

### Step 3: Configure Environment

Create a `.env` file in the root directory:

```env
# WalletConnect Project ID (get free at https://cloud.walletconnect.com)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here

# IPFS Configuration (optional - using public gateways by default)
VITE_IPFS_API_URL=https://ipfs.infura.io:5001/api/v0
VITE_IPFS_GATEWAY=https://cloudflare-ipfs.com/ipfs/

# XMTP Environment
VITE_XMTP_ENV=dev  # Use 'production' for mainnet
```

### Step 4: Run Development Server

```bash
npm run dev

# App will start on http://localhost:3000
# Hot reload enabled - changes appear instantly!
```

### Step 5: Test the App

#### 5.1 Connect Wallet
1. Open http://localhost:3000
2. Click "Connect MetaMask" (or your wallet)
3. Approve the connection
4. Approve XMTP signature (one-time setup)

#### 5.2 Send Your First Message
1. Get a friend's wallet address (or use a second browser profile)
2. Enter their address in the "New Conversation" field
3. Type a message and hit Send
4. **Notice: Message appears INSTANTLY!** ⚡

#### 5.3 Test Offline Mode
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline"
4. Send a message
5. Notice it's queued
6. Uncheck "Offline"
7. Message auto-sends!

#### 5.4 Test Media Upload
1. Click the 📎 button
2. Select an image (will be compressed)
3. Send
4. Check console for upload time

#### 5.5 Test Payment
1. In a conversation, click "💰 Pay"
2. Enter amount (use testnet ETH!)
3. Click "Send Payment"
4. Approve in wallet
5. Payment sent + message notification

## 📊 Performance Testing

### Test 1: Message Load Speed

```javascript
// Open DevTools Console and run:
const start = performance.now();
// Click on a conversation
// Then in console:
const time = performance.now() - start;
console.log(`Load time: ${time.toFixed(2)}ms`);

// Target: <50ms from cache, <200ms from network
```

### Test 2: Message Send Speed

```javascript
// In console before sending:
const sendStart = performance.now();
// Send a message
// Message should appear instantly (optimistic update)
// Check console for network confirmation time

// Target: 0ms UI update, <100ms network confirmation
```

### Test 3: App Launch Performance

```javascript
// Reload page with DevTools open (Network tab)
// Check "Disable cache" for accurate test
// Look at "Finish" time

// Target: <1 second to interactive
```

### Test 4: Database Performance

```javascript
// Run in console:
const db = (await import('./src/db.js')).db;
const stats = await db.getStats();
console.log('Database stats:', stats);

// Test query speed:
const queryStart = performance.now();
const messages = await db.getMessages('0x...', 50);
const queryTime = performance.now() - queryStart;
console.log(`Query time: ${queryTime.toFixed(2)}ms`);

// Target: <20ms for cached queries
```

### Test 5: Media Upload Performance

```javascript
// Upload a 5MB image and check console
// Should see:
// - Compression time
// - Upload time
// - Thumbnail generation time

// Target: <2 seconds for 5MB image
```

## 🏗️ Production Build

### Build for Production

```bash
# Create optimized production build
npm run build

# Output in dist/ folder
# Includes:
# - Minified JS/CSS
# - Code splitting
# - Tree shaking
# - PWA assets
# - Service worker
```

### Test Production Build Locally

```bash
npm run preview

# Test at http://localhost:4173
# Verify all features work
# Check bundle sizes
```

### Bundle Analysis

```bash
# Install analyzer
npm install -D rollup-plugin-visualizer

# Build with analysis
npm run build

# Check dist/stats.html for bundle breakdown
```

## 🚀 Deployment Options

### Option 1: Vercel (Recommended - Fastest)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts
# Auto-deploys from Git on push!
```

**Benefits:**
- Edge network (super fast globally)
- Automatic HTTPS
- Free for personal projects
- CI/CD built-in

### Option 2: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

**Benefits:**
- Easy setup
- Built-in forms
- Split testing
- Free SSL

### Option 3: IPFS (Fully Decentralized!)

```bash
# Build for production
npm run build

# Install IPFS Desktop or CLI
# Add dist folder to IPFS
ipfs add -r dist/

# Get CID and share
# Access at: https://ipfs.io/ipfs/YOUR_CID
```

**Benefits:**
- Fully decentralized
- Censorship-resistant
- Content-addressed
- No server costs

### Option 4: Traditional Hosting (Cloudflare Pages, GitHub Pages)

```bash
# Build
npm run build

# Upload dist/ folder to your hosting
# Configure for SPA (redirect all to index.html)
```

## 🔧 Configuration for Production

### Update Environment Variables

```env
# Production environment
VITE_XMTP_ENV=production
VITE_WALLETCONNECT_PROJECT_ID=your_production_id

# Your own IPFS node (recommended)
VITE_IPFS_API_URL=https://your-ipfs-node.com:5001
```

### Security Checklist

- [ ] Use your own IPFS node (not shared gateway)
- [ ] Enable HTTPS only
- [ ] Set proper CSP headers
- [ ] Rate limit API calls
- [ ] Monitor error logs
- [ ] Set up analytics (privacy-friendly)

### Performance Checklist

- [ ] Enable CDN
- [ ] Configure caching headers
- [ ] Compress assets
- [ ] Enable HTTP/2
- [ ] Test on mobile devices
- [ ] Check Lighthouse scores (aim for 90+)

## 📱 Mobile Testing

### Test on Real Devices

1. Build and deploy to staging
2. Visit on mobile browser
3. Test touch interactions
4. Check performance
5. Verify offline mode
6. Test notifications

### Install as PWA

1. On mobile browser, open the app
2. Click "Add to Home Screen"
3. App installs like native app
4. Test offline functionality

## 🐛 Common Issues & Solutions

### Issue: "No provider found"
**Solution:** Install MetaMask or compatible wallet

### Issue: Messages not sending
**Solution:** Check network, verify XMTP initialization, check console

### Issue: IPFS upload fails
**Solution:** Try different gateway, check file size, verify CORS

### Issue: App slow on mobile
**Solution:** Reduce cache size, optimize images, check bundle size

### Issue: Service worker not updating
**Solution:** Unregister old SW in DevTools, hard refresh

## 🎯 Performance Targets

### Speed Benchmarks

| Metric | Target | Good | Excellent |
|--------|--------|------|-----------|
| FCP (First Contentful Paint) | <1.8s | <1s | <0.5s |
| LCP (Largest Contentful Paint) | <2.5s | <2s | <1.5s |
| TTI (Time to Interactive) | <3.8s | <2s | <1s |
| Message Load (Cache) | <100ms | <50ms | <20ms |
| Message Send (UI) | <50ms | <20ms | <10ms |

### Size Targets

| Asset | Target | Current |
|-------|--------|---------|
| Main JS Bundle | <200KB | ~180KB |
| CSS | <50KB | ~40KB |
| Total Initial Load | <300KB | ~250KB |

## 📈 Monitoring in Production

### Setup Analytics

```javascript
// Add to main.jsx
import { analytics } from './analytics';

analytics.track('app_loaded', {
  loadTime: performance.now()
});
```

### Monitor Performance

```javascript
// Track messaging performance
messagingEngine.subscribe(({ event, data }) => {
  if (event === 'message') {
    analytics.track('message_received', {
      latency: Date.now() - data.timestamp
    });
  }
});
```

### Error Tracking

```javascript
// Add error boundary
window.addEventListener('error', (event) => {
  analytics.track('error', {
    message: event.error.message,
    stack: event.error.stack
  });
});
```

## 🎓 Next Steps

1. **Test thoroughly** - Use the performance testing guide above
2. **Deploy to staging** - Test in production-like environment
3. **Gather feedback** - Share with early users
4. **Iterate** - Improve based on metrics and feedback
5. **Launch** - Deploy to production when ready!

## 📞 Support

Having issues? Check:
1. Console for errors (F12)
2. Network tab for failed requests
3. Application tab for storage/SW issues
4. README.md for troubleshooting

---

**Remember: The goal is to be FASTER than Telegram!**

Test everything with a stopwatch. If any operation feels slow, optimize it!
