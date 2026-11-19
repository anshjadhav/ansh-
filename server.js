/**
 * Trading Journal Backend Server
 * Built with standard Node.js libraries (no external npm dependencies required).
 * Provides REST API for Authentication, Trade Logging, and User Profile.
 * Also acts as a static file server for local and cloud deployment.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// MIME types dictionary for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=UTF-8'
};

// =============================================================================
// DATABASE STORAGE ENGINE (LOCAL JSON + MONGODB ATLAS CLOUD)
// =============================================================================

let MongoClient = null;
try {
  MongoClient = require('mongodb').MongoClient;
} catch (e) {
  // mongodb module will be installed on Render automatically via package.json
}

const MONGODB_URI = process.env.MONGODB_URI || '';
let mongoClient = null;
let mongoDb = null;
let isMongoConnected = false;
let dbCache = null;

function ensureDbExists() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      accounts: [
        {
          email: 'ansh@trading.pro',
          password: 'password123',
          name: 'Ansh',
          fullName: 'Ansh Sharma',
          tradingStyle: 'Intraday Options & Futures',
          broker: 'Zerodha Kite',
          capital: 500000,
          isVerified: true,
          createdAt: new Date().toISOString()
        }
      ],
      trades: [],
      sessions: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function readLocalDbFile() {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading local database:', err);
    return { accounts: [], trades: [], sessions: {} };
  }
}

function writeLocalDbFile(data) {
  try {
    ensureDbExists();
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (err) {
    console.error('Error saving local database:', err);
    return false;
  }
}

async function initMongo() {
  if (!MONGODB_URI || !MongoClient) {
    console.log('  Database Mode:  Local JSON File (data/db.json)');
    return false;
  }
  try {
    console.log('  Connecting to MongoDB Atlas Cloud Database...');
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 6000
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db('trading_journal');
    isMongoConnected = true;
    console.log('  Database Mode:  MongoDB Atlas Cloud (Connected & Synced!)');

    // Sync from MongoDB Atlas on startup
    await syncFromMongo();
    return true;
  } catch (err) {
    console.error('Failed to connect to MongoDB Atlas, falling back to local file:', err.message);
    isMongoConnected = false;
    return false;
  }
}

async function syncFromMongo() {
  if (!isMongoConnected || !mongoDb) return;
  try {
    const col = mongoDb.collection('app_data');
    const doc = await col.findOne({ _id: 'main_store' });
    if (!doc) {
      // First time initialization: upload current local data to MongoDB
      const local = readLocalDbFile();
      await col.updateOne(
        { _id: 'main_store' },
        { $set: { _id: 'main_store', accounts: local.accounts, trades: local.trades, sessions: local.sessions, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      dbCache = local;
      console.log('  [MongoDB Atlas] Initialized remote cloud database with local data.');
    } else {
      dbCache = {
        accounts: doc.accounts || [],
        trades: doc.trades || [],
        sessions: doc.sessions || {}
      };
      writeLocalDbFile(dbCache);
      console.log(`  [MongoDB Atlas] Loaded ${dbCache.accounts.length} accounts, ${dbCache.trades.length} trades from Cloud.`);
    }
  } catch (err) {
    console.error('Error syncing from MongoDB:', err.message);
  }
}

function readDb() {
  if (dbCache) {
    return dbCache;
  }
  dbCache = readLocalDbFile();
  return dbCache;
}

function writeDb(data) {
  dbCache = data;
  writeLocalDbFile(data);

  if (isMongoConnected && mongoDb) {
    mongoDb.collection('app_data').updateOne(
      { _id: 'main_store' },
      { $set: { accounts: data.accounts, trades: data.trades, sessions: data.sessions, updatedAt: new Date().toISOString() } },
      { upsert: true }
    ).catch(err => {
      console.error('MongoDB Atlas background write failed:', err.message);
    });
  }
  return true;
}

// Generate secure session token
function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// =============================================================================
// REQUEST HELPER FUNCTIONS
// =============================================================================

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', err => reject(err));
  });
}

// =============================================================================
// STATIC FILE SERVING
// =============================================================================

function serveStaticFile(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Clean path to prevent traversal attacks
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  // If path has no extension and file exists as .html
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 Not Found
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    setCorsHeaders(res);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// =============================================================================
// HTTP SERVER & ROUTING
// =============================================================================

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // ---------------------------------------------------------------------------
  // API ROUTES
  // ---------------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Health check
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          service: 'Trading Journal Backend',
          time: new Date().toISOString(),
          version: '1.0.0'
        });
      }

      // 2. Auth: Register
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { email, password, fullName, tradingStyle, broker, capital } = body;

        if (!email || !password) {
          return sendJson(res, 400, {
            success: false,
            message: 'Email and password are required.'
          });
        }

        const db = readDb();
        const existing = db.accounts.find(a => a.email.toLowerCase() === email.trim().toLowerCase());
        if (existing) {
          return sendJson(res, 409, {
            success: false,
            message: 'An account with this email already exists! Please switch to Sign In.'
          });
        }

        const name = fullName ? fullName.trim().split(' ')[0] : email.split('@')[0];
        const newAccount = {
          id: 'acc_' + Date.now(),
          email: email.trim(),
          password: password,
          name: name,
          fullName: fullName ? fullName.trim() : name,
          tradingStyle: tradingStyle || 'Intraday Options & Futures',
          broker: broker || 'Zerodha Kite',
          capital: parseFloat(capital) || 500000,
          isVerified: true,
          createdAt: new Date().toISOString()
        };

        db.accounts.push(newAccount);

        // Generate session token
        const token = generateToken();
        db.sessions = db.sessions || {};
        db.sessions[token] = {
          email: newAccount.email,
          createdAt: new Date().toISOString()
        };

        writeDb(db);

        return sendJson(res, 201, {
          success: true,
          message: 'Account created successfully!',
          token: token,
          user: {
            isLoggedIn: true,
            isVerified: true,
            name: newAccount.name,
            fullName: newAccount.fullName,
            email: newAccount.email,
            avatar: (newAccount.name.substring(0, 2) || 'TR').toUpperCase(),
            role: 'PRO TRADER',
            tradingStyle: newAccount.tradingStyle,
            broker: newAccount.broker,
            maxDailyLoss: 10000,
            maxTradesPerDay: 4,
            rules: { stoploss: true, twoLosses: true, noFomo: true, journal: true }
          },
          capital: newAccount.capital
        });
      }

      // 3. Auth: Login
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { email, password } = body;

        if (!email || !password) {
          return sendJson(res, 400, {
            success: false,
            message: 'Please provide both email and password.'
          });
        }

        const db = readDb();
        const found = db.accounts.find(a => a.email.toLowerCase() === email.trim().toLowerCase());

        if (!found) {
          return sendJson(res, 404, {
            success: false,
            message: 'Account not found with this email! Please click "Create Account" to sign up first.'
          });
        }

        if (found.password !== password) {
          return sendJson(res, 401, {
            success: false,
            message: 'Incorrect password! Please check your password and try again.'
          });
        }

        const token = generateToken();
        db.sessions = db.sessions || {};
        db.sessions[token] = {
          email: found.email,
          createdAt: new Date().toISOString()
        };
        writeDb(db);

        return sendJson(res, 200, {
          success: true,
          message: 'Login successful!',
          token: token,
          user: {
            isLoggedIn: true,
            isVerified: true,
            name: found.name,
            fullName: found.fullName || found.name,
            email: found.email,
            avatar: (found.name.substring(0, 2) || 'TR').toUpperCase(),
            role: 'PRO TRADER',
            tradingStyle: found.tradingStyle || 'Intraday Options & Futures',
            broker: found.broker || 'Zerodha Kite',
            maxDailyLoss: found.maxDailyLoss || 10000,
            maxTradesPerDay: found.maxTradesPerDay || 4,
            rules: found.rules || { stoploss: true, twoLosses: true, noFomo: true, journal: true }
          },
          capital: found.capital || 500000
        });
      }

      // 4. Auth: Me / Verify Session
      if (pathname === '/api/auth/me' && method === 'GET') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();

        const db = readDb();
        const session = db.sessions ? db.sessions[token] : null;

        if (!session) {
          // If no token or invalid session, return 401
          return sendJson(res, 401, {
            success: false,
            message: 'Session expired or invalid.'
          });
        }

        const account = db.accounts.find(a => a.email.toLowerCase() === session.email.toLowerCase());
        if (!account) {
          return sendJson(res, 404, { success: false, message: 'User not found.' });
        }

        return sendJson(res, 200, {
          success: true,
          user: {
            isLoggedIn: true,
            isVerified: true,
            name: account.name,
            fullName: account.fullName || account.name,
            email: account.email,
            avatar: (account.name.substring(0, 2) || 'TR').toUpperCase(),
            role: 'PRO TRADER',
            tradingStyle: account.tradingStyle || 'Intraday Options & Futures',
            broker: account.broker || 'Zerodha Kite',
            maxDailyLoss: account.maxDailyLoss || 10000,
            maxTradesPerDay: account.maxTradesPerDay || 4,
            rules: account.rules || { stoploss: true, twoLosses: true, noFomo: true, journal: true }
          },
          capital: account.capital || 500000
        });
      }

      // 5. Auth: Logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const db = readDb();
        if (db.sessions && db.sessions[token]) {
          delete db.sessions[token];
          writeDb(db);
        }
        return sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
      }

      // 6. Trades: GET /api/trades
      if (pathname === '/api/trades' && method === 'GET') {
        const db = readDb();
        return sendJson(res, 200, {
          success: true,
          trades: Array.isArray(db.trades) ? db.trades : []
        });
      }

      // 7. Trades: POST /api/trades (Create Trade)
      if (pathname === '/api/trades' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body || !body.symbol) {
          return sendJson(res, 400, { success: false, message: 'Valid trade data required.' });
        }

        const db = readDb();
        const newTrade = {
          id: body.id || ('tr_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
          date: body.date,
          symbol: body.symbol,
          type: body.type || 'BUY',
          quantity: parseFloat(body.quantity) || 1,
          entryPrice: parseFloat(body.entryPrice) || 0,
          exitPrice: parseFloat(body.exitPrice) || 0,
          charges: parseFloat(body.charges) || 0,
          netPnl: parseFloat(body.netPnl) || 0,
          grossPnl: parseFloat(body.grossPnl) || 0,
          strategy: body.strategy || '',
          tag: body.tag || 'Disciplined Trade (Followed Rules)',
          notes: body.notes || '',
          createdAt: new Date().toISOString()
        };

        db.trades = Array.isArray(db.trades) ? db.trades : [];
        db.trades.push(newTrade);
        writeDb(db);

        return sendJson(res, 201, {
          success: true,
          message: 'Trade recorded successfully.',
          trade: newTrade
        });
      }

      // 8. Trades: PUT /api/trades/:id (Update Trade)
      if (pathname.startsWith('/api/trades/') && method === 'PUT') {
        const tradeId = pathname.replace('/api/trades/', '').trim();
        const body = await parseJsonBody(req);

        const db = readDb();
        db.trades = Array.isArray(db.trades) ? db.trades : [];
        const index = db.trades.findIndex(t => t.id === tradeId);

        if (index === -1) {
          return sendJson(res, 404, { success: false, message: 'Trade not found.' });
        }

        db.trades[index] = {
          ...db.trades[index],
          ...body,
          id: tradeId, // Prevent overwriting ID
          updatedAt: new Date().toISOString()
        };
        writeDb(db);

        return sendJson(res, 200, {
          success: true,
          message: 'Trade updated successfully.',
          trade: db.trades[index]
        });
      }

      // 9. Trades: DELETE /api/trades/:id (Delete Trade)
      if (pathname.startsWith('/api/trades/') && method === 'DELETE') {
        const tradeId = pathname.replace('/api/trades/', '').trim();

        const db = readDb();
        db.trades = Array.isArray(db.trades) ? db.trades : [];
        const initialLen = db.trades.length;
        db.trades = db.trades.filter(t => t.id !== tradeId);

        if (db.trades.length === initialLen) {
          return sendJson(res, 404, { success: false, message: 'Trade not found.' });
        }

        writeDb(db);
        return sendJson(res, 200, {
          success: true,
          message: 'Trade deleted successfully.',
          id: tradeId
        });
      }

      // 10. Trades: Bulk sync / replace
      if (pathname === '/api/trades/sync' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (Array.isArray(body.trades)) {
          const db = readDb();
          db.trades = body.trades;
          writeDb(db);
          return sendJson(res, 200, { success: true, count: db.trades.length });
        }
        return sendJson(res, 400, { success: false, message: 'Expected array of trades' });
      }

      // 11. User: GET & PUT /api/user/profile
      if (pathname === '/api/user/profile') {
        const db = readDb();
        if (method === 'GET') {
          return sendJson(res, 200, {
            success: true,
            accountsCount: db.accounts.length,
            tradesCount: db.trades.length
          });
        }
        if (method === 'PUT') {
          const body = await parseJsonBody(req);
          // If updating an account
          if (body.email) {
            const acc = db.accounts.find(a => a.email.toLowerCase() === body.email.toLowerCase());
            if (acc) {
              if (body.fullName) acc.fullName = body.fullName;
              if (body.name) acc.name = body.name;
              if (body.tradingStyle) acc.tradingStyle = body.tradingStyle;
              if (body.broker) acc.broker = body.broker;
              if (body.capital) acc.capital = parseFloat(body.capital);
              if (body.maxDailyLoss) acc.maxDailyLoss = parseFloat(body.maxDailyLoss);
              if (body.maxTradesPerDay) acc.maxTradesPerDay = parseInt(body.maxTradesPerDay);
              if (body.rules) acc.rules = body.rules;
              writeDb(db);
            }
          }
          return sendJson(res, 200, { success: true, message: 'Profile updated.' });
        }
      }

      // API 404
      return sendJson(res, 404, { success: false, message: `Endpoint not found: ${pathname}` });

    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { success: false, message: 'Internal Server Error: ' + err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // STATIC FILE SERVING
  // ---------------------------------------------------------------------------
  serveStaticFile(req, res, pathname);
});

// Start Server
ensureDbExists();
dbCache = readLocalDbFile();

initMongo().finally(() => {
  server.listen(PORT, () => {
    console.log('================================================================');
    console.log('  📈 TRADING JOURNAL BACKEND SERVER');
    console.log(`  Local URL:      http://localhost:${PORT}`);
    console.log(`  Database File:  ${DB_FILE}`);
    console.log(`  Cloud DB:       ${isMongoConnected ? 'MongoDB Atlas (Connected)' : 'Standby / Local fallback'}`);
    console.log('  Status:         Online & Ready');
    console.log('================================================================');
  });
});
