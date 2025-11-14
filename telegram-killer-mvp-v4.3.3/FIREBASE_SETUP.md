# Firebase Setup Guide for v4.4.0

This guide explains how to configure Firebase for production use with v4.4.0 features.

## Prerequisites

1. Firebase project created at https://console.firebase.google.com
2. Realtime Database enabled (not Firestore)
3. Firebase config added to `src/firebase.js`

## Step 1: Configure Firebase Config

Edit `src/firebase.js` and replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Step 2: Deploy Security Rules

1. Go to Firebase Console > Realtime Database > Rules
2. Copy the contents of `firebase.rules.json` (for development) or `firebase.rules.production.json` (for production with Firebase Auth)
3. Paste into the Firebase Console rules editor
4. Click "Publish"

**Note:** The security rules in v4.4.0 include:
- Message content validation (1000 char limit)
- Timestamp validation
- Address format validation
- Input sanitization (no HTML/script tags)

**Development Rules (`firebase.rules.json`):**
- Open read/write for development
- Validates message format and content length
- Perfect for testing

**Production Rules (`firebase.rules.production.json`):**
- Requires Firebase Authentication
- Wallet-based access control
- More secure for production use

## Step 3: Monitor Performance

For Realtime Database, indexes are automatically created based on query patterns. However, you should:

1. Go to Firebase Console > Realtime Database > Data
2. Monitor query performance in the Firebase Console
3. Ensure your queries use `.orderByChild('timestamp')` and `.limitToLast(70)` patterns (already implemented in v4.4.0)

**Note:** Realtime Database doesn't require explicit index configuration like Firestore. The database automatically indexes based on query patterns. v4.4.0's pagination (70 messages) and lazy loading (20 conversations) ensure optimal performance.

## Step 4: Enable Authentication (Optional)

If you want to use Firebase Authentication for additional security:

1. Go to Firebase Console > Authentication
2. Enable "Anonymous" or "Custom" authentication
3. Update security rules to use `auth.uid` instead of `auth.token.walletAddress`

## Step 5: Test Your Setup

1. Start the app: `npm run dev`
2. Connect your wallet
3. Send a test message
4. Check Firebase Console > Realtime Database to verify messages are being stored

## Security Features in v4.4.0

✅ **Wallet-based authentication** - Only participants in a conversation can read/write
✅ **Message validation** - 1000 character limit enforced
✅ **Input sanitization** - XSS prevention at client and server level
✅ **Rate limiting** - 60 messages/minute (client-side)
✅ **Timestamp validation** - Prevents timestamp manipulation

## Troubleshooting

### "Permission denied" errors
- Check that your security rules are published
- Verify wallet address format in rules matches your app

### Performance warnings
- Ensure queries use `.orderByChild('timestamp')` and `.limitToLast(70)`
- Consider pagination for large conversations

### Messages not syncing
- Check Firebase config is correct
- Verify Realtime Database is enabled (not Firestore)
- Check browser console for errors

## Production Deployment

For production:

1. Build the app: `npm run build`
2. Deploy to Firebase Hosting or your preferred hosting
3. Ensure HTTPS is enabled (v4.4.0 enforces HTTPS)
4. Verify CSP headers are set correctly

## Additional Notes

- Realtime Database indexes are automatic based on query patterns
- Security rules validate message content length and format
- Rate limiting is client-side; consider server-side for production
- CSP headers are configured in `index.html`
