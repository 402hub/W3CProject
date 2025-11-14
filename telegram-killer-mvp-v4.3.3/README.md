# ⚡ Tello v4.4.0 – Performance & Security Foundation

Tello 4.4.0 locks down the stack for scale: production Firebase configuration, wallet-based authentication, database indexes, paginated data access, and end-to-end hardening (CSP, HTTPS enforce, XSS prevention, rate limiting).

---

## 🚀 Highlight Reel

- **Wallet-authenticated Firebase sync** with custom token flow (bring your own signer endpoint)
- **Realtime Database security rules** enforcing wallet ownership, 1000 character validation, and participant isolation
- **Indexed queries + lazy loading**  
  - Conversations: first 20, “load on scroll” virtualized list  
  - Messages: 70-per-page window with load-previous + optimistic updates
- **Client security layer**  
  - HTTPS redirect in production  
  - CSP, HSTS, X-Frame-Options, Referrer-Policy, nosniff headers  
  - Sanitized inputs, 1000 char limit, 60 msg/minute throttle
- **Firebase Performance Monitoring** bootstrapped
- **Deployment assets**: `firebase.json`, `database.rules.json`, environment-driven `src/firebase.js`

---

## 🧰 Environment & Secrets

Create `.env.local` (Vite loads `VITE_*` variables):

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=sender-id
VITE_FIREBASE_APP_ID=app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX # optional

# Endpoint that verifies the wallet signature and returns a Firebase custom token
VITE_WALLET_AUTH_ENDPOINT=https://your-cloud-function.example.com/createWalletToken
```

Your wallet auth endpoint should:
1. Receive `{ address, message, signature }`
2. Recover the signer, validate the nonce, mint Firebase Custom Token with `walletAddress` claim
3. Return `{ token }`

---

## 🔐 Firebase Setup Checklist

1. **Install tools**
   ```bash
   npm install -g firebase-tools
   ```
2. **Login & select project**
   ```bash
   firebase login
   firebase use <YOUR_FIREBASE_PROJECT_ID>
   ```
3. **Deploy security rules**
   ```bash
   firebase deploy --only database
   ```
   `database.rules.json` already includes timestamp indexes and wallet validation.

4. **Deploy hosting (build first)**
   ```bash
   npm install
   npm run build
   firebase deploy --only hosting
   ```

`firebase.json` ships CSP, HSTS, X-Frame-Options, Referrer-Policy, and nosniff headers.

---

## 🏃 Local Development

```bash
npm install
npm run dev
```

Dev CSP allows `localhost` and `ws://` connections for Vite HMR. Production builds redirect to HTTPS automatically.

---

## 💬 Messaging Mechanics

| Feature                     | Details                                                          |
|-----------------------------|------------------------------------------------------------------|
| Pagination                  | 70 messages per page (load previous), 20 conversations initially |
| Caching                     | Per-conversation message cache with cursor tracking              |
| Validation                  | 1–1000 characters, sanitized control chars & script tags         |
| Rate limiting               | 60 messages / minute per wallet (client-enforced)               |
| Firebase payload            | Includes `rateLimitBucket` (minute bucket) for future analytics |
| Conversations               | Virtualized list, "Load more" triggers on scroll or button       |

---

## 🔄 Wallet Authentication Flow

1. User connects via Wagmi.
2. On first Firebase interaction we request a signature (`personal_sign`).
3. Signature + nonce posted to `VITE_WALLET_AUTH_ENDPOINT`.
4. Endpoint returns Firebase custom token with `walletAddress` claim.
5. Client signs into Firebase Auth (persistence prioritized: IndexedDB → localStorage → memory).

> Tip: Cache tokens for ~10 minutes server-side to avoid re-signing every request.

---

## 🛡️ Security Features

- CSP, Referrer-Policy, X-Frame-Options, HSTS (Firebase hosting + index.html)
- HTTPS redirect in production builds (`src/main.jsx`)
- Sanitized message content and removed control characters
- Firebase rules enforce:
  - wallet participation and deterministic conversation IDs
  - sender address = authenticated wallet
  - 1000 char limit & `rateLimitBucket` presence
  - participants list restricted to wallet pair

---

## 🧭 Upgrading / Troubleshooting

- **Need more than 70 messages?** Adjust `MESSAGE_PAGE_SIZE` in `src/services/database.js`.
- **Backend auth pending?** If `VITE_WALLET_AUTH_ENDPOINT` is unset, Firebase sync gracefully degrades to local-only mode.
- **IndexedDB schema bump** handled via Dexie `version(2)` upgrade.
- **CSP issues in dev?** Confirm your dev server origin is allowed in `index.html`.

---

## ✅ Version Info

- **Name:** Tello v4.4.0
- **Theme:** Performance & Security Foundation
- **Core Deliverables:** Wallet-authenticated Firebase, pagination, sanitization, rate limiting, CSP/HSTS, Firebase performance monitoring

Build bold. Deploy safe. 🚀
