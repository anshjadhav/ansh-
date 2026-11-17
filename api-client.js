/**
 * Unified API Client & Persistent Storage Engine for Trading Journal
 * Handles automatic backend synchronization (REST API) with resilient
 * fallback to persistent client-side storage (LocalStorage).
 */

const ApiClient = (function() {
  const STORAGE_KEYS = {
    USER: 'trading_journal_user_v1',
    ACCOUNTS: 'trading_journal_accounts_v1',
    TRADES: 'trading_journal_trades_v1',
    CAPITAL: 'trading_journal_capital_v1',
    TOKEN: 'trading_journal_token_v1'
  };

  // Determine API Base URL
  let baseUrl = 'http://localhost:3000';
  if (window.location.protocol.startsWith('http')) {
    baseUrl = window.location.origin;
  }

  let isBackendOnline = false;
  let hasCheckedHealth = false;

  // Initialize and check backend health
  async function checkHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${baseUrl}/api/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        isBackendOnline = true;
      } else {
        isBackendOnline = false;
      }
    } catch (e) {
      isBackendOnline = false;
    }
    hasCheckedHealth = true;
    updateBackendStatusBadge();
    return isBackendOnline;
  }

  function updateBackendStatusBadge() {
    const badge = document.getElementById('backend-status-badge');
    if (!badge) return;

    if (isBackendOnline) {
      badge.innerHTML = '<span class="status-dot online"></span> Backend DB: Connected';
      badge.className = 'backend-badge online';
      badge.title = 'Connected to Node.js backend server. Data is stored in data/db.json';
    } else {
      badge.innerHTML = '<span class="status-dot offline"></span> Storage: Local Persistent DB';
      badge.className = 'backend-badge offline';
      badge.title = 'Running in standalone offline mode. Data is stored persistently in browser database.';
    }
  }

  function getLocalAccounts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (!raw) {
        // Initial master seed account
        const defaultAccounts = [
          {
            email: 'ansh@trading.pro',
            password: 'password123',
            name: 'Ansh',
            fullName: 'Ansh Sharma',
            tradingStyle: 'Intraday Options & Futures',
            broker: 'Zerodha Kite',
            capital: 500000,
            isVerified: true,
            createdAt: '2026-10-01T00:00:00.000Z'
          }
        ];
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(defaultAccounts));
        return defaultAccounts;
      }
      return JSON.parse(raw) || [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalAccount(account) {
    const accounts = getLocalAccounts();
    const idx = accounts.findIndex(a => a.email.toLowerCase() === account.email.toLowerCase());
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], ...account };
    } else {
      accounts.push(account);
    }
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  }

  function getAuthHeader() {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // Auto check on load
  checkHealth();

  return {
    STORAGE_KEYS,
    isOnline: () => isBackendOnline,
    checkHealth,

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    async register(data) {
      const email = data.email.trim();
      const password = data.password;
      const fullName = data.fullName ? data.fullName.trim() : '';
      const name = fullName ? fullName.split(' ')[0] : email.split('@')[0];
      const tradingStyle = data.tradingStyle || 'Intraday Options & Futures';
      const broker = data.broker || 'Zerodha Kite';
      const capital = parseFloat(data.capital) || 500000;

      const newAccount = {
        id: 'acc_' + Date.now(),
        email: email,
        password: password,
        name: name,
        fullName: fullName || name,
        tradingStyle: tradingStyle,
        broker: broker,
        capital: capital,
        isVerified: true,
        createdAt: new Date().toISOString()
      };

      const userObj = {
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
      };

      // 1. ALWAYS write to local storage first so account is NEVER lost
      saveLocalAccount(newAccount);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userObj));
      localStorage.setItem(STORAGE_KEYS.CAPITAL, capital.toString());

      // 2. If backend is online, also persist to server database
      if (isBackendOnline) {
        try {
          const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email, password, fullName, tradingStyle, broker, capital
            })
          });
          const json = await res.json();
          if (json.token) {
            localStorage.setItem(STORAGE_KEYS.TOKEN, json.token);
          }
          return { success: true, user: json.user || userObj, capital: json.capital || capital, isBackend: true };
        } catch (e) {
          console.warn('Backend register failed, relying on local storage:', e);
        }
      }

      return { success: true, user: userObj, capital: capital, isBackend: false };
    },

    async login(email, password) {
      const cleanEmail = (email || '').trim();

      // Check backend first if online
      if (isBackendOnline) {
        try {
          const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password: password })
          });
          const json = await res.json();

          if (!res.ok || !json.success) {
            return {
              success: false,
              message: json.message || 'Invalid email or password.'
            };
          }

          if (json.token) {
            localStorage.setItem(STORAGE_KEYS.TOKEN, json.token);
          }
          if (json.user) {
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(json.user));
          }
          if (json.capital) {
            localStorage.setItem(STORAGE_KEYS.CAPITAL, json.capital.toString());
          }

          return { success: true, user: json.user, capital: json.capital, isBackend: true };
        } catch (e) {
          console.warn('Backend login error, attempting local database:', e);
        }
      }

      // Local database fallback
      const accounts = getLocalAccounts();
      const found = accounts.find(a => a.email.toLowerCase() === cleanEmail.toLowerCase());

      if (!found) {
        return {
          success: false,
          message: `Account not found with email "${cleanEmail}"! Please click "Create Account" above to sign up first.`
        };
      }

      if (found.password !== password) {
        return {
          success: false,
          message: 'Incorrect password! Please check your password and try again.'
        };
      }

      const userObj = {
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
      };

      const capital = found.capital || 500000;
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userObj));
      localStorage.setItem(STORAGE_KEYS.CAPITAL, capital.toString());

      return { success: true, user: userObj, capital: capital, isBackend: false };
    },

    getCurrentUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.USER);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    logout() {
      if (isBackendOnline) {
        fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }
        }).catch(() => {});
      }
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    },

    // =========================================================================
    // TRADES CRUD
    // =========================================================================

    async getTrades() {
      if (isBackendOnline) {
        try {
          const res = await fetch(`${baseUrl}/api/trades`, {
            headers: { ...getAuthHeader() }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.trades)) {
              localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(data.trades));
              return data.trades;
            }
          }
        } catch (e) {
          console.warn('Backend getTrades error, using local storage:', e);
        }
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TRADES);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    async saveTrade(trade) {
      // 1. Update local storage
      let localTrades = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TRADES);
        localTrades = raw ? JSON.parse(raw) : [];
      } catch(e) {}

      const existingIdx = localTrades.findIndex(t => t.id === trade.id);
      if (existingIdx !== -1) {
        localTrades[existingIdx] = { ...localTrades[existingIdx], ...trade };
      } else {
        localTrades.unshift(trade);
      }
      localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(localTrades));

      // 2. Sync with backend if online
      if (isBackendOnline) {
        try {
          if (existingIdx !== -1) {
            await fetch(`${baseUrl}/api/trades/${trade.id}`, {
              method: 'PUT',
              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify(trade)
            });
          } else {
            await fetch(`${baseUrl}/api/trades`, {
              method: 'POST',
              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify(trade)
            });
          }
        } catch (e) {
          console.warn('Backend save trade error:', e);
        }
      }

      return trade;
    },

    async deleteTrade(tradeId) {
      // 1. Update local storage
      let localTrades = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TRADES);
        localTrades = raw ? JSON.parse(raw) : [];
      } catch(e) {}

      localTrades = localTrades.filter(t => t.id !== tradeId);
      localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(localTrades));

      // 2. Sync with backend if online
      if (isBackendOnline) {
        try {
          await fetch(`${baseUrl}/api/trades/${tradeId}`, {
            method: 'DELETE',
            headers: { ...getAuthHeader() }
          });
        } catch (e) {
          console.warn('Backend delete trade error:', e);
        }
      }

      return true;
    },

    async saveAllTrades(trades) {
      localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
      if (isBackendOnline) {
        try {
          await fetch(`${baseUrl}/api/trades/sync`, {
            method: 'POST',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ trades: trades })
          });
        } catch (e) {}
      }
    },

    async saveProfile(user, capital) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      if (capital !== undefined) {
        localStorage.setItem(STORAGE_KEYS.CAPITAL, capital.toString());
      }

      // Also update in accounts list
      const accounts = getLocalAccounts();
      const idx = accounts.findIndex(a => a.email.toLowerCase() === user.email.toLowerCase());
      if (idx !== -1) {
        accounts[idx] = {
          ...accounts[idx],
          name: user.name,
          fullName: user.fullName,
          tradingStyle: user.tradingStyle,
          broker: user.broker,
          capital: capital || accounts[idx].capital,
          rules: user.rules,
          maxDailyLoss: user.maxDailyLoss,
          maxTradesPerDay: user.maxTradesPerDay
        };
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
      }

      if (isBackendOnline) {
        try {
          await fetch(`${baseUrl}/api/user/profile`, {
            method: 'PUT',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              fullName: user.fullName,
              tradingStyle: user.tradingStyle,
              broker: user.broker,
              capital: capital,
              rules: user.rules,
              maxDailyLoss: user.maxDailyLoss,
              maxTradesPerDay: user.maxTradesPerDay
            })
          });
        } catch (e) {}
      }
    }
  };
})();

// Attach to window
window.ApiClient = ApiClient;
