# 🚀 DEPLOYMENT GUIDE - Get Off Localhost!

## Quick Deploy to Vercel (Recommended - 5 Minutes)

Vercel is the fastest way to deploy and test your app online.

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Deploy

```bash
# From your project directory
cd telegram-killer-mvp

# Login to Vercel (creates account if needed)
vercel login

# Deploy!
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? telegram-killer (or whatever you want)
# - Directory? ./
# - Override settings? No

# Wait ~2 minutes for build...
# You'll get a URL like: https://telegram-killer-abc123.vercel.app
```

### Step 3: Test Online!

Visit your deployed URL and:
- Connect MetaMask
- Test messaging
- Share with friends to test real multi-user!

## Alternative: Deploy to Netlify (Also Easy)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build your project
npm run build

# Deploy
netlify deploy --prod

# Follow prompts, get your URL
```

## Alternative: Deploy to GitHub Pages

### Step 1: Push to GitHub

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/telegram-killer.git
git push -u origin main
```

### Step 2: Configure GitHub Pages

1. Go to repo Settings → Pages
2. Source: GitHub Actions
3. Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
      
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

4. Push and wait for deployment
5. Visit: `https://YOUR_USERNAME.github.io/telegram-killer`

## Environment Variables

For production deployment, create `.env.production`:

```env
# WalletConnect Project ID (get from cloud.walletconnect.com)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here

# XMTP Environment
VITE_XMTP_ENV=production

# Your domain (for CORS, if needed)
VITE_APP_URL=https://your-app.vercel.app
```

### Get WalletConnect Project ID:

1. Go to https://cloud.walletconnect.com
2. Sign up (free)
3. Create new project
4. Copy Project ID
5. Add to `.env.production`

## Vercel Environment Variables

Add env vars in Vercel dashboard:

1. Go to your project settings
2. Environment Variables
3. Add:
   - `VITE_WALLETCONNECT_PROJECT_ID` → your WalletConnect ID
   - `VITE_XMTP_ENV` → `production`

4. Redeploy:
```bash
vercel --prod
```

## Testing Your Deployment

### ✅ Checklist:

- [ ] App loads without errors
- [ ] Can connect MetaMask
- [ ] Can start conversations
- [ ] Can send messages
- [ ] Messages appear in real-time
- [ ] Works on mobile
- [ ] Can install as PWA
- [ ] Offline mode works

### 🐛 Common Issues:

**Issue: "Failed to fetch"**
- Solution: Check CORS settings, add your domain to allowed origins

**Issue: MetaMask not connecting**
- Solution: Make sure you're on HTTPS (Vercel/Netlify handle this automatically)

**Issue: XMTP initialization fails**
- Solution: Check XMTP_ENV is set to 'production'

**Issue: Assets not loading**
- Solution: Check base URL in vite.config.js

## Performance Monitoring

### Add Analytics (Optional)

**Vercel Analytics:**
```bash
npm install @vercel/analytics
```

```javascript
// In src/main.jsx
import { Analytics } from '@vercel/analytics/react';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
```

### Monitor Errors (Optional)

**Sentry:**
```bash
npm install @sentry/react
```

```javascript
// In src/main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your_sentry_dsn",
  environment: "production"
});
```

## Custom Domain (Optional)

### Vercel:
1. Buy domain (Namecheap, Google Domains, etc.)
2. In Vercel: Settings → Domains
3. Add your domain
4. Update DNS records (Vercel provides instructions)
5. Wait for SSL certificate (~5 minutes)

### Result: `https://yourdomain.com` 🎉

## Continuous Deployment

### Auto-deploy on Git Push:

**Vercel:**
```bash
# Link to GitHub
vercel --prod

# Now every push to main auto-deploys!
```

**Netlify:**
```bash
# Link to GitHub in Netlify dashboard
# Enable auto-publishing
```

## Cost Estimates

### Vercel (Recommended):
- **Free tier**: Perfect for MVP
  - 100GB bandwidth/month
  - Unlimited personal projects
  - Automatic HTTPS
  - Global CDN

- **Pro tier** ($20/month): When you scale
  - More bandwidth
  - Team collaboration
  - Priority support

### Netlify:
- **Free tier**: Also great
  - 100GB bandwidth/month
  - 300 build minutes/month
  - Automatic HTTPS

### GitHub Pages:
- **Free**: Basic hosting
  - 1GB storage
  - 100GB bandwidth/month
  - Limited features

## Recommendation

**For MVP Testing:** Vercel Free Tier

Why?
- ✅ Fastest deployment (2 minutes)
- ✅ Automatic HTTPS
- ✅ Global CDN (fast everywhere)
- ✅ Easy environment variables
- ✅ Automatic deployments
- ✅ Preview deployments for testing
- ✅ Built-in analytics
- ✅ Free SSL certificate

## Deployment Checklist

Before deploying:

- [ ] Test locally (`npm run build && npm run preview`)
- [ ] Update environment variables
- [ ] Get WalletConnect Project ID
- [ ] Test build passes
- [ ] Check bundle size (<1MB ideal)
- [ ] Test on multiple browsers
- [ ] Prepare for user feedback

After deploying:

- [ ] Test on deployed URL
- [ ] Connect wallet successfully
- [ ] Send test messages
- [ ] Test on mobile
- [ ] Share with beta testers
- [ ] Monitor console for errors
- [ ] Check performance metrics

## Mobile Testing

Once deployed, test on:

### iOS:
1. Open in Safari
2. Tap Share button
3. "Add to Home Screen"
4. Test as PWA

### Android:
1. Open in Chrome
2. Tap menu → "Install app"
3. Test as PWA

## Scaling Considerations

When you get traction:

**100 users:**
- Free tier is fine
- Monitor bandwidth

**1,000 users:**
- Consider Pro tier ($20/month)
- Add error tracking
- Add analytics

**10,000+ users:**
- Upgrade to Pro
- Consider dedicated infrastructure
- Load balancing
- CDN optimization

## Security Checklist

Before going live:

- [ ] Enable HTTPS (Vercel/Netlify do this)
- [ ] Set CSP headers
- [ ] Rate limiting (if using API)
- [ ] Input validation
- [ ] XSS protection
- [ ] Regular dependency updates

## Next Steps

1. **Deploy to Vercel** (5 minutes)
2. **Test online** (10 minutes)
3. **Share with friends** (get feedback!)
4. **Monitor usage** (watch for errors)
5. **Iterate based on feedback**

---

## Quick Command Summary

```bash
# Vercel deployment (fastest)
npm install -g vercel
vercel login
vercel

# Netlify deployment
npm install -g netlify-cli
npm run build
netlify deploy --prod

# GitHub Pages deployment
git init
git add .
git commit -m "Deploy"
git push origin main
# Configure in GitHub settings
```

---

**Ready to deploy?** Start with Vercel - it's the fastest and most reliable option for MVP testing! 🚀

**Your app will be live in under 5 minutes!**
