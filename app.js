/**
 * Personal Trading Journal Web Application
 * Core JavaScript logic:
 * - State & LocalStorage persistence
 * - User Profile & Account Authentication (Login/Register)
 * - Interactive Calendar with dynamic P&L indicators
 * - Daily trade logs CRUD with live P&L computation
 * - Risk management & discipline rules
 * - CSV & JSON export/import
 * - Canvas Equity Curve Chart
 */

// =============================================================================
// 1. STATE & STORAGE MANAGEMENT
// =============================================================================

const STORAGE_KEYS = {
  TRADES: 'trading_journal_trades_v1',
  CAPITAL: 'trading_journal_capital_v1',
  CURRENCY: 'trading_journal_currency_v1',
  USER: 'trading_journal_user_v1'
};

const DEFAULT_CAPITAL = 500000; // ₹5,00,000 default starting capital
const DEFAULT_CURRENCY = '₹';

const DEFAULT_USER = {
  isLoggedIn: false,
  isVerified: false,
  name: '',
  fullName: '',
  email: '',
  avatar: 'TR',
  role: 'PRO TRADER',
  tradingStyle: 'Intraday Options & Futures',
  broker: 'Zerodha Kite',
  maxDailyLoss: 10000,
  maxTradesPerDay: 4,
  rules: {
    stoploss: true,
    twoLosses: true,
    noFomo: true,
    journal: true
  }
};

// Helper: Get local Today's date in YYYY-MM-DD format
function getTodayIsoString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const initialTodayIso = getTodayIsoString();
const initialTodayDate = new Date();

// Application state (Defaults to TODAY dynamically)
const state = {
  initialCapital: DEFAULT_CAPITAL,
  currency: DEFAULT_CURRENCY,
  user: { ...DEFAULT_USER },
  trades: [],
  selectedDate: initialTodayIso,                   // By default today's date
  currentCalMonth: initialTodayDate.getMonth(),     // Current Month (0-indexed)
  currentCalYear: initialTodayDate.getFullYear(),   // Current Year
  activeView: 'calendar',                          // 'calendar' | 'all-trades'
  editingTradeId: null,
  authMode: 'login',                               // 'login' | 'register'
  allTradesFilter: {
    search: '',
    type: 'ALL',
    outcome: 'ALL'
  }
};

// Initial trades array starts completely empty
const SAMPLE_TRADES = [];

// Load data from LocalStorage
function initStorage() {
  const savedTrades = localStorage.getItem(STORAGE_KEYS.TRADES);
  const savedCapital = localStorage.getItem(STORAGE_KEYS.CAPITAL);
  const savedCurrency = localStorage.getItem(STORAGE_KEYS.CURRENCY);
  const savedUser = localStorage.getItem(STORAGE_KEYS.USER);

  if (savedTrades) {
    try {
      const parsed = JSON.parse(savedTrades);
      // Clean out any legacy sample trades from earlier sessions
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id && parsed[0].id.startsWith('tr_20261008_')) {
        state.trades = [];
        saveTrades();
      } else {
        state.trades = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error('Failed to parse stored trades:', e);
      state.trades = [];
    }
  } else {
    // Start completely empty as requested
    state.trades = [];
    saveTrades();
  }

  if (savedCapital) {
    state.initialCapital = parseFloat(savedCapital) || DEFAULT_CAPITAL;
  }

  if (savedCurrency) {
    state.currency = savedCurrency;
  }

  if (savedUser) {
    try {
      state.user = { ...DEFAULT_USER, ...JSON.parse(savedUser) };
    } catch (e) {
      state.user = { ...DEFAULT_USER, isLoggedIn: false };
    }
  } else {
    state.user = { ...DEFAULT_USER, isLoggedIn: false };
  }

  // Force redirect to login if user is not authenticated
  if (!state.user || !state.user.isLoggedIn) {
    window.location.replace('login.html');
    return;
  }

  // Auto-sync with Backend REST API if online
  if (window.ApiClient && typeof window.ApiClient.getTrades === 'function') {
    window.ApiClient.getTrades().then(backendTrades => {
      if (Array.isArray(backendTrades) && backendTrades.length > 0) {
        state.trades = backendTrades;
        refreshAllViews();
      }
    }).catch(() => {});
  }
}

function saveTrades() {
  localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(state.trades));
  if (window.ApiClient && typeof window.ApiClient.saveAllTrades === 'function') {
    window.ApiClient.saveAllTrades(state.trades);
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.CAPITAL, state.initialCapital.toString());
  localStorage.setItem(STORAGE_KEYS.CURRENCY, state.currency);
  if (window.ApiClient && typeof window.ApiClient.saveProfile === 'function') {
    window.ApiClient.saveProfile(state.user, state.initialCapital);
  }
}

function saveUser() {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(state.user));
  if (window.ApiClient && typeof window.ApiClient.saveProfile === 'function') {
    window.ApiClient.saveProfile(state.user, state.initialCapital);
  }
}

// =============================================================================
// 2. USER PROFILE & AUTHENTICATION HANDLING
// =============================================================================

function updateHeaderUserUI() {
  const user = state.user;
  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl = document.getElementById('header-user-name');
  const roleEl = document.getElementById('header-user-role');
  
  const dropAvatar = document.getElementById('dropdown-user-avatar');
  const dropName = document.getElementById('dropdown-user-name');
  const dropEmail = document.getElementById('dropdown-user-email');
  const authLabel = document.getElementById('menu-auth-label');

  if (user.isLoggedIn) {
    const initials = user.avatar || (user.name ? user.name.substring(0, 2).toUpperCase() : 'AS');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = user.name || 'Trader';
    if (roleEl) roleEl.textContent = user.role || 'PRO TRADER';

    if (dropAvatar) dropAvatar.textContent = initials;
    if (dropName) dropName.textContent = user.fullName || user.name || 'Trader';
    if (dropEmail) dropEmail.textContent = user.email || 'trader@journal.pro';
    if (authLabel) authLabel.textContent = 'Sign Out / Switch User';
  } else {
    if (avatarEl) avatarEl.textContent = '??';
    if (nameEl) nameEl.textContent = 'Guest';
    if (roleEl) roleEl.textContent = 'SIGN IN';

    if (dropAvatar) dropAvatar.textContent = '??';
    if (dropName) dropName.textContent = 'Guest User';
    if (dropEmail) dropEmail.textContent = 'Click to sign in';
    if (authLabel) authLabel.textContent = 'Sign In / Register';
  }
}

function toggleProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown) dropdown.classList.toggle('active');
}

function closeProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown) dropdown.classList.remove('active');
}

// Profile Modal Handling
function openProfileModal(initialTab = 'profile-info') {
  closeProfileDropdown();
  const modal = document.getElementById('modal-profile');
  if (!modal) return;

  const user = state.user;
  const avatarEl = document.getElementById('profile-hero-avatar');
  const dispName = document.getElementById('profile-display-name');
  const dispEmail = document.getElementById('profile-display-email');

  const inputName = document.getElementById('profile-input-name');
  const inputEmail = document.getElementById('profile-input-email');
  const inputStyle = document.getElementById('profile-input-style');
  const inputBroker = document.getElementById('profile-input-broker');
  const inputLoss = document.getElementById('profile-risk-loss');
  const inputTrades = document.getElementById('profile-risk-trades');
  const capitalInput = document.getElementById('setting-starting-capital');
  const currencySelect = document.getElementById('setting-currency');

  const initials = user.avatar || (user.name ? user.name.substring(0, 2).toUpperCase() : 'AS');
  if (avatarEl) avatarEl.textContent = initials;
  if (dispName) dispName.textContent = user.fullName || user.name || 'Trader';
  if (dispEmail) dispEmail.textContent = user.email || 'trader@journal.pro';

  if (inputName) inputName.value = user.fullName || user.name || '';
  if (inputEmail) inputEmail.value = user.email || '';
  if (inputStyle) inputStyle.value = user.tradingStyle || 'Intraday Options & Futures';
  if (inputBroker) inputBroker.value = user.broker || 'Zerodha Kite';
  if (inputLoss) inputLoss.value = user.maxDailyLoss || 10000;
  if (inputTrades) inputTrades.value = user.maxTradesPerDay || 4;

  const verifiedBadge = document.getElementById('profile-email-verified-badge');
  if (verifiedBadge) {
    if (user.isVerified) {
      verifiedBadge.textContent = '✓ Verified';
      verifiedBadge.style.color = '#22c55e';
      verifiedBadge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
      verifiedBadge.style.background = 'rgba(34, 197, 94, 0.12)';
    } else {
      verifiedBadge.textContent = 'Unverified';
      verifiedBadge.style.color = '#f59e0b';
      verifiedBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      verifiedBadge.style.background = 'rgba(245, 158, 11, 0.12)';
    }
  }

  if (capitalInput) capitalInput.value = state.initialCapital;
  if (currencySelect) currencySelect.value = state.currency;

  // Rules checkboxes
  if (user.rules) {
    document.getElementById('rule-stoploss').checked = !!user.rules.stoploss;
    document.getElementById('rule-two-losses').checked = !!user.rules.twoLosses;
    document.getElementById('rule-no-fomo').checked = !!user.rules.noFomo;
    document.getElementById('rule-journal').checked = !!user.rules.journal;
  }

  // Switch to selected subtab
  switchProfileSubTab(initialTab);

  modal.classList.add('active');
}

function closeProfileModal() {
  const modal = document.getElementById('modal-profile');
  if (modal) modal.classList.remove('active');
}

function switchProfileSubTab(tabName) {
  // Update buttons
  document.querySelectorAll('.profile-sub-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-subtab') === tabName);
  });

  // Update panels
  const tabs = ['profile-info', 'profile-rules', 'profile-capital', 'profile-data'];
  tabs.forEach(t => {
    const el = document.getElementById(`subtab-${t}`);
    if (el) el.style.display = t === tabName ? 'block' : 'none';
  });
}

function saveProfileAndSettings() {
  const inputName = document.getElementById('profile-input-name').value.trim();
  const inputEmail = document.getElementById('profile-input-email').value.trim();
  const inputStyle = document.getElementById('profile-input-style').value;
  const inputBroker = document.getElementById('profile-input-broker').value;
  const inputLoss = parseFloat(document.getElementById('profile-risk-loss').value) || 10000;
  const inputTrades = parseInt(document.getElementById('profile-risk-trades').value, 10) || 4;

  const capitalInput = document.getElementById('setting-starting-capital');
  const currencySelect = document.getElementById('setting-currency');

  const newCapital = parseFloat(capitalInput.value);
  if (!isNaN(newCapital) && newCapital >= 0) {
    state.initialCapital = newCapital;
  }
  state.currency = currencySelect.value;
  saveSettings();

  // Update User object
  const shortName = inputName ? inputName.split(' ')[0] : 'Trader';
  const initials = inputName
    ? inputName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'TR';

  state.user = {
    ...state.user,
    name: shortName,
    fullName: inputName || 'Trader',
    email: inputEmail || 'trader@journal.pro',
    avatar: initials,
    tradingStyle: inputStyle,
    broker: inputBroker,
    maxDailyLoss: inputLoss,
    maxTradesPerDay: inputTrades,
    rules: {
      stoploss: document.getElementById('rule-stoploss').checked,
      twoLosses: document.getElementById('rule-two-losses').checked,
      noFomo: document.getElementById('rule-no-fomo').checked,
      journal: document.getElementById('rule-journal').checked
    }
  };

  saveUser();
  updateHeaderUserUI();
  closeProfileModal();
  refreshAllViews();
  showToast('Trader profile and preferences saved successfully', 'success');
}

// Auth / Login Modal Handling (Redirects to full dedicated login with OTP)
function openAuthModal(mode = 'login') {
  closeProfileDropdown();
  window.location.href = `login.html?mode=${mode === 'register' ? 'signup' : 'login'}`;
}

function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.classList.remove('active');
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-input-email').value.trim();
  const name = document.getElementById('auth-input-name').value.trim();

  if (state.authMode === 'register') {
    // Redirect to login.html with signup mode for complete email verification
    closeAuthModal();
    window.location.href = 'login.html?mode=signup';
    return;
  }

  let displayName = 'Ansh';
  let fullName = 'Ansh Sharma';

  if (state.authMode === 'register' && name) {
    fullName = name;
    displayName = name.split(' ')[0];
  } else if (email) {
    displayName = email.split('@')[0];
    fullName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  }

  const initials = displayName.substring(0, 2).toUpperCase();

  state.user = {
    ...state.user,
    isLoggedIn: true,
    name: displayName,
    fullName: fullName,
    email: email || 'trader@journal.pro',
    avatar: initials
  };

  saveUser();
  updateHeaderUserUI();
  closeAuthModal();
  showToast(`Welcome back, ${displayName}!`, 'success');
}

function handleSignOut() {
  closeProfileDropdown();
  if (state.user.isLoggedIn) {
    const confirmLogout = window.confirm('Do you want to switch or sign out of your trader profile?');
    if (!confirmLogout) return;
    if (window.ApiClient && typeof window.ApiClient.logout === 'function') {
      window.ApiClient.logout();
    }
    state.user.isLoggedIn = false;
    saveUser();
    updateHeaderUserUI();
    showToast('Signed out successfully.', 'info');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 400);
  } else {
    window.location.href = 'login.html';
  }
}

// =============================================================================
// 3. FORMATTING HELPERS
// =============================================================================

function formatCurrency(amount, includeSign = false) {
  const curr = state.currency || '₹';
  const absAmount = Math.abs(amount);
  
  // Format with standard locale separators
  let formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (curr === '$' || curr === '€' || curr === '£') {
    formatted = absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  if (includeSign) {
    if (amount > 0) return `+${curr}${formatted}`;
    if (amount < 0) return `-${curr}${formatted}`;
    return `${curr}${formatted}`;
  }

  return `${curr}${formatted}`;
}

function formatCompactNumber(amount) {
  const curr = state.currency || '₹';
  const abs = Math.abs(amount);
  const sign = amount > 0 ? '+' : (amount < 0 ? '-' : '');
  
  if (abs >= 100000) {
    return `${sign}${curr}${(abs / 100000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `${sign}${curr}${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}${curr}${abs.toFixed(0)}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const d = new Date(year, month, day);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }); // e.g. "Thu, 08 Oct 2026"
}

function toDateKey(year, monthIndex, day) {
  const y = year;
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// =============================================================================
// 4. P&L & STATS CALCULATIONS
// =============================================================================

function calculateTradeNetPnl(type, entry, exit, quantity, charges = 0) {
  const ent = parseFloat(entry) || 0;
  const ext = parseFloat(exit) || 0;
  const qty = parseFloat(quantity) || 0;
  const chg = parseFloat(charges) || 0;

  let gross = 0;
  if (type === 'BUY') {
    gross = (ext - ent) * qty;
  } else if (type === 'SELL') {
    gross = (ent - ext) * qty;
  }
  
  const net = gross - chg;
  return { gross, net, charges: chg };
}

function computeMetrics() {
  let totalNetPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalCharges = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let longWins = 0;
  let longTotal = 0;
  let shortWins = 0;
  let shortTotal = 0;
  let bestTrade = -Infinity;
  let worstTrade = Infinity;

  const totalTrades = state.trades.length;

  state.trades.forEach(t => {
    const pnl = t.netPnl;
    totalNetPnl += pnl;
    totalCharges += (t.charges || 0);

    if (pnl > 0) {
      winningTrades++;
      grossProfit += pnl;
      if (t.type === 'BUY') longWins++;
      if (t.type === 'SELL') shortWins++;
    } else if (pnl < 0) {
      losingTrades++;
      grossLoss += Math.abs(pnl);
    } else {
      breakevenTrades++;
    }

    if (t.type === 'BUY') longTotal++;
    if (t.type === 'SELL') shortTotal++;

    if (pnl > bestTrade) bestTrade = pnl;
    if (pnl < worstTrade) worstTrade = pnl;
  });

  const totalBalance = state.initialCapital + totalNetPnl;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '∞' : '0.00');
  const avgTrade = totalTrades > 0 ? totalNetPnl / totalTrades : 0;
  const roiTotal = state.initialCapital > 0 ? (totalNetPnl / state.initialCapital) * 100 : 0;
  const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;

  return {
    totalCapital: totalBalance,
    totalNetPnl,
    roiTotal,
    grossProfit,
    grossLoss,
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate,
    profitFactor,
    totalCharges,
    avgTrade,
    bestTrade: totalTrades > 0 ? bestTrade : 0,
    worstTrade: totalTrades > 0 ? worstTrade : 0,
    avgWin,
    avgLoss,
    longWinRate: longTotal > 0 ? (longWins / longTotal) * 100 : 0,
    shortWinRate: shortTotal > 0 ? (shortWins / shortTotal) * 100 : 0
  };
}

// Group trades by date 'YYYY-MM-DD'
function getTradesByDateMap() {
  const map = new Map();
  state.trades.forEach(trade => {
    if (!map.has(trade.date)) {
      map.set(trade.date, []);
    }
    map.get(trade.date).push(trade);
  });
  return map;
}

// =============================================================================
// 5. UI UPDATE & RENDERING
// =============================================================================

function updateDashboardMetrics() {
  const metrics = computeMetrics();

  // 1. Total Capital / Balance
  const totalBalanceEl = document.getElementById('metric-total-balance');
  const startingBalanceEl = document.getElementById('metric-starting-balance');
  if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(metrics.totalCapital);
  if (startingBalanceEl) startingBalanceEl.textContent = formatCurrency(state.initialCapital);

  // 2. Total Net P&L
  const netPnlEl = document.getElementById('metric-net-pnl');
  const pnlRoiEl = document.getElementById('metric-pnl-roi');
  const cardPnl = document.getElementById('card-metric-pnl');
  const bubblePnl = document.getElementById('icon-bubble-pnl');
  const grossWinEl = document.getElementById('metric-gross-profit');
  const grossLossEl = document.getElementById('metric-gross-loss');

  if (netPnlEl) {
    netPnlEl.textContent = formatCurrency(metrics.totalNetPnl, true);
    netPnlEl.className = `metric-value ${metrics.totalNetPnl >= 0 ? 'profit' : 'loss'}`;
  }

  if (pnlRoiEl) {
    const sign = metrics.roiTotal > 0 ? '+' : '';
    pnlRoiEl.textContent = `${sign}${metrics.roiTotal.toFixed(1)}%`;
    pnlRoiEl.className = `metric-pill ${metrics.roiTotal >= 0 ? 'profit' : 'loss'}`;
  }

  if (cardPnl) {
    cardPnl.className = `metric-card ${metrics.totalNetPnl >= 0 ? 'accent-green' : 'accent-red'}`;
  }

  if (bubblePnl) {
    bubblePnl.className = `metric-icon-bubble ${metrics.totalNetPnl >= 0 ? 'green' : 'red'}`;
  }

  if (grossWinEl) grossWinEl.textContent = formatCurrency(metrics.grossProfit);
  if (grossLossEl) grossLossEl.textContent = formatCurrency(metrics.grossLoss);

  // 3. Win Rate
  const winRateEl = document.getElementById('metric-win-rate');
  const winLossRatioEl = document.getElementById('metric-win-loss-ratio');
  const winrateBarEl = document.getElementById('metric-winrate-bar');
  const breakevenCountEl = document.getElementById('metric-breakeven-count');

  if (winRateEl) winRateEl.textContent = `${metrics.winRate.toFixed(1)}%`;
  if (winLossRatioEl) winLossRatioEl.textContent = `${metrics.winningTrades}W / ${metrics.losingTrades}L`;
  if (winrateBarEl) winrateBarEl.style.width = `${Math.min(100, Math.max(0, metrics.winRate))}%`;
  if (breakevenCountEl) breakevenCountEl.textContent = `${metrics.breakevenTrades} Breakeven`;

  // 4. Trades & Efficiency
  const totalTradesEl = document.getElementById('metric-total-trades');
  const avgTradeEl = document.getElementById('metric-avg-trade');
  const profitFactorEl = document.getElementById('metric-profit-factor');
  const totalChargesEl = document.getElementById('metric-total-charges');
  const countBadge = document.getElementById('all-trades-count-badge');

  if (totalTradesEl) totalTradesEl.textContent = metrics.totalTrades;
  if (avgTradeEl) avgTradeEl.textContent = `Avg: ${formatCurrency(metrics.avgTrade, true)}`;
  if (profitFactorEl) profitFactorEl.textContent = metrics.profitFactor;
  if (totalChargesEl) totalChargesEl.textContent = formatCurrency(metrics.totalCharges);
  if (countBadge) countBadge.textContent = metrics.totalTrades;
}

// Render the 7x6 Calendar Grid
function renderCalendar() {
  const year = state.currentCalYear;
  const month = state.currentCalMonth;
  const gridEl = document.getElementById('calendar-days-grid');
  if (!gridEl) return;

  gridEl.innerHTML = '';

  // Update Month/Year dropdown selectors
  const monthSelect = document.getElementById('cal-month-select');
  const yearSelect = document.getElementById('cal-year-select');
  if (monthSelect) monthSelect.value = month;
  if (yearSelect) yearSelect.value = year;

  // Calendar calculations
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const tradesMap = getTradesByDateMap();

  // Real-world Today
  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Statistics for this month
  let monthPnl = 0;
  let monthTradingDays = 0;
  let monthWinDays = 0;
  let monthTradesCount = 0;

  // 1. Prev month empty/filler cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    const prevDayNum = daysInPrevMonth - firstDayOfWeek + i + 1;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell empty';
    cell.innerHTML = `
      <div class="cell-top-row">
        <span class="cell-day-num" style="color: var(--text-muted); opacity: 0.5;">${prevDayNum}</span>
      </div>
    `;
    gridEl.appendChild(cell);
  }

  // 2. Active month cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = toDateKey(year, month, day);
    const dayTrades = tradesMap.get(dateKey) || [];
    const hasTrades = dayTrades.length > 0;

    let dayNetPnl = 0;
    if (hasTrades) {
      dayNetPnl = dayTrades.reduce((acc, t) => acc + t.netPnl, 0);
      monthPnl += dayNetPnl;
      monthTradingDays++;
      monthTradesCount += dayTrades.length;
      if (dayNetPnl > 0) monthWinDays++;
    }

    const cell = document.createElement('div');
    let cellClasses = ['calendar-cell'];

    if (dateKey === state.selectedDate) {
      cellClasses.push('selected');
    }
    if (dateKey === todayKey) {
      cellClasses.push('today');
    }

    if (hasTrades) {
      if (dayNetPnl > 0) {
        cellClasses.push('profit-day');
      } else if (dayNetPnl < 0) {
        cellClasses.push('loss-day');
      } else {
        cellClasses.push('breakeven-day');
      }
    }

    cell.className = cellClasses.join(' ');
    cell.setAttribute('data-date', dateKey);
    cell.setAttribute('title', hasTrades 
      ? `${dateKey}: ${dayTrades.length} trade(s), Net: ${formatCurrency(dayNetPnl, true)}`
      : `${dateKey}: No trades logged`);

    // Top row: Day number + trade count pill
    let topRowHtml = `
      <div class="cell-top-row">
        <span class="cell-day-num">${day}</span>
        ${hasTrades ? `<span class="cell-trade-count">${dayTrades.length}</span>` : ''}
      </div>
    `;

    // Bottom content: Compact P&L text or dot indicator
    let indicatorHtml = '';
    if (hasTrades) {
      const compactPnl = formatCompactNumber(dayNetPnl);
      indicatorHtml = `
        <div class="cell-pnl-text">${compactPnl}</div>
        <div class="cell-indicator-dot"></div>
      `;
    }

    cell.innerHTML = `${topRowHtml}${indicatorHtml}`;

    // Click handler to select date
    cell.addEventListener('click', () => {
      selectDate(dateKey);
    });

    gridEl.appendChild(cell);
  }

  // 3. Post month trailing cells to round out the grid
  const totalCellsRendered = firstDayOfWeek + daysInMonth;
  const trailingCells = (7 - (totalCellsRendered % 7)) % 7;
  for (let i = 1; i <= trailingCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell empty';
    cell.innerHTML = `
      <div class="cell-top-row">
        <span class="cell-day-num" style="color: var(--text-muted); opacity: 0.5;">${i}</span>
      </div>
    `;
    gridEl.appendChild(cell);
  }

  // Update Month stats bar
  const monthPnlEl = document.getElementById('cal-month-pnl');
  const monthDaysEl = document.getElementById('cal-month-days');
  const monthWinDaysEl = document.getElementById('cal-month-win-days');
  const monthTradesEl = document.getElementById('cal-month-trades-count');

  if (monthPnlEl) {
    monthPnlEl.textContent = formatCurrency(monthPnl, true);
    monthPnlEl.className = `month-stat-value ${monthPnl >= 0 ? 'profit' : 'loss'}`;
  }
  if (monthDaysEl) monthDaysEl.textContent = monthTradingDays;
  if (monthWinDaysEl) {
    const winRate = monthTradingDays > 0 ? ((monthWinDays / monthTradingDays) * 100).toFixed(0) : '0';
    monthWinDaysEl.textContent = `${winRate}%`;
  }
  if (monthTradesEl) monthTradesEl.textContent = monthTradesCount;
}

// Select a specific date and display its trades
function selectDate(dateKey) {
  state.selectedDate = dateKey;

  // Make sure calendar is showing the selected date's month and year
  const parts = dateKey.split('-');
  const selYear = parseInt(parts[0], 10);
  const selMonth = parseInt(parts[1], 10) - 1;

  if (state.currentCalYear !== selYear || state.currentCalMonth !== selMonth) {
    state.currentCalYear = selYear;
    state.currentCalMonth = selMonth;
  }

  renderCalendar();
  renderDailyTrades();

  // Sync quick jump date input
  const jumpInput = document.getElementById('cal-jump-input');
  if (jumpInput) jumpInput.value = dateKey;
}

// Render trade logs for the currently selected date
function renderDailyTrades() {
  const selectedDate = state.selectedDate;
  const headingEl = document.getElementById('selected-date-heading');
  const countPill = document.getElementById('pill-selected-count');
  const pnlPill = document.getElementById('pill-selected-pnl');
  const winratePill = document.getElementById('pill-selected-winrate');
  const tbody = document.getElementById('daily-trades-tbody');
  const emptyState = document.getElementById('daily-empty-state');
  const table = document.getElementById('daily-trade-table');

  if (headingEl) {
    headingEl.textContent = `Trades for ${formatDateDisplay(selectedDate)}`;
  }

  // Fetch all trades for this date
  const dayTrades = state.trades.filter(t => t.date === selectedDate);

  let dayPnl = 0;
  let dayWins = 0;
  dayTrades.forEach(t => {
    dayPnl += t.netPnl;
    if (t.netPnl > 0) dayWins++;
  });

  const dayWinRate = dayTrades.length > 0 ? ((dayWins / dayTrades.length) * 100).toFixed(0) : 0;

  if (countPill) countPill.textContent = `${dayTrades.length} Trade${dayTrades.length === 1 ? '' : 's'}`;
  
  if (pnlPill) {
    pnlPill.textContent = `Day Net: ${formatCurrency(dayPnl, true)}`;
    pnlPill.className = `metric-pill ${dayTrades.length === 0 ? 'neutral' : (dayPnl >= 0 ? 'profit' : 'loss')}`;
  }

  if (winratePill) {
    winratePill.textContent = `Win Rate: ${dayWinRate}%`;
  }

  if (!tbody) return;

  if (dayTrades.length === 0) {
    tbody.innerHTML = '';
    if (table) table.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'flex';
      const emptyTitle = document.getElementById('empty-state-title-text');
      if (emptyTitle) emptyTitle.textContent = `No trades logged for ${selectedDate}`;
    }
    return;
  }

  if (table) table.style.display = 'table';
  if (emptyState) emptyState.style.display = 'none';

  tbody.innerHTML = '';

  dayTrades.forEach(trade => {
    const tr = document.createElement('tr');
    const isProfit = trade.netPnl >= 0;
    const isBuy = trade.type === 'BUY';

    tr.innerHTML = `
      <td>
        <div class="symbol-badge-container">
          <span class="symbol-name">${escapeHtml(trade.symbol)}</span>
          <span class="symbol-subtext">${trade.strategy ? escapeHtml(trade.strategy) : 'No strategy tag'}</span>
        </div>
      </td>
      <td>
        <span class="badge ${isBuy ? 'badge-buy' : 'badge-sell'}">
          ${trade.type}
        </span>
      </td>
      <td><strong>${trade.quantity || '-'}</strong></td>
      <td>${trade.entryPrice > 0 ? formatCurrency(trade.entryPrice) : '-'}</td>
      <td>${trade.exitPrice > 0 ? formatCurrency(trade.exitPrice) : '-'}</td>
      <td>
        <div class="table-pnl ${isProfit ? 'profit' : 'loss'}">
          ${formatCurrency(trade.netPnl, true)}
        </div>
        ${trade.charges > 0 ? `<div style="font-size: 0.7rem; color: var(--text-muted);">Charges: ${formatCurrency(trade.charges)}</div>` : ''}
      </td>
      <td style="max-width: 220px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${trade.tags ? `<span class="badge badge-tag ${trade.tags.toLowerCase().includes('mistake') || trade.tags.toLowerCase().includes('fomo') || trade.tags.toLowerCase().includes('revenge') ? 'mistake' : ''}" style="width: fit-content;">${escapeHtml(trade.tags)}</span>` : ''}
          ${trade.notes ? `<span style="font-size: 0.775rem; color: var(--text-secondary); line-height: 1.25;" title="${escapeHtml(trade.notes)}">${escapeHtml(trade.notes)}</span>` : '<span style="font-size: 0.75rem; color: var(--text-muted);">-</span>'}
        </div>
      </td>
      <td style="text-align: right;">
        <div class="table-actions" style="justify-content: flex-end;">
          <button class="btn-table-action btn-edit-trade" data-id="${trade.id}" title="Edit Trade">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="btn-table-action delete btn-delete-trade" data-id="${trade.id}" title="Delete Trade">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach action buttons
  tbody.querySelectorAll('.btn-edit-trade').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditTradeModal(btn.getAttribute('data-id'));
    });
  });

  tbody.querySelectorAll('.btn-delete-trade').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTrade(btn.getAttribute('data-id'));
    });
  });
}

// Render all trades in the Journal History table with filtering
function renderAllTrades() {
  const tbody = document.getElementById('all-trades-tbody');
  const emptyState = document.getElementById('all-trades-empty-state');
  if (!tbody) return;

  const filter = state.allTradesFilter;
  let filtered = [...state.trades];

  // 1. Text Search (symbol, strategy, notes)
  if (filter.search.trim()) {
    const q = filter.search.toLowerCase().trim();
    filtered = filtered.filter(t => 
      t.symbol.toLowerCase().includes(q) ||
      (t.strategy && t.strategy.toLowerCase().includes(q)) ||
      (t.notes && t.notes.toLowerCase().includes(q)) ||
      (t.tags && t.tags.toLowerCase().includes(q)) ||
      t.date.includes(q)
    );
  }

  // 2. Type filter
  if (filter.type !== 'ALL') {
    filtered = filtered.filter(t => t.type === filter.type);
  }

  // 3. Outcome filter
  if (filter.outcome === 'WIN') {
    filtered = filtered.filter(t => t.netPnl > 0);
  } else if (filter.outcome === 'LOSS') {
    filtered = filtered.filter(t => t.netPnl < 0);
  }

  // Sort by date descending (newest first)
  filtered.sort((a, b) => (b.date > a.date ? 1 : (b.date < a.date ? -1 : (b.createdAt > a.createdAt ? 1 : -1))));

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  tbody.innerHTML = '';

  filtered.forEach(trade => {
    const tr = document.createElement('tr');
    const isProfit = trade.netPnl >= 0;
    const isBuy = trade.type === 'BUY';

    tr.innerHTML = `
      <td style="white-space: nowrap;">
        <span style="font-weight: 600; color: var(--text-main);">${trade.date}</span>
      </td>
      <td>
        <div class="symbol-badge-container">
          <span class="symbol-name">${escapeHtml(trade.symbol)}</span>
          <span class="symbol-subtext">${trade.strategy ? escapeHtml(trade.strategy) : ''}</span>
        </div>
      </td>
      <td>
        <span class="badge ${isBuy ? 'badge-buy' : 'badge-sell'}">${trade.type}</span>
      </td>
      <td><strong>${trade.quantity || '-'}</strong></td>
      <td>${trade.entryPrice > 0 ? formatCurrency(trade.entryPrice) : '-'}</td>
      <td>${trade.exitPrice > 0 ? formatCurrency(trade.exitPrice) : '-'}</td>
      <td>${formatCurrency(trade.charges || 0)}</td>
      <td>
        <div class="table-pnl ${isProfit ? 'profit' : 'loss'}">
          ${formatCurrency(trade.netPnl, true)}
        </div>
      </td>
      <td style="max-width: 250px;">
        <div style="display: flex; flex-direction: column; gap: 3px;">
          ${trade.tags ? `<span class="badge badge-tag ${trade.tags.toLowerCase().includes('mistake') || trade.tags.toLowerCase().includes('fomo') ? 'mistake' : ''}" style="width: fit-content;">${escapeHtml(trade.tags)}</span>` : ''}
          ${trade.notes ? `<span style="font-size: 0.775rem; color: var(--text-secondary); line-height: 1.2;" title="${escapeHtml(trade.notes)}">${escapeHtml(trade.notes)}</span>` : '-'}
        </div>
      </td>
      <td style="text-align: right;">
        <div class="table-actions" style="justify-content: flex-end;">
          <button class="btn-table-action btn-edit-all" data-id="${trade.id}" title="Edit Trade">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="btn-table-action delete btn-delete-all" data-id="${trade.id}" title="Delete Trade">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-edit-all').forEach(btn => {
    btn.addEventListener('click', () => openEditTradeModal(btn.getAttribute('data-id')));
  });

  tbody.querySelectorAll('.btn-delete-all').forEach(btn => {
    btn.addEventListener('click', () => deleteTrade(btn.getAttribute('data-id')));
  });
}

function refreshAllViews() {
  updateDashboardMetrics();
  updateHeaderUserUI();
  renderCalendar();
  renderDailyTrades();
  if (state.activeView === 'all-trades') {
    renderAllTrades();
  }
}

// =============================================================================
// 6. TRADE CRUD OPERATIONS & MODAL HANDLING
// =============================================================================

function openAddTradeModal(dateOverride = null) {
  state.editingTradeId = null;
  const modal = document.getElementById('modal-trade');
  const modalTitle = document.getElementById('modal-title-text');
  const form = document.getElementById('trade-form');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('form-trade-id').value = '';
  document.getElementById('form-date').value = dateOverride || state.selectedDate;
  document.getElementById('form-symbol').value = '';
  document.getElementById('form-quantity').value = '';
  document.getElementById('form-entry-price').value = '';
  document.getElementById('form-exit-price').value = '';
  document.getElementById('form-charges').value = '';
  document.getElementById('form-strategy').value = '';
  document.getElementById('form-tags').selectedIndex = 0;
  document.getElementById('form-notes').value = '';
  
  // Reset manual P&L control to blank
  document.getElementById('form-manual-pnl-amount').value = '';
  setManualPnlType('PROFIT');
  const currencySymEl = document.getElementById('manual-pnl-currency-sym');
  if (currencySymEl) currencySymEl.textContent = state.currency || '₹';
  const calcHint = document.getElementById('manual-pnl-calculated-net');
  if (calcHint) calcHint.textContent = '';

  // Default type BUY
  setTradeTypeToggle('BUY');

  if (modalTitle) modalTitle.textContent = 'Add New Trade';

  modal.classList.add('active');
  setTimeout(() => document.getElementById('form-symbol').focus(), 100);
}

function openEditTradeModal(tradeId) {
  const trade = state.trades.find(t => t.id === tradeId);
  if (!trade) {
    showToast('Trade not found', 'error');
    return;
  }

  state.editingTradeId = tradeId;
  const modal = document.getElementById('modal-trade');
  const modalTitle = document.getElementById('modal-title-text');

  document.getElementById('form-trade-id').value = trade.id;
  document.getElementById('form-date').value = trade.date;
  document.getElementById('form-symbol').value = trade.symbol;
  document.getElementById('form-quantity').value = trade.quantity || '';
  document.getElementById('form-entry-price').value = trade.entryPrice || '';
  document.getElementById('form-exit-price').value = trade.exitPrice || '';
  document.getElementById('form-charges').value = trade.charges !== undefined ? trade.charges : '';
  document.getElementById('form-strategy').value = trade.strategy || '';
  document.getElementById('form-tags').value = trade.tags || 'Disciplined Trade';
  document.getElementById('form-notes').value = trade.notes || '';

  // Populate manual P&L from existing trade
  const isProfit = trade.netPnl >= 0;
  setManualPnlType(isProfit ? 'PROFIT' : 'LOSS');
  document.getElementById('form-manual-pnl-amount').value = Math.abs(trade.netPnl);
  const currencySymEl = document.getElementById('manual-pnl-currency-sym');
  if (currencySymEl) currencySymEl.textContent = state.currency || '₹';
  const calcHint = document.getElementById('manual-pnl-calculated-net');
  if (calcHint) calcHint.textContent = '';

  setTradeTypeToggle(trade.type);
  if (modalTitle) modalTitle.textContent = `Edit Trade: ${trade.symbol}`;

  modal.classList.add('active');
}

function closeTradeModal() {
  const modal = document.getElementById('modal-trade');
  if (modal) modal.classList.remove('active');
  state.editingTradeId = null;
}

function setTradeTypeToggle(type) {
  const buyBtn = document.getElementById('toggle-type-buy');
  const sellBtn = document.getElementById('toggle-type-sell');
  const hiddenInput = document.getElementById('form-trade-type');

  if (type === 'BUY') {
    buyBtn?.classList.add('active');
    sellBtn?.classList.remove('active');
    if (hiddenInput) hiddenInput.value = 'BUY';
  } else {
    sellBtn?.classList.add('active');
    buyBtn?.classList.remove('active');
    if (hiddenInput) hiddenInput.value = 'SELL';
  }

  autoSyncPricesToManualPnl();
}

// Manual Profit/Loss Toggle Handler
function setManualPnlType(type = 'PROFIT') {
  const normType = type === 'LOSS' ? 'LOSS' : 'PROFIT';
  const typeInput = document.getElementById('form-manual-pnl-type');
  const btnProfit = document.getElementById('toggle-manual-profit');
  const btnLoss = document.getElementById('toggle-manual-loss');
  const card = document.getElementById('manual-pnl-card');
  const badge = document.getElementById('manual-pnl-badge');
  const amountInput = document.getElementById('form-manual-pnl-amount');

  if (typeInput) typeInput.value = normType;

  if (btnProfit) btnProfit.classList.toggle('active', normType === 'PROFIT');
  if (btnLoss) btnLoss.classList.toggle('active', normType === 'LOSS');

  if (card) {
    card.classList.toggle('profit-mode', normType === 'PROFIT');
    card.classList.toggle('loss-mode', normType === 'LOSS');
  }

  if (badge) {
    badge.className = `manual-pnl-badge ${normType === 'PROFIT' ? 'profit' : 'loss'}`;
    badge.textContent = normType === 'PROFIT' ? 'PROFIT TRADE' : 'LOSS TRADE';
  }

  if (amountInput) {
    amountInput.classList.toggle('profit', normType === 'PROFIT');
    amountInput.classList.toggle('loss', normType === 'LOSS');
  }
}

// Auto-sync entry/exit prices to manual P&L field if provided
function autoSyncPricesToManualPnl() {
  const type = document.getElementById('form-trade-type')?.value || 'BUY';
  const entry = parseFloat(document.getElementById('form-entry-price')?.value) || 0;
  const exit = parseFloat(document.getElementById('form-exit-price')?.value) || 0;
  const qty = parseFloat(document.getElementById('form-quantity')?.value) || 0;
  const charges = parseFloat(document.getElementById('form-charges')?.value) || 0;
  const calcHint = document.getElementById('manual-pnl-calculated-net');

  if (entry > 0 && exit > 0 && qty > 0) {
    const { net } = calculateTradeNetPnl(type, entry, exit, qty, charges);
    const amountInput = document.getElementById('form-manual-pnl-amount');
    
    // Automatically set the manual P&L type and amount
    setManualPnlType(net >= 0 ? 'PROFIT' : 'LOSS');
    if (amountInput) {
      amountInput.value = Math.abs(net).toFixed(2);
    }
    if (calcHint) {
      calcHint.textContent = `Auto-calc: ${formatCurrency(net, true)}`;
    }
  } else {
    if (calcHint) {
      calcHint.textContent = '';
    }
  }
}

// Handle Form Submission (Add or Update with Manual P&L)
function handleTradeFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('form-trade-id').value;
  const date = document.getElementById('form-date').value;
  const symbol = document.getElementById('form-symbol').value.trim();
  const type = document.getElementById('form-trade-type').value;
  const quantity = parseFloat(document.getElementById('form-quantity').value) || 1;
  const entryPrice = parseFloat(document.getElementById('form-entry-price').value) || 0;
  const exitPrice = parseFloat(document.getElementById('form-exit-price').value) || 0;
  const charges = parseFloat(document.getElementById('form-charges').value) || 0;
  const strategy = document.getElementById('form-strategy').value.trim();
  const tags = document.getElementById('form-tags').value;
  const notes = document.getElementById('form-notes').value.trim();

  // Read Manual Realized P&L
  const manualAmountRaw = document.getElementById('form-manual-pnl-amount')?.value;
  const manualPnlType = document.getElementById('form-manual-pnl-type')?.value || 'PROFIT';
  const manualAmount = parseFloat(manualAmountRaw);

  if (!date || !symbol) {
    showToast('Please enter Trade Date and Symbol / Instrument', 'error');
    return;
  }

  if (isNaN(manualAmount)) {
    showToast('Please enter your realized Profit or Loss amount', 'error');
    document.getElementById('form-manual-pnl-amount')?.focus();
    return;
  }

  const netPnl = manualPnlType === 'LOSS' ? -Math.abs(manualAmount) : Math.abs(manualAmount);

  if (id) {
    // Update existing trade
    const idx = state.trades.findIndex(t => t.id === id);
    if (idx !== -1) {
      state.trades[idx] = {
        ...state.trades[idx],
        date,
        symbol,
        type,
        quantity,
        entryPrice,
        exitPrice,
        charges,
        netPnl,
        strategy,
        tags,
        notes
      };
      showToast(`Updated trade for ${symbol} (${formatCurrency(netPnl, true)})`, 'success');
    }
  } else {
    // Create new trade
    const newTrade = {
      id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date,
      symbol,
      type,
      quantity,
      entryPrice,
      exitPrice,
      charges,
      netPnl,
      strategy,
      tags,
      notes,
      createdAt: new Date().toISOString()
    };
    state.trades.unshift(newTrade);
    showToast(`Added trade: ${symbol} (${formatCurrency(netPnl, true)})`, 'success');
  }

  saveTrades();
  closeTradeModal();

  // If user added trade for another date, update selection to that date so they see it immediately
  if (state.selectedDate !== date) {
    state.selectedDate = date;
    const parts = date.split('-');
    state.currentCalYear = parseInt(parts[0], 10);
    state.currentCalMonth = parseInt(parts[1], 10) - 1;
  }

  refreshAllViews();
}

function deleteTrade(tradeId) {
  const trade = state.trades.find(t => t.id === tradeId);
  if (!trade) return;

  const confirmed = window.confirm(`Are you sure you want to delete trade "${trade.symbol}" on ${trade.date}?`);
  if (!confirmed) return;

  state.trades = state.trades.filter(t => t.id !== tradeId);
  saveTrades();
  refreshAllViews();
  showToast(`Deleted trade: ${trade.symbol}`, 'info');
}

// =============================================================================
// 7. EXPORT & IMPORT DATA (CSV & JSON)
// =============================================================================

// Export all trade logs as CSV
function exportJournalToCSV() {
  if (state.trades.length === 0) {
    showToast('No trades to export', 'error');
    return;
  }

  const headers = [
    'Trade ID',
    'Date (YYYY-MM-DD)',
    'Symbol / Instrument',
    'Trade Type',
    'Quantity',
    'Entry Price',
    'Exit Price',
    'Charges',
    'Net P&L',
    'Strategy',
    'Discipline Tag',
    'Notes',
    'Timestamp'
  ];

  const rows = state.trades.map(t => [
    t.id,
    t.date,
    `"${(t.symbol || '').replace(/"/g, '""')}"`,
    t.type,
    t.quantity,
    t.entryPrice,
    t.exitPrice,
    t.charges || 0,
    t.netPnl,
    `"${(t.strategy || '').replace(/"/g, '""')}"`,
    `"${(t.tags || '').replace(/"/g, '""')}"`,
    `"${(t.notes || '').replace(/"/g, '""')}"`,
    t.createdAt || ''
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  const filename = `Trading_Journal_Export_${state.selectedDate || 'all'}.csv`;
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Exported ${state.trades.length} trades to CSV`, 'success');
}

// Export backup as JSON
function exportJournalToJSON() {
  const exportPayload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    user: state.user,
    initialCapital: state.initialCapital,
    currency: state.currency,
    trades: state.trades
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Trading_Journal_Backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('Journal backup downloaded (JSON)', 'success');
}

// Import JSON file
function handleJSONFileImport(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        state.trades = data;
      } else if (data.trades && Array.isArray(data.trades)) {
        state.trades = data.trades;
        if (data.initialCapital) state.initialCapital = data.initialCapital;
        if (data.currency) state.currency = data.currency;
        if (data.user) state.user = { ...DEFAULT_USER, ...data.user };
      } else {
        throw new Error('Invalid JSON format');
      }

      saveTrades();
      saveSettings();
      saveUser();
      refreshAllViews();
      closeProfileModal();
      showToast(`Imported ${state.trades.length} trades successfully`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error importing file: Invalid format', 'error');
    }
  };
  reader.readAsText(file);
}

// Clear all trades
function clearAllTrades() {
  const confirmed = window.confirm('Are you sure you want to delete ALL trades? This action cannot be undone.');
  if (!confirmed) return;

  state.trades = [];
  saveTrades();
  refreshAllViews();
  closeProfileModal();
  showToast('All trade entries cleared', 'info');
}

// =============================================================================
// 8. EQUITY CURVE CANVAS CHART & ANALYTICS
// =============================================================================

function openAnalyticsModal() {
  const modal = document.getElementById('modal-analytics');
  if (modal) modal.classList.add('active');

  const metrics = computeMetrics();
  
  const bestEl = document.getElementById('stat-best-trade');
  const worstEl = document.getElementById('stat-worst-trade');
  const avgWinEl = document.getElementById('stat-avg-win');
  const avgLossEl = document.getElementById('stat-avg-loss');
  const longWinEl = document.getElementById('stat-long-win');
  const shortWinEl = document.getElementById('stat-short-win');

  if (bestEl) bestEl.textContent = formatCurrency(metrics.bestTrade, true);
  if (worstEl) worstEl.textContent = formatCurrency(metrics.worstTrade, true);
  if (avgWinEl) avgWinEl.textContent = formatCurrency(metrics.avgWin);
  if (avgLossEl) avgLossEl.textContent = formatCurrency(metrics.avgLoss);
  if (longWinEl) longWinEl.textContent = `${metrics.longWinRate.toFixed(1)}%`;
  if (shortWinEl) shortWinEl.textContent = `${metrics.shortWinRate.toFixed(1)}%`;

  setTimeout(drawEquityCurveChart, 50);
}

function closeAnalyticsModal() {
  const modal = document.getElementById('modal-analytics');
  if (modal) modal.classList.remove('active');
}

// Draw HTML5 Canvas Smooth Equity Curve
function drawEquityCurveChart() {
  const canvas = document.getElementById('equity-chart-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Compute trade-by-trade balance trajectory
  const sorted = [...state.trades].sort((a, b) => (a.date > b.date ? 1 : (a.date < b.date ? -1 : (a.createdAt > b.createdAt ? 1 : -1))));

  let running = state.initialCapital;
  const balancePoints = [running];
  sorted.forEach(t => {
    running += t.netPnl;
    balancePoints.push(running);
  });

  if (balancePoints.length < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Log trades to generate interactive Equity Curve', w / 2, h / 2);
    return;
  }

  const minVal = Math.min(...balancePoints);
  const maxVal = Math.max(...balancePoints);
  const range = (maxVal - minVal) || 1;

  const padTop = 30;
  const padBottom = 35;
  const padLeft = 60;
  const padRight = 30;

  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padTop + (plotH / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    const val = maxVal - (range / gridSteps) * i;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatCompactNumber(val), padLeft - 8, y + 3);
  }

  // Calculate coordinates
  const pts = balancePoints.map((val, idx) => {
    const x = padLeft + (idx / (balancePoints.length - 1)) * plotW;
    const y = padTop + plotH - ((val - minVal) / range) * plotH;
    return { x, y, val };
  });

  // Gradient area fill
  const isOverallProfitable = balancePoints[balancePoints.length - 1] >= state.initialCapital;
  const lineCol = isOverallProfitable ? '#22c55e' : '#ef4444';
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
  grad.addColorStop(0, isOverallProfitable ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, padTop + plotH);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.lineTo(pts[pts.length - 1].x, padTop + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Curve stroke
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots on each trade point
  pts.forEach((pt, i) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, i === pts.length - 1 || i === 0 ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = lineCol;
    ctx.stroke();
  });

  // Baseline initial capital dashed line
  const baseNorm = (state.initialCapital - minVal) / range;
  if (baseNorm >= 0 && baseNorm <= 1) {
    const baseY = padTop + plotH - baseNorm * plotH;
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.moveTo(padLeft, baseY);
    ctx.lineTo(w - padRight, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#60a5fa';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Start: ' + formatCompactNumber(state.initialCapital), w - padRight - 70, baseY - 4);
  }
}

// =============================================================================
// 9. TOAST NOTIFICATIONS & UTILITIES
// =============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// 10. EVENT LISTENERS INITIALIZATION
// =============================================================================

function setupEventListeners() {
  // Navigation / Tabs
  const tabCal = document.getElementById('tab-calendar-view');
  const tabAll = document.getElementById('tab-all-trades-view');
  const viewCal = document.getElementById('calendar-view-container');
  const viewAll = document.getElementById('all-trades-view-container');

  if (tabCal && tabAll) {
    tabCal.addEventListener('click', () => {
      tabCal.classList.add('active');
      tabAll.classList.remove('active');
      viewCal.style.display = 'grid';
      viewAll.style.display = 'none';
      state.activeView = 'calendar';
      renderCalendar();
      renderDailyTrades();
    });

    tabAll.addEventListener('click', () => {
      tabAll.classList.add('active');
      tabCal.classList.remove('active');
      viewCal.style.display = 'none';
      viewAll.style.display = 'block';
      state.activeView = 'all-trades';
      renderAllTrades();
    });
  }

  // Profile Header & Dropdown
  document.getElementById('btn-user-profile-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleProfileDropdown();
  });

  document.getElementById('menu-item-profile')?.addEventListener('click', () => openProfileModal('profile-info'));
  document.getElementById('menu-item-rules')?.addEventListener('click', () => openProfileModal('profile-rules'));
  document.getElementById('menu-item-capital')?.addEventListener('click', () => openProfileModal('profile-capital'));
  document.getElementById('menu-item-analytics')?.addEventListener('click', () => {
    closeProfileDropdown();
    openAnalyticsModal();
  });
  document.getElementById('menu-item-auth')?.addEventListener('click', handleSignOut);

  // Profile Modal Sub-tabs
  document.querySelectorAll('.profile-sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSubTab = btn.getAttribute('data-subtab');
      switchProfileSubTab(targetSubTab);
    });
  });

  document.getElementById('modal-profile-close')?.addEventListener('click', closeProfileModal);
  document.getElementById('modal-profile-cancel')?.addEventListener('click', closeProfileModal);
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfileAndSettings);

  // Quick edit capital button on the capital card
  document.getElementById('btn-quick-edit-capital')?.addEventListener('click', () => {
    openProfileModal('profile-capital');
  });

  // Capital Preset chips
  document.querySelectorAll('.chip-btn[data-capital]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('setting-starting-capital').value = chip.getAttribute('data-capital');
    });
  });

  // Auth / Login Modal
  document.getElementById('btn-auth-mode-login')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-auth-mode-register')?.addEventListener('click', () => openAuthModal('register'));
  document.getElementById('modal-auth-close')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-form')?.addEventListener('submit', handleAuthSubmit);
  document.getElementById('auth-forgot-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Reset password link sent to your registered email', 'info');
  });

  // Calendar Controls
  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    state.currentCalMonth--;
    if (state.currentCalMonth < 0) {
      state.currentCalMonth = 11;
      state.currentCalYear--;
    }
    renderCalendar();
  });

  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    state.currentCalMonth++;
    if (state.currentCalMonth > 11) {
      state.currentCalMonth = 0;
      state.currentCalYear++;
    }
    renderCalendar();
  });

  document.getElementById('cal-month-select')?.addEventListener('change', (e) => {
    state.currentCalMonth = parseInt(e.target.value, 10);
    renderCalendar();
  });

  document.getElementById('cal-year-select')?.addEventListener('change', (e) => {
    state.currentCalYear = parseInt(e.target.value, 10);
    renderCalendar();
  });

  // Calendar Jump Input
  document.getElementById('btn-quick-jump-go')?.addEventListener('click', () => {
    const val = document.getElementById('cal-jump-input').value;
    if (val) selectDate(val);
  });

  // Calendar Today button
  document.getElementById('btn-cal-today')?.addEventListener('click', () => {
    const now = new Date();
    const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
    selectDate(todayKey);
  });

  // Add Trade Triggers
  document.getElementById('btn-add-trade-top')?.addEventListener('click', () => openAddTradeModal());
  document.getElementById('btn-add-trade-day')?.addEventListener('click', () => openAddTradeModal(state.selectedDate));
  document.getElementById('btn-empty-add-trade')?.addEventListener('click', () => openAddTradeModal(state.selectedDate));

  // Modal Trade Form
  document.getElementById('modal-trade-close')?.addEventListener('click', closeTradeModal);
  document.getElementById('modal-trade-cancel')?.addEventListener('click', closeTradeModal);
  document.getElementById('trade-form')?.addEventListener('submit', handleTradeFormSubmit);

  // Trade Type Toggle
  document.getElementById('toggle-type-buy')?.addEventListener('click', () => setTradeTypeToggle('BUY'));
  document.getElementById('toggle-type-sell')?.addEventListener('click', () => setTradeTypeToggle('SELL'));

  // Manual P&L Outcome Toggle (Profit vs Loss)
  document.getElementById('toggle-manual-profit')?.addEventListener('click', () => setManualPnlType('PROFIT'));
  document.getElementById('toggle-manual-loss')?.addEventListener('click', () => setManualPnlType('LOSS'));

  // Auto-sync prices to manual P&L if entered
  ['form-entry-price', 'form-exit-price', 'form-quantity', 'form-charges'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', autoSyncPricesToManualPnl);
      el.addEventListener('keyup', autoSyncPricesToManualPnl);
      el.addEventListener('change', autoSyncPricesToManualPnl);
    }
  });

  // Quick symbol chip clicks (fills symbol only, leaves prices empty)
  document.querySelectorAll('.chip-btn[data-symbol]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('form-symbol').value = chip.getAttribute('data-symbol');
    });
  });

  // CSV Export
  document.getElementById('btn-export-csv')?.addEventListener('click', exportJournalToCSV);

  // JSON Export & Import
  document.getElementById('btn-export-json')?.addEventListener('click', exportJournalToJSON);
  const importTrigger = document.getElementById('btn-import-json-trigger');
  const importInput = document.getElementById('input-import-json');
  if (importTrigger && importInput) {
    importTrigger.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleJSONFileImport(e.target.files[0]);
      }
    });
  }

  // Clear All Trades
  document.getElementById('btn-clear-all-trades')?.addEventListener('click', clearAllTrades);

  // Analytics Modal
  document.getElementById('btn-open-analytics')?.addEventListener('click', openAnalyticsModal);
  document.getElementById('modal-analytics-close')?.addEventListener('click', closeAnalyticsModal);
  document.getElementById('modal-analytics-close-btn')?.addEventListener('click', closeAnalyticsModal);

  // All Trades Filters
  const searchInput = document.getElementById('filter-search-input');
  const typeFilter = document.getElementById('filter-type-select');
  const outcomeFilter = document.getElementById('filter-outcome-select');
  const resetFiltersBtn = document.getElementById('btn-clear-filters');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.allTradesFilter.search = e.target.value;
      renderAllTrades();
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      state.allTradesFilter.type = e.target.value;
      renderAllTrades();
    });
  }

  if (outcomeFilter) {
    outcomeFilter.addEventListener('change', (e) => {
      state.allTradesFilter.outcome = e.target.value;
      renderAllTrades();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      state.allTradesFilter = { search: '', type: 'ALL', outcome: 'ALL' };
      if (searchInput) searchInput.value = '';
      if (typeFilter) typeFilter.value = 'ALL';
      if (outcomeFilter) outcomeFilter.value = 'ALL';
      renderAllTrades();
    });
  }

  // Close modals on clicking backdrop & close dropdown on clicking outside
  document.addEventListener('click', (e) => {
    const profileWrap = document.querySelector('.user-profile-menu-container');
    if (profileWrap && !profileWrap.contains(e.target)) {
      closeProfileDropdown();
    }
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Resize listener for Canvas Chart
  window.addEventListener('resize', () => {
    if (document.getElementById('modal-analytics')?.classList.contains('active')) {
      drawEquityCurveChart();
    }
  });
}

// Populate Year dropdown from 2020 to 2032
function initYearSelector() {
  const yearSelect = document.getElementById('cal-year-select');
  if (!yearSelect) return;
  yearSelect.innerHTML = '';
  for (let y = 2020; y <= 2032; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === state.currentCalYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
}

// Application Startup
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  initYearSelector();
  setupEventListeners();

  // Set quick jump input to initial selected date
  const jumpInput = document.getElementById('cal-jump-input');
  if (jumpInput) jumpInput.value = state.selectedDate;

  refreshAllViews();
});
