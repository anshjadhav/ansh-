# Personal Trading Journal Web Application & Backend

A clean, responsive, dark-themed Trading Journal web application with a full Node.js REST API backend, JSON database persistence, and an automatic client storage engine. Designed for traders to track balance growth, record trades with manual Profit/Loss entries, and maintain risk discipline.

---

## 🌟 Key Architecture & Capabilities

### 1. 🖥️ Full Backend REST API & Database
- **Backend File**: `server.js` (Built with pure standard Node.js — zero external npm dependencies required!).
- **Database File**: `data/db.json` (Stores accounts, sessions, and trade records with atomic write protection).
- **REST Endpoints**:
  - `GET /api/health` — Backend health check.
  - `POST /api/auth/register` — Create new trader account, persists to DB immediately.
  - `POST /api/auth/login` — Check registered credentials with error reporting.
  - `GET /api/auth/me` — Verify authenticated session.
  - `POST /api/auth/logout` — End session.
  - `GET /api/trades` — Retrieve stored trade history.
  - `POST /api/trades` — Save new trade record.
  - `PUT /api/trades/:id` — Update existing trade record.
  - `DELETE /api/trades/:id` — Remove trade record.
  - `PUT /api/user/profile` — Update risk parameters and capital.
  - Static File Server — Serves `index.html`, `login.html`, `styles.css`, etc.

### 2. 🛡️ Resilient Dual Storage Engine (`api-client.js`)
- **Automatic Server Detection**: When `server.js` is running, all registrations, logins, trades, and updates automatically persist to `data/db.json`.
- **Zero-Block Fallback**: If running without Node.js (via `file:///` or static hosts like Netlify/GitHub Pages), it falls back to the browser's persistent database so account creation, login validation, and trade logging **never fail or get blocked**!
- **Visual Status Pill**: Header displays whether connected to Server DB (🟢 Online) or Local Persistent DB (🔵 Active).

### 3. 👤 Authentication & Verification
- **Sign In**: Validates email and password against registered database. Displays clear error if account is not found or password is incorrect.
- **Create Account**:
  - Immediately registers and saves the account to both database and persistent storage.
  - Provides a 6-digit verification code with a 1-click **⚡ Auto-Fill & Continue** button.
  - Allows traders to continue smoothly without getting locked out.
- **Immediate Auth Guard**: Unauthenticated visitors on `index.html` are redirected to `login.html`.

### 4. 💰 Manual Realized Profit & Loss (P&L) Entry
- Quick **Profit (+)** (green) or **Loss (-)** (red) selector.
- Direct Net P&L amount entry with optional Entry/Exit price auto-calculation.
- Full support for options, futures, scalping, crypto, and equity trades.

---

## 🚀 How to Run Locally

### Option A: With Node.js Backend Server
1. Double-click **`start-server.bat`** (or open terminal and run `node server.js`).
2. Server starts at **`http://localhost:3000`** and opens automatically in your browser.
3. All accounts and trades are saved directly in `data/db.json`.

### Option B: Standalone / Offline
1. Double-click **`launch.bat`** or double-click **`index.html`**.
2. The journal runs immediately with built-in persistent storage.

---

## 🌐 How to Host Online (Public Access)

### Deploying to Render (Free Node.js Hosting)
1. Push this folder to a GitHub repository.
2. Go to [Render.com](https://render.com) and click **New Web Service**.
3. Connect your repository.
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install` (or leave empty)
   - **Start Command**: `node server.js`
5. Click **Deploy**. Your journal is now live with full backend and database!

### Deploying to Railway / Vercel / Netlify
- For **Railway**: New Project -> Deploy from GitHub repo -> Auto-detects `Procfile` and `server.js`.
- For **Netlify / Vercel Static**: Simply drag and drop the folder; the frontend will run seamlessly using the built-in storage engine.
