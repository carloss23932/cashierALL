const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { fork } = require("child_process");
const { scrypt, randomBytes } = require("crypto");
const { promisify } = require("util");
const iconv = require("iconv-lite");
const express = require("express");
const cors = require("cors");

try {
  const envPath = path.join(__dirname, '..', '.env');
  require('dotenv').config({ path: envPath });
} catch (e) {
  console.warn('dotenv could not be loaded; continuing with process environment only:', e?.message || e);
}

// تعطيل الكاش الخاص بـ GPU لتجنب أخطاء بدء التشغيل الشائعة
app.commandLine.appendSwitch('disable-gpu-cache');
app.disableHardwareAcceleration();

// Consider the app packaged status as well — packaged builds should not try to load the Vite dev server.
const isDev = (process.env.NODE_ENV !== "production") && !app.isPackaged;
const FIXED_USER_DATA_DIR_NAME = "مركز الجمجمة";
const defaultUserDataPath = app.getPath("userData");

if (!isDev) {
  try {
    const fixedUserDataPath = path.join(app.getPath("appData"), FIXED_USER_DATA_DIR_NAME);
    app.setPath("userData", fixedUserDataPath);
  } catch (e) {
    console.warn("Failed to set fixed userData path:", e);
  }
}

// Ensure DATABASE_URL is set correctly for both dev and prod
const userDataPath = app.getPath("userData");
const dbPath = isDev
  ? path.join(__dirname, "..", "prisma", "dev.db")
  : path.join(userDataPath, "dev.db");

process.env.DATABASE_URL = `file:${dbPath}`;
const ALLOW_STARTUP_DB_SOURCE_SWITCH = String(process.env.ALLOW_STARTUP_DB_SOURCE_SWITCH || "false").toLowerCase() === "true";

// Keep a reference to the server process
// let serverProcess; // Unused: Express server is disabled

const scryptAsync = promisify(scrypt);

let prismaInstance = null;
let prismaInitPromise = null;
let activeUserId = null;
let mainWindow = null;

const DEVELOPER_LOGIN = {
  username: "developer",
  password: "dev123",
  user: {
    id: null,
    username: "developer",
    name: "Developer",
    role: "admin",
    localOnly: true
  }
};

function isDeveloperLogin(username, password) {
  return (
    String(username || "").trim() === DEVELOPER_LOGIN.username &&
    String(password || "") === DEVELOPER_LOGIN.password
  );
}

// --- HTTP Server for AI Chat ---
const aiApp = express();
aiApp.use(cors());
aiApp.use(express.json());

aiApp.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, userRole } = req.body;
    
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (message === 'get-context') {
      // Return context data without calling AI
      const result = await handleAiChat({ message: 'dummy', userRole });
      return res.json({ context: result.context });
    }

    // Call the IPC handler to get AI response
    const result = await handleAiChat({ message, userRole });
    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }
    res.json({ response: result.response });
  } catch (error) {
    console.error('AI Chat API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const aiServer = aiApp.listen(3001, () => {
  console.log('AI Chat server listening on port 3001');
});

// --- Network State ---
let networkState = {
  isOnline: true,
  lastOnlineCheck: Date.now(),
  connectionCheckInterval: null,
  checkInFlight: false
};

function initNetworkMonitoring() {
  console.log('[NETWORK] 🔧 تفعيل مراقبة الاتصال بالإنترنت');
  
  // بدء فحص دوري للاتصال كل 5 ثوان
  if (networkState.connectionCheckInterval) {
    clearInterval(networkState.connectionCheckInterval);
  }
  
  const broadcastNetworkStatus = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('network-status-changed', {
        isOnline: networkState.isOnline,
        lastCheck: networkState.lastOnlineCheck
      });
    }
  };
  
  const checkConnectivity = async () => {
    if (networkState.checkInFlight) return;

    networkState.checkInFlight = true;
    try {
      await fetchWithTimeout('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        cache: 'no-store'
      }, 3000);
      const wasOffline = !networkState.isOnline;
      networkState.isOnline = true;
      networkState.lastOnlineCheck = Date.now();

      if (wasOffline) {
        console.log('[NETWORK] connection restored');
        broadcastNetworkStatus();
        void flushSyncQueue();
        void pollSyncCommands();
      }
    } catch (e) {
      const wasOnline = networkState.isOnline;
      networkState.isOnline = false;
      networkState.lastOnlineCheck = Date.now();

      if (wasOnline) {
        console.log('[NETWORK] connection lost - local persistence stays active');
        broadcastNetworkStatus();
      }
    } finally {
      networkState.checkInFlight = false;
    }
  };
  
  // الفحص الأول فوراً
  void checkConnectivity();
  
  // ثم الفحص الدوري كل 5 ثوان
  networkState.connectionCheckInterval = setInterval(checkConnectivity, 5000);
}

// --- App Updates ---
const updateState = {
  status: "idle",
  available: false,
  version: null,
  currentVersion: app.getVersion(),
  lastCheckedAt: null,
  error: null
};

function pushUpdateState(patch) {
  Object.assign(updateState, patch);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", updateState);
  }
}

function initAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    pushUpdateState({ status: "checking", error: null });
  });

  autoUpdater.on("update-available", (info) => {
    pushUpdateState({
      status: "available",
      available: true,
      version: info?.version || null,
      error: null
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    pushUpdateState({
      status: "not-available",
      available: false,
      version: info?.version || null,
      error: null
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    pushUpdateState({
      status: "downloaded",
      available: true,
      version: info?.version || updateState.version,
      error: null
    });
  });

  autoUpdater.on("error", (err) => {
    pushUpdateState({
      status: "error",
      error: String(err?.message || err)
    });
  });
}

// --- Cloud Sync (Central Server) ---
const syncState = {
  enabled: false,
  serverUrl: '',
  storeId: '',
  storeSecret: '',
  queue: [],
  isFlushing: false,
  isPollingCommands: false,
  lastError: null,
  lastSuccessAt: null,
  queuePath: null,
  intervalId: null,
  commandIntervalId: null,
  appliedCommandsPath: null,
  appliedCommands: []
};

const MAX_SYNC_QUEUE = 5000;
const SYNC_HTTP_TIMEOUT_MS = 30000;
const SYNC_HTTP_MAX_RETRIES = 1;
const SYNC_HTTP_RETRY_DELAY_MS = 1200;
const SYNC_COMMAND_BATCH_SIZE = 10;
const SQLITE_BUSY_MAX_RETRIES = 4;
const SQLITE_BUSY_RETRY_DELAY_MS = 220;
const SALE_DEBT_PREFIX = '\u0641\u0627\u062a\u0648\u0631\u0629 \u0645\u0628\u064a\u0639\u0627\u062a #';
const AUTO_PRICING_PROFILES_FILE = 'auto-pricing-profiles.json';
const PRICING_LOGS_FILE = 'pricing-logs.json';
const runtimeDbState = {
  cashierWriteOps: 0
};

const telegramBotState = {
  enabled: false,
  intervalId: null,
  bots: [],
  offsets: {},
  isPolling: false,
  lastError: null,
  lastMessageAt: null
};

function beginCashierWrite() {
  runtimeDbState.cashierWriteOps += 1;
}

function endCashierWrite() {
  runtimeDbState.cashierWriteOps = Math.max(0, runtimeDbState.cashierWriteOps - 1);
}

function isCashierWriteActive() {
  return runtimeDbState.cashierWriteOps > 0;
}


function safeJsonParse(raw, fallback) {
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toPositiveNumberOrFallback(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function normalizeOfferPackageItems(offer) {
  if (!offer || !offer.isOffer) return [];
  const rawItems = Array.isArray(offer.packageItems) && offer.packageItems.length > 0
    ? offer.packageItems
    : (
      offer.offerUnderlyingProductId && Number(offer.offerUnderlyingProductQuantity) > 0
        ? [{ productId: offer.offerUnderlyingProductId, quantity: offer.offerUnderlyingProductQuantity }]
        : []
    );

  return rawItems
    .map((item) => ({
      productId: Number(item?.productId),
      quantity: Number(item?.quantity)
    }))
    .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && Number.isFinite(item.quantity) && item.quantity > 0);
}

function getSaleStockMovements(offers, productId, saleQuantity) {
  const qty = Number(saleQuantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return [];

  const packageItems = normalizeOfferPackageItems(offers?.[String(productId)]);
  if (packageItems.length > 0) {
    return packageItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity * qty
    }));
  }

  return [{ productId: Number(productId), quantity: qty }];
}

async function applySaleStockMovement(tx, offers, productId, saleQuantity, direction) {
  const movements = getSaleStockMovements(offers, productId, saleQuantity);
  for (const movement of movements) {
    await tx.product.update({
      where: { id: movement.productId },
      data: {
        stock: direction === 'increment'
          ? { increment: movement.quantity }
          : { decrement: movement.quantity }
      }
    });
  }
}

function safeUnitCost(boxPurchasePrice, unitsPerBox) {
  const units = toPositiveNumberOrFallback(unitsPerBox, 1);
  const cost = toFiniteNumber(boxPurchasePrice, 0);
  return units > 0 ? cost / units : 0;
}

function computeMarkupPercent(salePrice, costPrice) {
  const sale = toFiniteNumber(salePrice, 0);
  const cost = toFiniteNumber(costPrice, 0);
  if (!(cost > 0)) return null;
  return ((sale - cost) / cost) * 100;
}

function roundPrice(value, roundTo, roundMode) {
  const numeric = toFiniteNumber(value, 0);
  const step = toPositiveNumberOrFallback(roundTo, 0);
  // IQD prices should never keep fractional fils in POS totals.
  if (!(step > 0)) return Math.round(numeric);
  const base = numeric / step;
  const roundedBase = roundMode === 'up' ? Math.ceil(base) : Math.round(base);
  return Math.round(roundedBase * step);
}

function getAutoPricingProfilesPath() {
  return path.join(app.getPath('userData'), AUTO_PRICING_PROFILES_FILE);
}

function getPricingLogsPath() {
  return path.join(app.getPath('userData'), PRICING_LOGS_FILE);
}

function readAutoPricingProfiles() {
  const file = getAutoPricingProfilesPath();
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = safeJsonParse(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function writeAutoPricingProfiles(profiles) {
  const file = getAutoPricingProfilesPath();
  fs.writeFileSync(file, JSON.stringify(profiles || {}, null, 2), 'utf8');
}

function readPricingLogs() {
  const file = getPricingLogsPath();
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function appendPricingLogs(newLogs) {
  if (!Array.isArray(newLogs) || !newLogs.length) return;
  const current = readPricingLogs();
  current.unshift(...newLogs);
  if (current.length > 10000) current.length = 10000;
  fs.writeFileSync(getPricingLogsPath(), JSON.stringify(current, null, 2), 'utf8');
}

function normalizeDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) parsed.setHours(23, 59, 59, 999);
  else parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function buildPricingSnapshot(product) {
  const unitsPerBox = toPositiveNumberOrFallback(product?.unitsPerBox, 1);
  const boxPurchasePrice = toFiniteNumber(product?.boxPurchasePrice, 0);
  const boxSalePrice = toFiniteNumber(product?.boxSalePrice, 0);
  const unitCost = safeUnitCost(boxPurchasePrice, unitsPerBox);
  const unitPrice = toFiniteNumber(product?.price, 0);
  const unitProfitAmount = unitPrice - unitCost;
  const boxProfitAmount = boxSalePrice - boxPurchasePrice;

  return {
    unitsPerBox,
    boxPurchasePrice,
    boxSalePrice,
    unitCost,
    unitPrice,
    unitProfitAmount,
    unitProfitPercent: computeMarkupPercent(unitPrice, unitCost),
    boxProfitAmount,
    boxProfitPercent: computeMarkupPercent(boxSalePrice, boxPurchasePrice)
  };
}

function shouldRefreshAutoPricingProfileBySaleChange(beforeProduct, afterProduct) {
  if (!beforeProduct || !afterProduct) return false;
  const epsilon = 0.0001;
  const oldUnitPrice = toFiniteNumber(beforeProduct.price, 0);
  const newUnitPrice = toFiniteNumber(afterProduct.price, oldUnitPrice);
  const oldBoxSalePrice = toFiniteNumber(beforeProduct.boxSalePrice, 0);
  const newBoxSalePrice = toFiniteNumber(afterProduct.boxSalePrice, oldBoxSalePrice);
  return Math.abs(newUnitPrice - oldUnitPrice) > epsilon || Math.abs(newBoxSalePrice - oldBoxSalePrice) > epsilon;
}

function upsertAutoPricingProfileFromProduct(product, { source = 'manual-price-edit' } = {}) {
  if (!product || !product.id) return { ok: false, reason: 'missing-product' };
  const snapshot = buildPricingSnapshot(product);
  const unitMarkupPercent = Number.isFinite(snapshot.unitProfitPercent)
    ? Number(snapshot.unitProfitPercent)
    : null;
  const boxMarkupPercent = Number.isFinite(snapshot.boxProfitPercent)
    ? Number(snapshot.boxProfitPercent)
    : null;

  if (unitMarkupPercent === null && boxMarkupPercent === null) {
    return { ok: false, reason: 'missing-valid-markup' };
  }

  const profiles = readAutoPricingProfiles();
  const key = String(product.id);
  const previous = profiles[key] || {};
  profiles[key] = {
    ...previous,
    productId: Number(product.id),
    productName: product.name || previous.productName || '',
    unitMarkupPercent: unitMarkupPercent ?? previous.unitMarkupPercent ?? null,
    boxMarkupPercent: boxMarkupPercent ?? previous.boxMarkupPercent ?? null,
    unitsPerBox: snapshot.unitsPerBox,
    capturedAt: new Date().toISOString(),
    capturedSource: source
  };
  writeAutoPricingProfiles(profiles);
  return { ok: true };
}

function getCostChangeStats(beforeProduct, afterProduct) {
  const beforeUnitsPerBox = toPositiveNumberOrFallback(beforeProduct?.unitsPerBox, 1);
  const afterUnitsPerBox = toPositiveNumberOrFallback(afterProduct?.unitsPerBox, 1);
  const beforeBoxPurchasePrice = toFiniteNumber(beforeProduct?.boxPurchasePrice, 0);
  const afterBoxPurchasePrice = toFiniteNumber(afterProduct?.boxPurchasePrice, 0);
  const beforeUnitCost = safeUnitCost(beforeBoxPurchasePrice, beforeUnitsPerBox);
  const afterUnitCost = safeUnitCost(afterBoxPurchasePrice, afterUnitsPerBox);
  const unitCostDelta = afterUnitCost - beforeUnitCost;
  const unitCostChanged = Math.abs(unitCostDelta) > 0.0001;
  const boxPurchaseChanged = Math.abs(afterBoxPurchasePrice - beforeBoxPurchasePrice) > 0.0001;
  const unitsPerBoxChanged = beforeUnitsPerBox !== afterUnitsPerBox;
  let unitCostChangePercent = 0;
  if (beforeUnitCost > 0) {
    unitCostChangePercent = Math.abs((unitCostDelta / beforeUnitCost) * 100);
  } else if (afterUnitCost > 0) {
    unitCostChangePercent = 100;
  }

  return {
    beforeUnitsPerBox,
    afterUnitsPerBox,
    beforeBoxPurchasePrice,
    afterBoxPurchasePrice,
    beforeUnitCost,
    afterUnitCost,
    unitCostDelta,
    unitCostChanged,
    boxPurchaseChanged,
    unitsPerBoxChanged,
    unitCostChangePercent
  };
}

function shouldTriggerAutoPricingFromCostChange(costChange, minCostChangePercent = 0) {
  if (!costChange || !costChange.unitCostChanged) return false;
  const threshold = Math.max(0, toFiniteNumber(minCostChangePercent, 0));
  if (threshold <= 0) return true;
  return costChange.unitCostChangePercent >= threshold;
}

function computeLinkedBoxSalePrice(unitSalePrice, unitsPerBox) {
  const unitPrice = toFiniteNumber(unitSalePrice, 0);
  const units = toPositiveNumberOrFallback(unitsPerBox, 1);
  return Math.round(unitPrice * units);
}

function isAdminRole(role) {
  return String(role || "").toLowerCase() === "admin";
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function normalizeCashboxType(value) {
  return value === "withdrawal" ? "withdrawal" : "deposit";
}

function getCenterCashboxEntriesPath() {
  return path.join(app.getPath("userData"), "center-cashbox-entries.json");
}

function readCenterCashboxEntries() {
  const jsonPath = getCenterCashboxEntriesPath();
  if (!fs.existsSync(jsonPath)) return [];
  const raw = fs.readFileSync(jsonPath, "utf8");
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeCenterCashboxEntries(entries) {
  const jsonPath = getCenterCashboxEntriesPath();
  fs.writeFileSync(jsonPath, JSON.stringify(entries, null, 2), "utf8");
}

function sortCenterCashboxEntries(entries) {
  return [...entries].sort((a, b) => {
    const aTime = new Date(a?.createdAt || 0).getTime();
    const bTime = new Date(b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function hasUsableDbFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch (e) {
    return false;
  }
}

function copySqliteBundle(sourceDbPath, targetDbPath) {
  fs.copyFileSync(sourceDbPath, targetDbPath);
  for (const suffix of ["-wal", "-shm"]) {
    const source = `${sourceDbPath}${suffix}`;
    const target = `${targetDbPath}${suffix}`;
    try {
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, target);
      } else if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (e) {
      console.warn(`Failed handling SQLite sidecar ${suffix}:`, e);
    }
  }
}

function escapeSqliteFilePath(filePath) {
  return String(filePath || '').replace(/'/g, "''");
}

function getLocalDbBackupPath(primaryDbPath) {
  return `${primaryDbPath}.bad.db`;
}

function getManagedBackupsDir() {
  const dir = path.join(app.getPath('documents'), 'POS Backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function buildBackupFilename(prefix = 'backup', ext = 'db') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${ext}`;
}

function getLegacyDbPath(currentDbPath) {
  try {
    const appDataDir = app.getPath("appData");
    const currentNormalized = path.normalize(currentDbPath).toLowerCase();
    const legacyFolders = [
      path.basename(defaultUserDataPath || ""),
      "cro-p",
      "cashier",
      "cashierall",
      "cashier-updata",
      "pos",
      "pos s"
    ].filter(Boolean);

    const candidates = Array.from(new Set(legacyFolders))
      .map((folder) => path.join(appDataDir, folder, "dev.db"))
      .filter((candidate) => path.normalize(candidate).toLowerCase() !== currentNormalized)
      .filter((candidate) => hasUsableDbFile(candidate))
      .map((candidate) => {
        const stat = fs.statSync(candidate);
        return { candidate, size: stat.size, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => {
        if (b.size !== a.size) return b.size - a.size;
        return b.mtimeMs - a.mtimeMs;
      });

    return candidates[0]?.candidate || null;
  } catch (e) {
    console.warn("Failed to resolve legacy DB path:", e);
    return null;
  }
}

function loadSyncQueue() {
  if (!syncState.queuePath) return;
  if (fs.existsSync(syncState.queuePath)) {
    const raw = fs.readFileSync(syncState.queuePath, 'utf8');
    const data = safeJsonParse(raw, []);
    if (Array.isArray(data)) syncState.queue = data;
  }
}

function saveSyncQueue() {
  if (!syncState.queuePath) return;
  try {
    fs.writeFileSync(syncState.queuePath, JSON.stringify(syncState.queue, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write sync queue:', e);
  }
}

async function fixDebtReasonEncoding() {
  try {
    const prisma = await getPrisma();
    const flagKey = 'debtReasonFixV1';
    const flag = await prisma.appSetting.findUnique({ where: { key: flagKey } });
    if (flag?.value === 'true') return;
    const debts = await prisma.debt.findMany({ where: { reason: { contains: '?' } } });
    let updated = 0;
    for (const d of debts) {
      const match = String(d.reason || '').match(/(\d+)/);
      if (!match) continue;
      await prisma.debt.update({
        where: { id: d.id },
        data: { reason: `${SALE_DEBT_PREFIX}${match[1]}` }
      });
      updated += 1;
    }
    await prisma.appSetting.upsert({
      where: { key: flagKey },
      update: { value: 'true' },
      create: { key: flagKey, value: 'true' }
    });
    if (updated) console.log(`Fixed debt reasons: ${updated}`);
  } catch (e) {
    console.error('Failed to fix debt reasons:', e);
  }
}

async function loadSyncConfigFromDb() {
  try {
    const prisma = await getPrisma();
    const keys = ['cloudSyncEnabled', 'cloudServerUrl', 'cloudStoreId', 'cloudStoreSecret'];
    const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
    const map = new Map(settings.map(s => [s.key, s.value]));
    syncState.enabled = map.get('cloudSyncEnabled') === 'true';
    syncState.serverUrl = map.get('cloudServerUrl') || '';
    syncState.storeId = map.get('cloudStoreId') || '';
    syncState.storeSecret = map.get('cloudStoreSecret') || '';
  } catch (e) {
    console.error('Failed to load sync settings:', e);
  }
}

function updateSyncSetting(key, value) {
  if (key === 'cloudSyncEnabled') syncState.enabled = value === 'true' || value === true;
  if (key === 'cloudServerUrl') syncState.serverUrl = String(value || '');
  if (key === 'cloudStoreId') syncState.storeId = String(value || '');
  if (key === 'cloudStoreSecret') syncState.storeSecret = String(value || '');
}

function sanitizeTelegramSettings(raw) {
  const parsed = typeof raw === 'string' ? safeJsonParse(raw, {}) : (raw || {});
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const firstUser = users[0] || {};
  return {
    enabled: parsed.enabled === true || parsed.enabled === 'true',
    scope: String(parsed.scope || 'cashier_copy'),
    label: String(parsed.label || parsed.copyName || '').trim(),
    botToken: String(parsed.botToken || firstUser.botToken || '').trim(),
    cashierChatId: String(parsed.cashierChatId || parsed.chatId || firstUser.chatId || '').trim(),
    ownerChatId: String(parsed.ownerChatId || '').trim(),
    cashierUserId: parsed.cashierUserId ? Number(parsed.cashierUserId) : (firstUser.userId ? Number(firstUser.userId) : null),
    users: users.map((item) => ({
      userId: Number(item.userId || 0),
      username: String(item.username || ''),
      name: String(item.name || ''),
      role: String(item.role || 'cashier'),
      botToken: String(item.botToken || '').trim(),
      chatId: String(item.chatId || '').trim(),
      enabled: item.enabled !== false
    }))
  };
}

function maskTelegramToken(token) {
  const value = String(token || '');
  if (value.length <= 10) return value ? '********' : '';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function getTelegramStorageUserId(client, preferredUserId = null) {
  const preferred = Number(preferredUserId || 0);
  if (preferred) {
    const rows = await client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${preferred} LIMIT 1`;
    if (rows?.length) return preferred;
  }
  const firstUser = await client.$queryRaw`SELECT "id" FROM "User" ORDER BY "id" ASC LIMIT 1`;
  return Number(firstUser?.[0]?.id || 0);
}

async function ensureTelegramBotSettingsTable(client) {
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TelegramBotSetting" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "userId" INTEGER NOT NULL,
      "botToken" TEXT NOT NULL,
      "chatId" TEXT NOT NULL,
      "scope" TEXT NOT NULL DEFAULT 'user',
      "label" TEXT,
      "cashierChatId" TEXT,
      "ownerChatId" TEXT,
      "cashierUserId" INTEGER,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TelegramBotSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  const columns = await client.$queryRawUnsafe(`PRAGMA table_info("TelegramBotSetting");`);
  const columnNames = new Set((columns || []).map((column) => String(column.name)));
  const addColumn = async (name, sql) => {
    if (!columnNames.has(name)) await client.$executeRawUnsafe(sql);
  };
  await addColumn('scope', `ALTER TABLE "TelegramBotSetting" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'user';`);
  await addColumn('label', `ALTER TABLE "TelegramBotSetting" ADD COLUMN "label" TEXT;`);
  await addColumn('cashierChatId', `ALTER TABLE "TelegramBotSetting" ADD COLUMN "cashierChatId" TEXT;`);
  await addColumn('ownerChatId', `ALTER TABLE "TelegramBotSetting" ADD COLUMN "ownerChatId" TEXT;`);
  await addColumn('cashierUserId', `ALTER TABLE "TelegramBotSetting" ADD COLUMN "cashierUserId" INTEGER;`);
  await client.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TelegramBotSetting_userId_key" ON "TelegramBotSetting"("userId");`);
  await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TelegramBotSetting_scope_idx" ON "TelegramBotSetting"("scope");`);
  await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TelegramBotSetting_cashierUserId_idx" ON "TelegramBotSetting"("cashierUserId");`);
  await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TelegramBotSetting_enabled_idx" ON "TelegramBotSetting"("enabled");`);
}

async function migrateLegacyTelegramSettings(client) {
  await ensureTelegramBotSettingsTable(client);
  const copyRows = await client.$queryRaw`SELECT "id" FROM "TelegramBotSetting" WHERE "scope" = 'cashier_copy' LIMIT 1`;
  if (copyRows?.length) return;
  const legacy = await client.appSetting.findUnique({ where: { key: 'telegramBotSettings' } }).catch(() => null);
  if (!legacy?.value) {
    const firstRow = await client.$queryRaw`
      SELECT "userId", "botToken", "chatId", "enabled"
      FROM "TelegramBotSetting"
      WHERE "botToken" != ''
      ORDER BY "id" ASC
      LIMIT 1
    `;
    const row = firstRow?.[0];
    if (!row) return;
    const storageUserId = await getTelegramStorageUserId(client, Number(row.userId || 0));
    await client.$executeRaw`DELETE FROM "TelegramBotSetting"`;
    await client.$executeRaw`
      INSERT INTO "TelegramBotSetting" ("userId", "scope", "label", "botToken", "chatId", "cashierChatId", "ownerChatId", "cashierUserId", "enabled", "createdAt", "updatedAt")
      VALUES (${storageUserId}, 'cashier_copy', 'نسخة الكاشير', ${String(row.botToken || '')}, ${String(row.chatId || '')}, ${String(row.chatId || '')}, '', ${Number(row.userId || 0) || null}, ${row.enabled !== false && row.enabled !== 0}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    return;
  }
  const settings = sanitizeTelegramSettings(legacy.value);
  if (typeof settings.enabled === 'boolean') {
    await client.appSetting.upsert({
      where: { key: 'telegramBotsEnabled' },
      update: { value: String(settings.enabled) },
      create: { key: 'telegramBotsEnabled', value: String(settings.enabled) }
    });
  }
  if (settings.botToken || settings.cashierChatId || settings.ownerChatId) {
    const storageUserId = await getTelegramStorageUserId(client, settings.cashierUserId);
    await client.$executeRaw`DELETE FROM "TelegramBotSetting"`;
    await client.$executeRaw`
      INSERT INTO "TelegramBotSetting" ("userId", "scope", "label", "botToken", "chatId", "cashierChatId", "ownerChatId", "cashierUserId", "enabled", "createdAt", "updatedAt")
      VALUES (${storageUserId}, 'cashier_copy', ${settings.label || 'نسخة الكاشير'}, ${settings.botToken}, ${settings.cashierChatId}, ${settings.cashierChatId}, ${settings.ownerChatId}, ${settings.cashierUserId || null}, ${settings.enabled !== false}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    return;
  }
  for (const user of settings.users || []) {
    const userId = Number(user.userId || 0);
    const botToken = String(user.botToken || '').trim();
    const chatId = String(user.chatId || '').trim();
    if (!userId || (!botToken && !chatId)) continue;
    await client.$executeRaw`
      INSERT INTO "TelegramBotSetting" ("userId", "botToken", "chatId", "enabled", "createdAt", "updatedAt")
      VALUES (${userId}, ${botToken}, ${chatId}, ${user.enabled !== false}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("userId") DO UPDATE SET
        "botToken" = CASE WHEN excluded."botToken" != '' THEN excluded."botToken" ELSE "TelegramBotSetting"."botToken" END,
        "chatId" = excluded."chatId",
        "enabled" = excluded."enabled",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  }
}

async function loadTelegramSettings() {
  const prisma = await getPrisma();
  await ensureTelegramBotSettingsTable(prisma);
  await migrateLegacyTelegramSettings(prisma);
  const enabledSetting = await prisma.appSetting.findUnique({ where: { key: 'telegramBotsEnabled' } }).catch(() => null);
  const rows = await prisma.$queryRaw`
    SELECT
      t."userId",
      t."botToken",
      t."chatId",
      t."scope",
      t."label",
      t."cashierChatId",
      t."ownerChatId",
      t."cashierUserId",
      t."enabled",
      u."username",
      u."name",
      u."role"
    FROM "TelegramBotSetting" t
    LEFT JOIN "User" u ON u."id" = t."cashierUserId"
    WHERE t."scope" = 'cashier_copy'
    ORDER BY t."id" ASC
    LIMIT 1
  `;
  const row = rows?.[0];
  if (row) {
    return {
      enabled: enabledSetting?.value === 'true',
      scope: 'cashier_copy',
      label: String(row.label || 'نسخة الكاشير'),
      botToken: String(row.botToken || ''),
      cashierChatId: String(row.cashierChatId || row.chatId || ''),
      ownerChatId: String(row.ownerChatId || ''),
      cashierUserId: row.cashierUserId ? Number(row.cashierUserId) : null,
      cashierUser: row.cashierUserId ? {
        id: Number(row.cashierUserId),
        username: String(row.username || ''),
        name: String(row.name || ''),
        role: String(row.role || 'cashier')
      } : null,
      users: []
    };
  }
  return {
    enabled: enabledSetting?.value === 'true',
    scope: 'cashier_copy',
    label: 'نسخة الكاشير',
    botToken: '',
    cashierChatId: '',
    ownerChatId: '',
    cashierUserId: null,
    cashierUser: null,
    users: []
  };
}

async function getSavedTelegramBotToken() {
  const prisma = await getPrisma();
  await ensureTelegramBotSettingsTable(prisma);
  const rows = await prisma.$queryRaw`
    SELECT "botToken" FROM "TelegramBotSetting"
    WHERE "scope" = 'cashier_copy'
    LIMIT 1
  `;
  return String(rows?.[0]?.botToken || '').trim();
}

function getTelegramBotsFromSettings(settings) {
  if (!settings.enabled || !settings.botToken) return [];
  const recipients = [];
  if (settings.cashierChatId) {
    recipients.push({
      recipient: 'cashier',
      role: 'cashier',
      userId: settings.cashierUserId ? Number(settings.cashierUserId) : null,
      username: settings.cashierUser?.username || '',
      name: settings.cashierUser?.name || settings.label || 'نسخة الكاشير',
      botToken: settings.botToken,
      chatId: String(settings.cashierChatId)
    });
  }
  if (settings.ownerChatId && String(settings.ownerChatId) !== String(settings.cashierChatId || '')) {
    recipients.push({
      recipient: 'owner',
      role: 'admin',
      userId: null,
      username: 'owner',
      name: 'المالك',
      botToken: settings.botToken,
      chatId: String(settings.ownerChatId)
    });
  }
  if (!recipients.length) return [];
  return [{
    botToken: settings.botToken,
    label: settings.label || 'نسخة الكاشير',
    recipients
  }];
}

function toBaghdadReportDate(dateInput = new Date()) {
  const date = new Date(dateInput);
  date.setUTCHours(date.getUTCHours() + 3);
  return date.toISOString().slice(0, 10);
}

function formatIqd(value) {
  return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} د.ع`;
}

function dateRangeForTelegram(args) {
  const today = toBaghdadReportDate();
  const raw = String(args?.[0] || '').trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const from = new Date(`${day}T00:00:00+03:00`);
  const to = new Date(`${day}T23:59:59.999+03:00`);
  return { day, from, to };
}

async function buildTelegramSalesReport(bot, args) {
  const prisma = await getPrisma();
  const { day, from, to } = dateRangeForTelegram(args);
  const where = {
    createdAt: { gte: from, lte: to },
    ...(bot.role === 'admin' || !bot.userId ? {} : { cashierId: Number(bot.userId) })
  };
  const sales = await prisma.sale.findMany({
    where,
    include: { items: true }
  });
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cash = sales.filter((sale) => sale.paymentMethod === 'cash').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const card = sales.filter((sale) => sale.paymentMethod === 'mastercard').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const debt = sales.filter((sale) => sale.paymentMethod === 'debt').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const itemsCount = sales.reduce((sum, sale) => sum + (sale.items || []).reduce((inner, item) => inner + Number(item.quantity || 0), 0), 0);
  return [
    `تقرير المبيعات - ${day}`,
    `النطاق: ${bot.role === 'admin' ? 'كل الكاشيرات' : (bot.name || bot.username)}`,
    `عدد الفواتير: ${sales.length}`,
    `عدد القطع: ${itemsCount}`,
    `الإجمالي: ${formatIqd(total)}`,
    `كاش: ${formatIqd(cash)}`,
    `بطاقة: ${formatIqd(card)}`,
    `ديون: ${formatIqd(debt)}`
  ].join('\n');
}

async function buildTelegramStockReport(args) {
  const prisma = await getPrisma();
  const query = args.join(' ').trim();
  const products = await prisma.product.findMany({
    where: query ? { name: { contains: query } } : {},
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    take: 20,
    select: { name: true, stock: true, price: true }
  });
  if (!products.length) return 'لا توجد منتجات مطابقة.';
  return [
    query ? `نتائج المخزون: ${query}` : 'أقل 20 منتج في المخزون',
    ...products.map((p) => `- ${p.name}: ${p.stock} | سعر: ${formatIqd(p.price)}`)
  ].join('\n');
}

async function buildTelegramLowStockReport(args) {
  const prisma = await getPrisma();
  const limit = Math.max(0, Number(args?.[0] || 5));
  const products = await prisma.product.findMany({
    where: { stock: { lte: limit } },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    take: 30,
    select: { name: true, stock: true }
  });
  if (!products.length) return `لا توجد نواقص عند حد ${limit}.`;
  return [`النواقص حتى ${limit}:`, ...products.map((p) => `- ${p.name}: ${p.stock}`)].join('\n');
}

async function buildTelegramDebtsReport() {
  const prisma = await getPrisma();
  const debts = await prisma.debt.findMany({
    include: { client: true, payments: true },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  const rows = debts.map((debt) => {
    const paid = (debt.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      name: debt.client?.name || 'زبون غير مسجل',
      remaining: Math.max(0, Number(debt.amount || 0) - paid)
    };
  }).filter((row) => row.remaining > 0);
  const total = rows.reduce((sum, row) => sum + row.remaining, 0);
  const top = rows.sort((a, b) => b.remaining - a.remaining).slice(0, 10);
  return [`تقرير الديون`, `الإجمالي: ${formatIqd(total)}`, ...top.map((row) => `- ${row.name}: ${formatIqd(row.remaining)}`)].join('\n');
}

async function buildTelegramCashiersReport() {
  const prisma = await getPrisma();
  const today = toBaghdadReportDate();
  const from = new Date(`${today}T00:00:00+03:00`);
  const to = new Date(`${today}T23:59:59.999+03:00`);
  const users = await prisma.user.findMany({ select: { id: true, name: true, username: true } });
  const sales = await prisma.sale.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { cashierId: true, total: true } });
  return [
    `الكاشيرات اليوم - ${today}`,
    ...users.map((user) => {
      const userSales = sales.filter((sale) => Number(sale.cashierId || 0) === Number(user.id));
      const total = userSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      return `- ${user.name || user.username}: ${userSales.length} فاتورة | ${formatIqd(total)}`;
    })
  ].join('\n');
}

function telegramHelpText(role) {
  const adminLines = role === 'admin'
    ? ['/debts - تقرير الديون', '/cashiers - مبيعات الكاشيرات اليوم']
    : [];
  return [
    'أوامر بوت الإدارة:',
    '/sales [YYYY-MM-DD] - تقرير المبيعات',
    '/stock [اسم المنتج] - المخزون',
    '/lowstock [حد] - النواقص',
    ...adminLines,
    '/help - عرض الأوامر'
  ].join('\n');
}

async function handleTelegramCommand(bot, text) {
  const [rawCommand, ...args] = String(text || '').trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  if (!command || command === '/help' || command === '/start') return telegramHelpText(bot.role);
  if (command === '/sales' || command === '/report') return buildTelegramSalesReport(bot, args);
  if (command === '/stock' || command === '/inventory') return buildTelegramStockReport(args);
  if (command === '/lowstock' || command === '/shortages') return buildTelegramLowStockReport(args);
  if (command === '/debts') return bot.role === 'admin' ? buildTelegramDebtsReport() : 'هذا الأمر للمدير فقط.';
  if (command === '/cashiers') return bot.role === 'admin' ? buildTelegramCashiersReport() : 'هذا الأمر للمدير فقط.';
  return 'أمر غير معروف. اكتب /help لعرض الأوامر.';
}

async function telegramApi(botToken, method, payload, timeoutMs = 15000) {
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  }, timeoutMs);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.description || `Telegram ${method} failed`);
  }
  return json.result;
}

async function sendTelegramMessage(bot, text) {
  const chunks = String(text || '').match(/[\s\S]{1,3500}/g) || [''];
  for (const chunk of chunks) {
    await telegramApi(bot.botToken, 'sendMessage', {
      chat_id: bot.chatId,
      text: chunk,
      disable_web_page_preview: true
    });
  }
}

async function pollTelegramBot(bot) {
  const offsetKey = bot.botToken.slice(0, 24);
  const updates = await telegramApi(bot.botToken, 'getUpdates', {
    offset: telegramBotState.offsets[offsetKey] || undefined,
    timeout: 1,
    allowed_updates: ['message']
  }, 8000);
  for (const update of updates || []) {
    telegramBotState.offsets[offsetKey] = Number(update.update_id) + 1;
    const message = update.message;
    const chatId = String(message?.chat?.id || '');
    const text = String(message?.text || '').trim();
    if (!text) continue;
    const recipient = (bot.recipients || []).find((item) => String(item.chatId) === chatId);
    if (!recipient) {
      await telegramApi(bot.botToken, 'sendMessage', {
        chat_id: chatId,
        text: 'هذا البوت مربوط بمستخدم محدد. استخدم Chat ID المسجل في النظام.'
      }).catch(() => {});
      continue;
    }
    const reply = await handleTelegramCommand({ ...recipient, botToken: bot.botToken }, text);
    await sendTelegramMessage({ ...recipient, botToken: bot.botToken }, reply);
    telegramBotState.lastMessageAt = new Date().toISOString();
  }
}

async function pollTelegramBots() {
  if (!telegramBotState.enabled || telegramBotState.isPolling) return;
  telegramBotState.isPolling = true;
  try {
    for (const bot of telegramBotState.bots) {
      await pollTelegramBot(bot);
    }
    telegramBotState.lastError = null;
  } catch (e) {
    telegramBotState.lastError = String(e?.message || e);
    console.error('Telegram bot polling failed:', e);
  } finally {
    telegramBotState.isPolling = false;
  }
}

function stopTelegramBots() {
  if (telegramBotState.intervalId) {
    clearInterval(telegramBotState.intervalId);
    telegramBotState.intervalId = null;
  }
  telegramBotState.enabled = false;
  telegramBotState.bots = [];
}

async function restartTelegramBots() {
  const settings = await loadTelegramSettings();
  stopTelegramBots();
  telegramBotState.enabled = settings.enabled;
  telegramBotState.bots = settings.enabled ? getTelegramBotsFromSettings(settings) : [];
  if (!telegramBotState.enabled || telegramBotState.bots.length === 0) return;
  telegramBotState.intervalId = setInterval(() => void pollTelegramBots(), 5000);
  void pollTelegramBots();
}

async function loadAutoPricingSettingsFromDb() {
  const prisma = await getPrisma();
  const keys = [
    'autoPricingEnabled',
    'autoPricingMode',
    'autoPricingUnitMarkupPercent',
    'autoPricingBoxMarkupPercent',
    'autoPricingRoundTo',
    'autoPricingRoundMode',
    'autoPricingPreventLoss',
    'autoPricingApplyOnProductEdit',
    'autoPricingMinCostChangePercent'
  ];
  const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  const rawRoundTo = toFiniteNumber(map.get('autoPricingRoundTo'), 250);
  const normalizedRoundTo = rawRoundTo > 0 ? rawRoundTo : 250;

  return {
    enabled: map.get('autoPricingEnabled') === 'true',
    mode: map.get('autoPricingMode') === 'fixed' ? 'fixed' : 'preserve',
    unitMarkupPercent: toFiniteNumber(map.get('autoPricingUnitMarkupPercent'), 25),
    boxMarkupPercent: toFiniteNumber(map.get('autoPricingBoxMarkupPercent'), 25),
    roundTo: normalizedRoundTo,
    roundMode: map.get('autoPricingRoundMode') === 'up' ? 'up' : 'nearest',
    preventLoss: map.get('autoPricingPreventLoss') === null || map.get('autoPricingPreventLoss') === undefined
      ? true
      : map.get('autoPricingPreventLoss') === 'true',
    applyOnProductEdit: map.get('autoPricingApplyOnProductEdit') === null || map.get('autoPricingApplyOnProductEdit') === undefined
      ? true
      : map.get('autoPricingApplyOnProductEdit') === 'true',
    minCostChangePercent: Math.max(0, toFiniteNumber(map.get('autoPricingMinCostChangePercent'), 0))
  };
}

function normalizeProductIdList(productIds) {
  if (!Array.isArray(productIds)) return [];
  return Array.from(new Set(productIds.map((id) => Number(id)).filter(Boolean)));
}

async function runAutoPricingPass({
  productIds = null,
  source = 'auto-pricing-batch',
  note = 'Auto pricing run'
} = {}) {
  try {
    const prisma = await getPrisma();
    const settings = await loadAutoPricingSettingsFromDb();
    if (!settings.enabled) {
      return { ok: true, updated: 0, skipped: true, reason: 'disabled' };
    }

    const ids = normalizeProductIdList(productIds);
    const where = ids.length ? { id: { in: ids } } : undefined;
    const profiles = readAutoPricingProfiles();
    const products = await prisma.product.findMany({
      ...(where ? { where } : {}),
      select: {
        id: true,
        name: true,
        unitsPerBox: true,
        boxPurchasePrice: true,
        boxSalePrice: true,
        price: true
      }
    });

    if (!products.length) {
      return { ok: true, updated: 0, skipped: false };
    }

    const changedProductIds = [];
    const logs = [];
    const nowIso = new Date().toISOString();
    const epsilon = 0.0001;

    for (const product of products) {
      const before = buildPricingSnapshot(product);
      const profile = profiles[String(product.id)] || {};

      const derivedUnitMarkup = Number.isFinite(before.unitProfitPercent)
        ? Number(before.unitProfitPercent)
        : settings.unitMarkupPercent;
      const derivedBoxMarkup = Number.isFinite(before.boxProfitPercent)
        ? Number(before.boxProfitPercent)
        : settings.boxMarkupPercent;

      const unitMarkupPercent = settings.mode === 'preserve'
        ? toFiniteNumber(profile.unitMarkupPercent, derivedUnitMarkup)
        : toFiniteNumber(settings.unitMarkupPercent, derivedUnitMarkup);
      const boxMarkupPercent = settings.mode === 'preserve'
        ? toFiniteNumber(profile.boxMarkupPercent, derivedBoxMarkup)
        : toFiniteNumber(settings.boxMarkupPercent, derivedBoxMarkup);

      let rawUnitSale = before.unitCost * (1 + (unitMarkupPercent / 100));
      let rawBoxSale = before.boxPurchasePrice * (1 + (boxMarkupPercent / 100));

      if (settings.preventLoss) {
        rawUnitSale = Math.max(rawUnitSale, before.unitCost);
        rawBoxSale = Math.max(rawBoxSale, before.boxPurchasePrice);
      }

      let roundedUnitSale = roundPrice(rawUnitSale, settings.roundTo, settings.roundMode);
      let roundedBoxSale = roundPrice(rawBoxSale, settings.roundTo, settings.roundMode);

      if (settings.preventLoss) {
        roundedUnitSale = Math.max(roundedUnitSale, before.unitCost);
        roundedBoxSale = Math.max(roundedBoxSale, before.boxPurchasePrice);
      }

      const shouldUpdate =
        Math.abs(roundedUnitSale - before.unitPrice) > epsilon ||
        Math.abs(roundedBoxSale - before.boxSalePrice) > epsilon;

      if (!shouldUpdate) continue;

      const updated = await prisma.product.update({
        where: { id: product.id },
        data: {
          price: roundedUnitSale,
          boxSalePrice: roundedBoxSale
        }
      });

      changedProductIds.push(product.id);
      const after = buildPricingSnapshot(updated);
      logs.push({
        id: `${Date.now()}-${product.id}-${Math.random().toString(36).slice(2, 8)}`,
        productId: product.id,
        productName: product.name || `#${product.id}`,
        source,
        mode: 'auto',
        note,
        createdAt: nowIso,
        before,
        after,
        calculation: {
          mode: settings.mode,
          oldBoxPurchasePrice: before.boxPurchasePrice,
          newBoxPurchasePrice: before.boxPurchasePrice,
          unitsPerBox: before.unitsPerBox,
          oldUnitCost: before.unitCost,
          newUnitCost: before.unitCost,
          unitMarkupPercent,
          boxMarkupPercent,
          rawUnitSale,
          roundedUnitSale,
          rawBoxSale,
          roundedBoxSale,
          roundTo: settings.roundTo,
          roundMode: settings.roundMode,
          preventLoss: settings.preventLoss
        }
      });
    }

    appendPricingLogs(logs);
    if (changedProductIds.length) {
      void syncProductsByIds(changedProductIds);
    }

    return { ok: true, updated: changedProductIds.length, skipped: false };
  } catch (e) {
    console.error('Failed to run auto pricing pass:', e);
    return { ok: false, error: String(e?.message || e), updated: 0 };
  }
}

// --- Auto Archive (Reports & Invoices) ---
const autoArchiveState = {
  enabled: false,
  retentionDays: 15,
  minKeepDays: 2,
  intervalId: null,
  isRunning: false,
  lastError: null,
  lastRunAt: null
};

function resolveArchiveDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;
  return Math.floor(parsed);
}

async function loadAutoArchiveConfigFromDb() {
  try {
    const prisma = await getPrisma();
    const keys = ['autoArchiveEnabled', 'autoArchiveRetentionDays'];
    const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
    const map = new Map(settings.map(s => [s.key, s.value]));
    autoArchiveState.enabled = map.get('autoArchiveEnabled') === 'true';
    autoArchiveState.retentionDays = resolveArchiveDays(map.get('autoArchiveRetentionDays'));
  } catch (e) {
    console.error('Failed to load auto archive settings:', e);
  }
}

function updateAutoArchiveSetting(key, value) {
  if (key === 'autoArchiveEnabled') autoArchiveState.enabled = value === 'true' || value === true;
  if (key === 'autoArchiveRetentionDays') autoArchiveState.retentionDays = resolveArchiveDays(value);
}

function scheduleAutoArchive() {
  if (autoArchiveState.intervalId) {
    clearInterval(autoArchiveState.intervalId);
    autoArchiveState.intervalId = null;
  }
  if (!autoArchiveState.enabled) return;
  autoArchiveState.intervalId = setInterval(() => {
    void runAutoArchive();
  }, 24 * 60 * 60 * 1000);
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function dateKey(value) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseArchiveDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const normalized = value.includes('T') ? value : `${value}T00:00:00`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function ensureArchiveDir() {
  const dir = path.join(app.getPath('userData'), 'archives');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function summarizeSalesByDate(sales) {
  const map = new Map();
  for (const sale of sales) {
    const key = dateKey(new Date(sale.createdAt));
    const prev = map.get(key) || { date: key, count: 0, total: 0, discount: 0, items: 0 };
    prev.count += 1;
    prev.total += Number(sale.total || 0);
    prev.discount += Number(sale.discount || 0);
    prev.items += Array.isArray(sale.items) ? sale.items.length : 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function summarizePurchasesByDate(invoices) {
  const map = new Map();
  for (const inv of invoices) {
    const dt = parseArchiveDate(inv.date || inv.createdAt);
    if (!dt) continue;
    const key = dateKey(dt);
    const prev = map.get(key) || { date: key, count: 0, total: 0 };
    prev.count += 1;
    prev.total += Number(inv.totalAmount || 0);
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function runAutoArchive(force = false) {
  if ((!autoArchiveState.enabled && !force) || autoArchiveState.isRunning) return;
  if (!force && isCashierWriteActive()) return;
  autoArchiveState.isRunning = true;
  try {
    const retentionDays = Math.max(autoArchiveState.minKeepDays, resolveArchiveDays(autoArchiveState.retentionDays));
    const cutoff = startOfDay(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000));

    const prisma = await getPrisma();

    // Archive sales + returns
    const oldSales = await prisma.sale.findMany({
      where: { createdAt: { lt: cutoff } },
      include: { items: true }
    });

    if (oldSales.length) {
      const saleIds = oldSales.map(s => s.id);
      const returns = await prisma.return.findMany({
        where: { saleId: { in: saleIds } },
        include: { items: true }
      });
      const archiveDir = ensureArchiveDir();
      const sortedDates = oldSales.map(s => dateKey(new Date(s.createdAt))).sort();
      const range = { from: sortedDates[0], to: sortedDates[sortedDates.length - 1] };
      const archivePayload = {
        type: 'sales',
        generatedAt: new Date().toISOString(),
        retentionDays,
        range,
        summaryByDate: summarizeSalesByDate(oldSales),
        sales: oldSales,
        returns
      };
      const fileName = `sales-archive-${range.from || 'unknown'}-${range.to || 'unknown'}-${Date.now()}.json`;
      fs.writeFileSync(path.join(archiveDir, fileName), JSON.stringify(archivePayload, null, 2), 'utf8');

      const returnIds = returns.map(r => r.id);
      await prisma.$transaction(async (tx) => {
        if (returnIds.length) {
          await tx.returnItem.deleteMany({ where: { returnId: { in: returnIds } } });
          await tx.return.deleteMany({ where: { id: { in: returnIds } } });
        }
        await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
        await tx.sale.deleteMany({ where: { id: { in: saleIds } } });
      });
    }

    // Purchase invoices are intentionally excluded from auto-archive
    // to preserve supplier accounting history.

    autoArchiveState.lastRunAt = new Date().toISOString();
    autoArchiveState.lastError = null;
  } catch (e) {
    autoArchiveState.lastError = String(e?.message || e);
    console.error('Auto archive failed:', e);
  } finally {
    autoArchiveState.isRunning = false;
  }
}

async function initAutoArchive() {
  await loadAutoArchiveConfigFromDb();
  scheduleAutoArchive();
  if (autoArchiveState.enabled) {
    void runAutoArchive();
  }
}

async function flushSyncQueue() {
  if (syncState.isFlushing) return;
  if (!syncState.enabled) return;
  if (!syncState.serverUrl || !syncState.storeId || !syncState.storeSecret) return;
  if (!syncState.queue.length) return;
  if (!networkState.isOnline) {
    console.log('[SYNC] ⚠️ تم الانتظار - لا يوجد اتصال بالإنترنت');
    return;
  }

  syncState.isFlushing = true;
  const batch = syncState.queue.slice(0, 200);
  const payload = { events: batch };
  try {
    const res = await fetchWithTimeout(`${syncState.serverUrl.replace(/\/$/, '')}/api/sync/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-store-id': syncState.storeId,
        'x-store-secret': syncState.storeSecret
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      
      // إذا كان الخطأ 401 (Unknown store)، لا تحاول رفع البيانات
      if (res.status === 401) {
        console.warn(`[SYNC] ⚠️ الخادم: لم يتعرف على المتجر - تخطي المزامنة (${text})`);
        // احتفظ بالبيانات في الطابور للمزامنة لاحقاً عند تصحيح بيانات المتجر
        return;
      }
      
      throw new Error(`Sync failed: ${res.status} ${text}`);
    }
    syncState.queue = syncState.queue.slice(batch.length);
    syncState.lastError = null;
    syncState.lastSuccessAt = new Date().toISOString();
    saveSyncQueue();
    console.log(`[SYNC] ✅ تم رفع ${batch.length} حدث بنجاح`);
  } catch (e) {
    const errorMsg = String(e.message || e);
    syncState.lastError = errorMsg;
    console.warn(`[SYNC] ⚠️ فشل الرفع: ${errorMsg}`);
    
    // إذا كان الخطأ متعلقًا بالشبكة أو انقطاع، حدّث حالة الاتصال
    if (errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('network')) {
      networkState.isOnline = false;
      console.log('[SYNC] 🔴 تم كشف انقطاع الشبكة من خلال خطأ المزامنة');
    }
  } finally {
    syncState.isFlushing = false;
  }
}

function enqueueSyncEvent(type, payload) {
  try {
    const event = {
      type,
      ts: new Date().toISOString(),
      payload
    };
    syncState.queue.push(event);
    if (syncState.queue.length > MAX_SYNC_QUEUE) {
      syncState.queue = syncState.queue.slice(syncState.queue.length - MAX_SYNC_QUEUE);
    }
    saveSyncQueue();
    void flushSyncQueue();
  } catch (e) {
    console.error('Failed to enqueue sync event:', e);
  }
}

function loadAppliedCommands() {
  if (!syncState.appliedCommandsPath) return;
  if (fs.existsSync(syncState.appliedCommandsPath)) {
    const raw = fs.readFileSync(syncState.appliedCommandsPath, 'utf8');
    const data = safeJsonParse(raw, []);
    if (Array.isArray(data)) syncState.appliedCommands = data;
  }
}

function saveAppliedCommands() {
  if (!syncState.appliedCommandsPath) return;
  try {
    fs.writeFileSync(syncState.appliedCommandsPath, JSON.stringify(syncState.appliedCommands, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write applied commands:', e);
  }
}

function hasAppliedCommand(commandId) {
  return syncState.appliedCommands.includes(commandId);
}

function rememberAppliedCommand(commandId) {
  if (!commandId) return;
  syncState.appliedCommands.push(commandId);
  if (syncState.appliedCommands.length > 5000) {
    syncState.appliedCommands = syncState.appliedCommands.slice(syncState.appliedCommands.length - 5000);
  }
  saveAppliedCommands();
}

function enqueueSyncEventsBulk(events) {
  try {
    if (!Array.isArray(events) || events.length === 0) return;
    syncState.queue.push(...events);
    if (syncState.queue.length > MAX_SYNC_QUEUE) {
      syncState.queue = syncState.queue.slice(syncState.queue.length - MAX_SYNC_QUEUE);
    }
    saveSyncQueue();
    void flushSyncQueue();
  } catch (e) {
    console.error('Failed to enqueue bulk sync events:', e);
  }
}

async function buildFullSyncEvents() {
  const events = [];
  const ts = new Date().toISOString();
  const prisma = await getPrisma();

  const categories = await prisma.category.findMany();
  categories.forEach(cat => {
    events.push({ type: 'category.upsert', ts, payload: cat });
  });

  const products = await prisma.product.findMany();
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  products.forEach(prod => {
    events.push({
      type: 'product.upsert',
      ts,
      payload: { ...prod, categoryName: categoryMap.get(prod.categoryId) || null }
    });
  });

  const users = await prisma.user.findMany({ select: { id: true, username: true, name: true, role: true, createdAt: true } });
  users.forEach(user => {
    events.push({ type: 'user.upsert', ts, payload: user });
  });

  const clients = await prisma.client.findMany();
  clients.forEach(client => {
    events.push({ type: 'client.upsert', ts, payload: client });
  });

  const debts = await prisma.debt.findMany();
  debts.forEach(debt => {
    events.push({ type: 'debt.upsert', ts, payload: debt });
  });

  const debtPayments = await prisma.debtPayment.findMany({ include: { user: { select: { id: true, name: true, username: true } } } });
  debtPayments.forEach(payment => {
    events.push({ type: 'debt.payment.upsert', ts, payload: payment });
  });

  const productsMap = new Map(products.map(p => [p.id, p.name]));
  const sales = await prisma.sale.findMany({
    include: { items: true, cashier: { select: { id: true, name: true, username: true } } }
  });
  sales.forEach(sale => {
    const items = (sale.items || []).map(item => ({
      ...item,
      product: { id: item.productId, name: productsMap.get(item.productId) || '' }
    }));
    events.push({ type: 'sale.create', ts, payload: { ...sale, items } });
  });

  const returns = await prisma.return.findMany({ include: { items: true } });
  returns.forEach(ret => {
    events.push({ type: 'return.create', ts, payload: ret });
  });

  const notes = await prisma.dailyNote.findMany();
  notes.forEach(note => {
    events.push({ type: 'dailyNote.upsert', ts, payload: note });
  });

  const activityLogs = await prisma.userActivityLog.findMany({
    include: { user: { select: { id: true, name: true, username: true } } }
  });
  activityLogs.forEach(log => {
    events.push({ type: 'activity.create', ts, payload: log });
  });

  try {
    const purchases = await prisma.purchaseInvoice.findMany({
      include: { items: true },
      orderBy: { timestamp: 'desc' }
    });
    purchases.forEach((invoice) => {
      const payload = mapPurchaseInvoiceRecord(invoice);
      if (payload) events.push({ type: 'purchase.invoice.create', ts, payload });
    });

    const supplierPayments = await prisma.supplierPayment.findMany({
      orderBy: { timestamp: 'desc' }
    });
    supplierPayments.forEach((payment) => {
      const payload = mapSupplierPaymentRecord(payment);
      if (payload) events.push({ type: 'supplier.payment.add', ts, payload });
    });
  } catch (e) {
    console.error('Failed to read purchase/supplier data for full sync:', e);
  }

  return events;
}

async function runFullSync() {
  const events = await buildFullSyncEvents();
  enqueueSyncEventsBulk(events);
  return { ok: true, count: events.length };
}

function normalizeLocalId(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function normalizeRecordId(value, fallbackPrefix = 'rec') {
  if (value === null || value === undefined || value === '') {
    return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return String(value);
}

function normalizePurchaseItemList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const productIdRaw = item?.productId ?? item?.product?.id ?? null;
      const productIdNum = Number(productIdRaw);
      const productId = Number.isFinite(productIdNum) ? productIdNum : null;
      const quantity = Number(item?.quantity ?? item?.qty ?? 0);
      const cost = Number(item?.cost ?? item?.purchasePrice ?? item?.price ?? item?.newCost ?? 0);
      const productName = item?.productName || item?.name || item?.product?.name || null;
      return {
        productId,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        productName: productName ? String(productName) : null
      };
    })
    .filter((item) => item.quantity !== 0 || item.productId !== null || item.productName);
}

function parsePurchaseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIsoDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function mapPurchaseInvoiceRecord(record) {
  if (!record) return null;
  const items = Array.isArray(record.items)
    ? record.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: Number(item.quantity || 0),
        cost: Number(item.cost || 0),
        price: Number(item.cost || 0),
        productName: item.productName || '',
        name: item.productName || ''
      }))
    : [];

  return {
    id: record.id,
    invoiceNumber: record.invoiceNumber || '',
    date: toIsoDateOnly(record.date),
    timestamp: record.timestamp ? new Date(record.timestamp).toISOString() : null,
    supplierName: record.supplierName || '',
    cashier: record.cashier || '',
    itemsCount: Number(record.itemsCount || items.length),
    totalAmount: Number(record.totalAmount || 0),
    items
  };
}

function mapSupplierPaymentRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    supplierName: record.supplierName || '',
    amount: Number(record.amount || 0),
    note: record.note || '',
    timestamp: record.timestamp ? new Date(record.timestamp).toISOString() : null,
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : null,
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null
  };
}

async function applyCategoryUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.categoryId);
  const data = {
    name: payload.name,
    description: payload.description ?? null,
    color: payload.color ?? null
  };
  let result;
  if (id) {
    result = await prisma.category.update({ where: { id }, data });
  } else {
    result = await prisma.category.create({ data });
  }
  enqueueSyncEvent('category.upsert', result);
  return result;
}

async function applyCategoryDelete(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.categoryId);
  if (!id) throw new Error('Missing category id');
  const deleted = await prisma.category.delete({ where: { id } });
  enqueueSyncEvent('category.delete', { id: deleted.id });
  return deleted;
}

async function applyProductUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.productId);
  let oldProduct = null;
  if (id) {
    try {
      oldProduct = await prisma.product.findUnique({ where: { id } });
    } catch (e) {}
  }
  const data = {
    name: payload.name,
    price: Number(payload.price ?? 0),
    stock: Number(payload.stock ?? 0),
    barcode: payload.barcode ?? null,
    unitsPerBox: payload.unitsPerBox ?? 1,
    boxPurchasePrice: Number(payload.boxPurchasePrice ?? 0),
    boxSalePrice: Number(payload.boxSalePrice ?? 0)
  };
  let resolvedCategoryId;
  try {
    if (payload.categoryId !== undefined && payload.categoryId !== null && payload.categoryId !== "") {
      const candidateId = Number(payload.categoryId);
      if (!Number.isNaN(candidateId)) {
        const cat = await prisma.category.findUnique({ where: { id: candidateId } });
        if (cat) resolvedCategoryId = cat.id;
      }
    }
    if (!resolvedCategoryId && payload.categoryName) {
      const cat = await prisma.category.findFirst({ where: { name: payload.categoryName } });
      if (cat) resolvedCategoryId = cat.id;
    }
  } catch (e) {}

  if (resolvedCategoryId !== undefined) {
    data.categoryId = resolvedCategoryId;
  }

  // If the unit sale price changed but incoming box sale is unchanged,
  // keep box sale synchronized to the new unit price.
  if (oldProduct) {
    const oldUnitPrice = toFiniteNumber(oldProduct.price, 0);
    const nextUnitPrice = toFiniteNumber(data.price, 0);
    const oldBoxSalePrice = toFiniteNumber(oldProduct.boxSalePrice, 0);
    const incomingBoxSalePrice = toFiniteNumber(data.boxSalePrice, oldBoxSalePrice);
    const unitChanged = Math.abs(nextUnitPrice - oldUnitPrice) > 0.0001;
    const boxUnchanged = Math.abs(incomingBoxSalePrice - oldBoxSalePrice) <= 0.0001;

    if (unitChanged && boxUnchanged) {
      data.boxSalePrice = computeLinkedBoxSalePrice(
        nextUnitPrice,
        data.unitsPerBox ?? oldProduct.unitsPerBox
      );
    }
  }

  let result;
  if (id) {
    try {
      result = await prisma.product.update({ where: { id }, data });
    } catch (e) {
      const code = e?.code || e?.name || "";
      const message = String(e?.message || "");
      if (code === "P2025" || message.includes("Record to update not found")) {
        result = await prisma.product.create({ data: { id: Number(id), ...data } });
      } else {
        throw e;
      }
    }
  } else {
    result = await prisma.product.create({ data });
  }

  if (oldProduct && shouldRefreshAutoPricingProfileBySaleChange(oldProduct, result)) {
    try {
      upsertAutoPricingProfileFromProduct(result, { source: 'server-product-edit' });
    } catch (e) {
      console.error('Failed to refresh auto pricing profile after server product sale edit:', e);
    }
  }

  if (oldProduct && data.stock !== undefined) {
    const oldStock = Number(oldProduct.stock);
    const newStock = Number(data.stock);
    if (!Number.isNaN(oldStock) && !Number.isNaN(newStock) && oldStock !== newStock) {
      try {
        const logDir = app.getPath('userData');
        const logPath = path.join(logDir, 'product-manual-logs.json');
        let logs = [];
        if (fs.existsSync(logPath)) {
          try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) {}
        }
        logs.unshift({
          productId: id,
          timestamp: new Date().toISOString(),
          oldStock,
          newStock,
          diff: newStock - oldStock,
          source: 'server',
          note: 'تعديل من الخادم'
        });
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
      } catch (e) {
        console.error("Failed to log server stock change:", e);
      }
    }
  }

  let categoryName = payload.categoryName || null;
  if (!categoryName && result.categoryId) {
    try {
      const cat = await prisma.category.findUnique({ where: { id: Number(result.categoryId) }, select: { name: true } });
        categoryName = cat?.name || null;
    } catch (e) {}
  }
  enqueueSyncEvent('product.upsert', { ...result, categoryName });

  if (oldProduct) {
    try {
      const pricingSettings = await loadAutoPricingSettingsFromDb();
      if (pricingSettings.enabled && pricingSettings.applyOnProductEdit) {
        const costChange = getCostChangeStats(oldProduct, result);
        if (shouldTriggerAutoPricingFromCostChange(costChange, pricingSettings.minCostChangePercent)) {
          const autoPricingResult = await runAutoPricingPass({
            productIds: [result.id],
            source: 'auto-pricing-server-product-edit',
            note: 'Auto pricing after server product cost update'
          });
          if (!autoPricingResult?.ok) {
            console.error('Auto pricing after server product edit failed:', autoPricingResult?.error);
          }
        }
      }
    } catch (e) {
      console.error('Failed to trigger auto pricing after server product update:', e);
    }
  }

  return result;
}

async function applyProductDelete(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.productId);
  if (!id) throw new Error('Missing product id');
  const deleted = await prisma.product.delete({ where: { id } });
  enqueueSyncEvent('product.delete', { id: deleted.id });
  return deleted;
}

async function applyClientUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.clientId);
  const data = {
    name: payload.name || payload.clientName,
    phone: payload.phone ?? null
  };
  let result;
  if (id) {
    result = await prisma.client.update({ where: { id }, data });
  } else {
    result = await prisma.client.create({ data });
  }
  enqueueSyncEvent('client.upsert', result);
  return result;
}

async function applyClientDelete(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.clientId);
  if (!id) throw new Error('Missing client id');
  const deleted = await prisma.client.delete({ where: { id } });
  enqueueSyncEvent('client.delete', { id: deleted.id });
  return deleted;
}

async function applyDebtUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.debtId);
  const data = {
    amount: Number(payload.amount ?? 0),
    reason: payload.reason ?? null,
    note: payload.note ?? null,
    clientId: payload.clientId ? Number(payload.clientId) : undefined,
    createdById: payload.createdById ? Number(payload.createdById) : undefined,
    paid: payload.paid ?? undefined,
    paidAt: payload.paidAt ? new Date(payload.paidAt) : undefined,
    dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined
  };
  let result;
  if (id) {
    result = await prisma.debt.update({ where: { id }, data });
  } else {
    result = await prisma.debt.create({ data });
  }
  enqueueSyncEvent('debt.upsert', result);
  return result;
}

async function applyDebtDelete(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.debtId);
  if (!id) throw new Error('Missing debt id');
  const deleted = await prisma.debt.delete({ where: { id } });
  enqueueSyncEvent('debt.delete', { id: deleted.id });
  return { id: deleted.id };
}

async function applyDebtPaymentUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.paymentId);
  const data = {
    debtId: payload.debtId ? Number(payload.debtId) : undefined,
    amount: Number(payload.amount ?? 0),
    note: payload.note ?? null,
    userId: payload.userId ? Number(payload.userId) : undefined
  };
  let result;
  if (id) {
    result = await prisma.debtPayment.update({ where: { id }, data, include: { user: { select: { id: true, name: true, username: true } } } });
  } else {
    if (!data.debtId) throw new Error('Missing debtId for payment');
    result = await prisma.debtPayment.create({ data, include: { user: { select: { id: true, name: true, username: true } } } });
  }
  enqueueSyncEvent('debt.payment.upsert', result);
  return result;
}

async function applyDebtMarkPaid(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.debtId);
  if (!id) throw new Error('Missing debt id');
  const updated = await prisma.debt.update({
    where: { id },
    data: {
      paid: true,
      paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date()
    }
  });
  enqueueSyncEvent('debt.upsert', updated);
  return updated;
}

async function updateSaleWithData(data) {
  const prisma = await getPrisma();
  const logDir = app.getPath('userData');
  const offersPath = path.join(logDir, 'product-offers.json');
  let offers = {};
  if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }

  return await prisma.$transaction(async (tx) => {
    const { saleId, items, discount, date, time, paymentMethod, clientId, clientName } = data;
    const currentSale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: { include: { product: true } } }
    });
    if (!currentSale) throw new Error("Sale not found");

    for (const item of currentSale.items) {
      await applySaleStockMovement(tx, offers, item.productId, item.quantity, 'increment');
    }

    await tx.saleItem.deleteMany({ where: { saleId } });

    let subTotal = 0;
    for (const item of items) {
      const qty = Number(item.quantity);
      const price = Number(item.price);
      subTotal += qty * price;

      await tx.saleItem.create({
        data: { saleId, productId: item.productId, quantity: qty, price }
      });

      await applySaleStockMovement(tx, offers, item.productId, qty, 'decrement');
    }

    const updateData = {
      total: subTotal - (Number(discount) || 0),
      discount: Number(discount) || 0,
      paymentMethod: paymentMethod || undefined,
      clientName: clientName !== undefined ? clientName : undefined
    };

    if (date) {
      const dateTimeStr = time ? `${date}T${time}` : date;
      const newDate = new Date(dateTimeStr);
      if (!isNaN(newDate.getTime())) updateData.createdAt = newDate;
    }

    const updatedSale = await tx.sale.update({
      where: { id: saleId },
      data: updateData,
      include: { items: true }
    });

    if (paymentMethod === 'debt' && clientId) {
      const existingDebt = await tx.debt.findFirst({
        where: { reason: `فاتورة مبيعات #${saleId}` }
      });
      if (existingDebt) {
        await tx.debt.update({
          where: { id: existingDebt.id },
          data: { amount: updatedSale.total, clientId: Number(clientId) }
        });
      } else {
        await tx.debt.create({
          data: {
            amount: updatedSale.total,
            reason: `فاتورة مبيعات #${saleId}`,
            note: 'تم تحويلها إلى دين بعد التعديل',
            clientId: Number(clientId),
            createdById: updatedSale.cashierId
          }
        });
      }
    }

    return updatedSale;
  });
}

async function applySaleUpdate(payload) {
  const saleId = normalizeLocalId(payload.saleId ?? payload.id ?? payload.localId);
  if (!saleId) throw new Error('Missing sale id');
  const items = Array.isArray(payload.items) ? payload.items.map(item => ({
    productId: Number(item.productId ?? item.product?.id),
    quantity: Number(item.quantity ?? item.qty ?? 0),
    price: Number(item.price ?? 0)
  })) : [];
  const data = {
    saleId,
    items,
    discount: Number(payload.discount ?? 0),
    paymentMethod: payload.paymentMethod,
    clientId: payload.clientId ? Number(payload.clientId) : undefined,
    clientName: payload.clientName,
    date: payload.date,
    time: payload.time
  };
  const updatedSale = await updateSaleWithData(data);
  let cashier = null;
  if (updatedSale?.cashierId) {
    try {
      const prisma = await getPrisma();
      cashier = await prisma.user.findUnique({
        where: { id: Number(updatedSale.cashierId) },
        select: { id: true, name: true, username: true }
      });
    } catch (e) {}
  }
  enqueueSyncEvent('sale.update', { ...updatedSale, cashier });
  if (updatedSale?.items?.length) {
    void syncProductsByIds(updatedSale.items.map(item => item.productId));
  }
  return updatedSale;
}

async function savePurchaseInvoiceWithData(data, { requireExisting = false } = {}) {
  const prisma = await getPrisma();
  const requestedId = data?.id ?? data?.localId ?? data?.invoiceId;
  const invoiceId = requestedId ? String(requestedId) : normalizeRecordId(null, 'purchase');
  const items = normalizePurchaseItemList(data?.items);
  const invoiceDate = parsePurchaseDate(data?.date);
  const timestamp = parsePurchaseDate(data?.timestamp ?? data?.createdAt ?? data?.date) || new Date();
  const supplierName = data?.supplierName ? String(data.supplierName) : (data?.supplier ? String(data.supplier) : null);
  const cashier = data?.cashier ? String(data.cashier) : (data?.cashierName ? String(data.cashierName) : null);
  const invoiceNumberRaw = data?.invoiceNumber ?? data?.number;
  const invoiceNumber = invoiceNumberRaw === null || invoiceNumberRaw === undefined || invoiceNumberRaw === '' ? null : String(invoiceNumberRaw);
  const totalAmount = Number(data?.totalAmount ?? data?.total ?? 0) || 0;
  const itemsCount = Number(data?.itemsCount ?? items.length) || items.length;
  const skipStock = data?.skipStock === true;

  let savedInvoice = null;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: { items: true }
      });

      if (requireExisting && !existing) {
        throw new Error('Purchase invoice not found');
      }

      if (!skipStock && existing?.items?.length) {
        for (const item of existing.items) {
          if (!item.productId) continue;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: Number(item.quantity || 0) } }
          }).catch(() => {});
        }
      }

      if (!skipStock && items.length) {
        for (const item of items) {
          if (!item.productId) continue;
          const updateData = { stock: { increment: Number(item.quantity || 0) } };
          if (item.cost !== undefined && item.cost !== null && item.cost !== '') {
            updateData.boxPurchasePrice = Number(item.cost || 0);
          }
          await tx.product.update({
            where: { id: item.productId },
            data: updateData
          });
        }
      }

      const mappedItemCreates = items.map((item, index) => ({
        id: normalizeRecordId(item.id, `${invoiceId}-item-${index + 1}`),
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity || 0),
        cost: Number(item.cost || 0)
      }));

      if (existing) {
        savedInvoice = await tx.purchaseInvoice.update({
          where: { id: invoiceId },
          data: {
            invoiceNumber,
            date: invoiceDate,
            timestamp,
            supplierName,
            cashier,
            itemsCount,
            totalAmount,
            items: {
              deleteMany: {},
              create: mappedItemCreates
            }
          },
          include: { items: true }
        });
      } else {
        savedInvoice = await tx.purchaseInvoice.create({
          data: {
            id: invoiceId,
            invoiceNumber,
            date: invoiceDate,
            timestamp,
            supplierName,
            cashier,
            itemsCount,
            totalAmount,
            items: {
              create: mappedItemCreates
            }
          },
          include: { items: true }
        });
      }
    });

    return { ok: true, record: mapPurchaseInvoiceRecord(savedInvoice) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), record: null };
  }
}

async function updatePurchaseInvoiceWithData(data) {
  const requestedId = data?.id ?? data?.localId ?? data?.invoiceId;
  if (!requestedId) {
    return { result: { ok: false, error: 'Purchase invoice not found' }, updatedRecord: null };
  }
  const saved = await savePurchaseInvoiceWithData(
    { ...data, id: String(requestedId) },
    { requireExisting: true }
  );
  if (!saved.ok) return { result: { ok: false, error: saved.error }, updatedRecord: null };
  return { result: { ok: true }, updatedRecord: saved.record };
}

async function applyPurchaseInvoiceCreate(payload) {
  const saved = await savePurchaseInvoiceWithData(payload, { requireExisting: false });
  if (!saved.ok) return { ok: false, error: saved.error };
  if (saved.record) {
    enqueueSyncEvent('purchase.invoice.create', saved.record);
    void syncProductsByIds((saved.record.items || []).map((item) => item.productId));
  }
  return { ok: true };
}

async function applyPurchaseInvoiceUpdate(payload) {
  const requestedId = payload?.id ?? payload?.localId ?? payload?.invoiceId;
  const saved = await savePurchaseInvoiceWithData({
    ...payload,
    id: requestedId ? String(requestedId) : undefined,
    items: Array.isArray(payload?.items) ? payload.items : []
  });
  if (!saved.ok) return { ok: false, error: saved.error };
  if (saved.record) {
    enqueueSyncEvent('purchase.invoice.update', saved.record);
    void syncProductsByIds((saved.record.items || []).map((item) => item.productId));
  }
  return { ok: true };
}

async function applyUserUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.userId);
  const data = {
    username: payload.username,
    name: payload.name ?? null,
    role: payload.role ?? 'cashier'
  };
  let result;
  if (id) {
    result = await prisma.user.update({ where: { id }, data });
  } else {
    if (!payload.password) throw new Error('Password required to create user');
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(payload.password, salt, 64);
    const hash = `${salt}:${derivedKey.toString("hex")}`;
    result = await prisma.user.create({ data: { ...data, passwordHash: hash } });
  }
  enqueueSyncEvent('user.upsert', result);
  return result;
}

async function applyDailyNoteUpsert(payload) {
  const prisma = await getPrisma();
  const id = normalizeLocalId(payload.id ?? payload.localId ?? payload.noteId);
  const data = {
    type: payload.type,
    amount: Number(payload.amount ?? 0),
    text: payload.text ?? '',
    noteDate: payload.noteDate ? new Date(payload.noteDate) : new Date()
  };
  let result;
  if (id) {
    result = await prisma.dailyNote.update({ where: { id }, data: { type: data.type, amount: data.amount, text: data.text } });
  } else {
    result = await prisma.dailyNote.create({ data });
  }
  enqueueSyncEvent('dailyNote.upsert', result);
  return result;
}

async function applySupplierPaymentAdd(payload) {
  const prisma = await getPrisma();
  const supplierName = String(payload?.supplierName || '').trim();
  if (!supplierName) {
    return { ok: false, error: 'supplierName is required' };
  }

  const id = normalizeRecordId(payload?.id ?? payload?.localId, 'supplier-payment');
  const payment = await prisma.supplierPayment.upsert({
    where: { id },
    create: {
      id,
      supplierName,
      amount: Number(payload?.amount || 0),
      note: payload?.note ? String(payload.note) : null,
      timestamp: parsePurchaseDate(payload?.timestamp ?? payload?.createdAt) || new Date()
    },
    update: {
      supplierName,
      amount: Number(payload?.amount || 0),
      note: payload?.note ? String(payload.note) : null,
      timestamp: parsePurchaseDate(payload?.timestamp ?? payload?.createdAt) || new Date()
    }
  });

  const mapped = mapSupplierPaymentRecord(payment);
  enqueueSyncEvent('supplier.payment.add', mapped);
  return { ok: true, payment: mapped };
}
async function applyRemoteCommand(command) {
  const payload = command?.payload || {};
  const type = command?.type;
  if (!type) throw new Error('Missing command type');

  switch (type) {
    case 'category.upsert':
      return applyCategoryUpsert(payload);
    case 'category.delete':
      return applyCategoryDelete(payload);
    case 'product.upsert':
      return applyProductUpsert(payload);
    case 'product.delete':
      return applyProductDelete(payload);
    case 'client.upsert':
      return applyClientUpsert(payload);
    case 'client.delete':
      return applyClientDelete(payload);
    case 'debt.upsert':
      return applyDebtUpsert(payload);
    case 'debt.delete':
      return applyDebtDelete(payload);
    case 'debt.payment.upsert':
      return applyDebtPaymentUpsert(payload);
    case 'debt.markPaid':
      return applyDebtMarkPaid(payload);
    case 'sale.update':
      return applySaleUpdate(payload);
    case 'purchase.invoice.create':
      return applyPurchaseInvoiceCreate(payload);
    case 'purchase.invoice.update':
      return applyPurchaseInvoiceUpdate(payload);
    case 'user.upsert':
      return applyUserUpsert(payload);
    case 'dailyNote.upsert':
      return applyDailyNoteUpsert(payload);
    case 'supplier.payment.add':
      return applySupplierPaymentAdd(payload);
    default:
      throw new Error(`Unsupported command type: ${type}`);
  }
}

async function pollSyncCommands() {
  if (syncState.isPollingCommands) return;
  if (!syncState.enabled) return;
  if (!syncState.serverUrl || !syncState.storeId || !syncState.storeSecret) return;
  if (isCashierWriteActive()) return;
  if (!networkState.isOnline) {
    console.log('[SYNC] ⚠️ تم الانتظار - لا يوجد اتصال بالإنترنت (polling)');
    return;
  }
  syncState.isPollingCommands = true;
  try {
    const res = await fetchWithTimeout(`${syncState.serverUrl.replace(/\/$/, '')}/api/sync/commands?limit=${SYNC_COMMAND_BATCH_SIZE}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-store-id': syncState.storeId,
        'x-store-secret': syncState.storeSecret
      }
    });
    if (!res.ok) {
      console.warn(`[SYNC] ⚠️ فشل polling: ${res.status}`);
      return;
    }
    const data = await res.json();
    const commands = Array.isArray(data?.commands) ? data.commands.slice(0, SYNC_COMMAND_BATCH_SIZE) : [];
    if (!commands.length) return;

    const results = [];
    for (let i = 0; i < commands.length; i += 1) {
      const cmd = commands[i];
      const commandId = cmd.commandId;
      if (hasAppliedCommand(commandId)) continue;
      try {
        let applied = false;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await applyRemoteCommand(cmd);
            applied = true;
            break;
          } catch (e) {
            lastError = e;
            if (!isSqliteBusy(e) || attempt >= 3) break;
            await sleep(250 * attempt);
          }
        }
        if (!applied) throw lastError || new Error('Failed to apply remote command');
        rememberAppliedCommand(commandId);
        results.push({ commandId, status: 'applied' });
      } catch (e) {
        if (isSqliteBusy(e)) {
          // Avoid fighting cashier writes; retry this command in next polling cycle.
          syncState.lastError = 'Sync paused: local database is busy.';
          break;
        }
        results.push({ commandId, status: 'failed', error: String(e?.message || e) });
      }
      if ((i + 1) % 3 === 0) {
        await sleep(10);
      }
    }

    if (results.length) {
      await fetchWithTimeout(`${syncState.serverUrl.replace(/\/$/, '')}/api/sync/commands/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': syncState.storeId,
          'x-store-secret': syncState.storeSecret
        },
        body: JSON.stringify({ results })
      });
      syncState.lastError = null;
      syncState.lastSuccessAt = new Date().toISOString();
    }
  } catch (e) {
    const errorMsg = String(e?.message || e);
    syncState.lastError = errorMsg;
    console.warn(`[SYNC] ⚠️ فشل polling: ${errorMsg}`);
    
    // إذا كان الخطأ متعلقًا بالشبكة أو انقطاع، حدّث حالة الاتصال
    if (errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('network')) {
      networkState.isOnline = false;
      console.log('[SYNC] 🔴 تم كشف انقطاع الشبكة من خلال خطأ polling');
    }
  } finally {
    syncState.isPollingCommands = false;
  }
}

async function initSyncAgent() {
  syncState.queuePath = path.join(app.getPath('userData'), 'sync-queue.json');
  syncState.appliedCommandsPath = path.join(app.getPath('userData'), 'sync-applied-commands.json');
  loadSyncQueue();
  loadAppliedCommands();
  await loadSyncConfigFromDb();
  if (!syncState.intervalId) {
    syncState.intervalId = setInterval(() => {
      void flushSyncQueue();
    }, 15000);
  }
  if (!syncState.commandIntervalId) {
    syncState.commandIntervalId = setInterval(() => {
      void pollSyncCommands();
    }, 20000);
  }
}

async function syncProductsByIds(productIds) {
  try {
    const ids = Array.from(new Set((productIds || []).map(id => Number(id)).filter(Boolean)));
    if (!ids.length) return;
    const prisma = await getPrisma();
    const products = await prisma.product.findMany({
      where: { id: { in: ids } }
    });
    const categoryIds = Array.from(new Set(products.map(p => p.categoryId).filter(Boolean)));
    let categoryMap = new Map();
    if (categoryIds.length) {
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true }
      });
      categoryMap = new Map(categories.map(c => [c.id, c.name]));
    }
    products.forEach(p => {
      enqueueSyncEvent('product.upsert', { ...p, categoryName: categoryMap.get(p.categoryId) || null });
    });
  } catch (e) {
    console.error('Failed to sync products:', e);
  }
}

async function ensureLegacySaleSchema(client) {
  try {
    const columns = await client.$queryRawUnsafe('PRAGMA table_info("Sale");');
    const columnNames = new Set(
      (Array.isArray(columns) ? columns : [])
        .map((col) => String(col?.name || '').trim())
        .filter(Boolean)
    );

    const alterStatements = [];
    if (!columnNames.has("paymentMethod")) {
      alterStatements.push(`ALTER TABLE "Sale" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'cash';`);
    }
    if (!columnNames.has("commission")) {
      alterStatements.push(`ALTER TABLE "Sale" ADD COLUMN "commission" REAL NOT NULL DEFAULT 0;`);
    }
    if (!columnNames.has("clientName")) {
      alterStatements.push(`ALTER TABLE "Sale" ADD COLUMN "clientName" TEXT;`);
    }
    if (!columnNames.has("cashierId")) {
      alterStatements.push(`ALTER TABLE "Sale" ADD COLUMN "cashierId" INTEGER;`);
    }

    for (const sql of alterStatements) {
      await client.$executeRawUnsafe(sql);
    }

    if (alterStatements.length) {
      console.log(`Applied Sale schema compatibility fixes: ${alterStatements.length}`);
    }
  } catch (e) {
    console.error("Failed to ensure legacy Sale schema compatibility:", e);
  }
}

async function ensurePurchaseSupplierSchema(client) {
  try {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PurchaseInvoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "invoiceNumber" TEXT,
        "date" DATETIME,
        "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "supplierName" TEXT,
        "cashier" TEXT,
        "itemsCount" INTEGER NOT NULL DEFAULT 0,
        "totalAmount" REAL NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PurchaseInvoiceItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "invoiceId" TEXT NOT NULL,
        "productId" INTEGER,
        "productName" TEXT,
        "quantity" REAL NOT NULL DEFAULT 0,
        "cost" REAL NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PurchaseInvoiceItem_invoiceId_fkey"
          FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupplierPayment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "supplierName" TEXT NOT NULL,
        "amount" REAL NOT NULL DEFAULT 0,
        "note" TEXT,
        "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseInvoice_timestamp_idx" ON "PurchaseInvoice"("timestamp");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseInvoice_date_idx" ON "PurchaseInvoice"("date");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseInvoice_supplierName_idx" ON "PurchaseInvoice"("supplierName");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseInvoiceItem_invoiceId_idx" ON "PurchaseInvoiceItem"("invoiceId");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseInvoiceItem_productId_idx" ON "PurchaseInvoiceItem"("productId");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierPayment_supplierName_idx" ON "SupplierPayment"("supplierName");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierPayment_timestamp_idx" ON "SupplierPayment"("timestamp");`);
  } catch (e) {
    console.error("Failed to ensure purchase/supplier schema compatibility:", e);
  }
}

async function ensureInvoiceChangeLogSchema(client) {
  try {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InvoiceChangeLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "invoiceType" TEXT NOT NULL,
        "invoiceId" TEXT NOT NULL,
        "userId" INTEGER,
        "userName" TEXT,
        "action" TEXT NOT NULL,
        "fieldName" TEXT,
        "oldValue" TEXT,
        "newValue" TEXT,
        "description" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const columns = await client.$queryRawUnsafe('PRAGMA table_info("InvoiceChangeLog");');
    const columnNames = new Set(
      (Array.isArray(columns) ? columns : [])
        .map((col) => String(col?.name || '').trim())
        .filter(Boolean)
    );
    const alterStatements = [];
    if (!columnNames.has("invoiceType")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "invoiceType" TEXT NOT NULL DEFAULT 'unknown';`);
    if (!columnNames.has("invoiceId")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "invoiceId" TEXT NOT NULL DEFAULT '';`);
    if (!columnNames.has("userId")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "userId" INTEGER;`);
    if (!columnNames.has("userName")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "userName" TEXT;`);
    if (!columnNames.has("action")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "action" TEXT NOT NULL DEFAULT 'update';`);
    if (!columnNames.has("fieldName")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "fieldName" TEXT;`);
    if (!columnNames.has("oldValue")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "oldValue" TEXT;`);
    if (!columnNames.has("newValue")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "newValue" TEXT;`);
    if (!columnNames.has("description")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "description" TEXT;`);
    if (!columnNames.has("createdAt")) alterStatements.push(`ALTER TABLE "InvoiceChangeLog" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;`);

    for (const sql of alterStatements) {
      await client.$executeRawUnsafe(sql);
    }

    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_invoiceType_idx" ON "InvoiceChangeLog"("invoiceType");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_invoiceId_idx" ON "InvoiceChangeLog"("invoiceId");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_userId_idx" ON "InvoiceChangeLog"("userId");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_createdAt_idx" ON "InvoiceChangeLog"("createdAt");`);
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_invoiceType_invoiceId_idx" ON "InvoiceChangeLog"("invoiceType", "invoiceId");`);
  } catch (e) {
    console.error("Failed to ensure invoice change log schema compatibility:", e);
  }
}

async function migrateLegacyPurchaseSupplierJson(client) {
  try {
    const logDir = app.getPath('userData');
    const purchasePath = path.join(logDir, 'purchase-invoices.json');
    const supplierPath = path.join(logDir, 'supplier-payments.json');

    const [purchaseCount, supplierCount] = await Promise.all([
      client.purchaseInvoice.count().catch(() => 0),
      client.supplierPayment.count().catch(() => 0)
    ]);

    if (purchaseCount === 0 && fs.existsSync(purchasePath)) {
      const raw = fs.readFileSync(purchasePath, 'utf8');
      const legacyInvoices = safeJsonParse(raw, []);
      if (Array.isArray(legacyInvoices) && legacyInvoices.length) {
        await client.$transaction(async (tx) => {
          for (let index = 0; index < legacyInvoices.length; index += 1) {
            const inv = legacyInvoices[index] || {};
            const id = normalizeRecordId(inv.id ?? inv.localId ?? inv.invoiceId ?? `legacy-${index}`, 'legacy-purchase');
            const items = normalizePurchaseItemList(inv.items ?? inv.purchaseItems ?? inv.products ?? []);
            const invoiceDate = parsePurchaseDate(inv.date);
            const timestamp = parsePurchaseDate(inv.timestamp ?? inv.createdAt ?? inv.date) || new Date();
            const invoiceNumber = inv.invoiceNumber ?? inv.number ?? null;
            const supplierName = inv.supplierName ?? inv.supplier ?? null;
            const cashier = inv.cashier ?? inv.cashierName ?? null;
            const totalAmount = Number(inv.totalAmount ?? inv.total ?? 0) || 0;
            const itemsCount = Number(inv.itemsCount ?? items.length) || items.length;

            await tx.purchaseInvoice.upsert({
              where: { id },
              create: {
                id,
                invoiceNumber: invoiceNumber ? String(invoiceNumber) : null,
                date: invoiceDate,
                timestamp,
                supplierName: supplierName ? String(supplierName) : null,
                cashier: cashier ? String(cashier) : null,
                totalAmount,
                itemsCount,
                items: {
                  create: items.map((item) => ({
                    id: normalizeRecordId(item.id, `legacy-pi-item-${index}`),
                    productId: item.productId,
                    productName: item.productName,
                    quantity: Number(item.quantity || 0),
                    cost: Number(item.cost || 0)
                  }))
                }
              },
              update: {
                invoiceNumber: invoiceNumber ? String(invoiceNumber) : null,
                date: invoiceDate,
                timestamp,
                supplierName: supplierName ? String(supplierName) : null,
                cashier: cashier ? String(cashier) : null,
                totalAmount,
                itemsCount,
                items: {
                  deleteMany: {},
                  create: items.map((item) => ({
                    id: normalizeRecordId(item.id, `legacy-pi-item-${index}`),
                    productId: item.productId,
                    productName: item.productName,
                    quantity: Number(item.quantity || 0),
                    cost: Number(item.cost || 0)
                  }))
                }
              }
            });
          }
        });
        console.log(`Migrated legacy purchase invoices JSON -> SQLite: ${legacyInvoices.length}`);
        try {
          const backupPath = `${purchasePath}.migrated.bak`;
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(purchasePath, backupPath);
          }
          fs.writeFileSync(purchasePath, '[]', 'utf8');
        } catch (backupErr) {
          console.warn('Failed to backup/clear legacy purchase invoices JSON:', backupErr);
        }
      }
    }

    if (supplierCount === 0 && fs.existsSync(supplierPath)) {
      const raw = fs.readFileSync(supplierPath, 'utf8');
      const legacyPayments = safeJsonParse(raw, []);
      if (Array.isArray(legacyPayments) && legacyPayments.length) {
        await client.$transaction(async (tx) => {
          for (let index = 0; index < legacyPayments.length; index += 1) {
            const pay = legacyPayments[index] || {};
            const id = normalizeRecordId(pay.id ?? pay.localId ?? `legacy-${index}`, 'legacy-supplier-payment');
            const supplierName = String(pay.supplierName || '').trim();
            if (!supplierName) continue;

            await tx.supplierPayment.upsert({
              where: { id },
              create: {
                id,
                supplierName,
                amount: Number(pay.amount || 0),
                note: pay.note ? String(pay.note) : null,
                timestamp: parsePurchaseDate(pay.timestamp ?? pay.createdAt) || new Date()
              },
              update: {
                supplierName,
                amount: Number(pay.amount || 0),
                note: pay.note ? String(pay.note) : null,
                timestamp: parsePurchaseDate(pay.timestamp ?? pay.createdAt) || new Date()
              }
            });
          }
        });
        console.log(`Migrated legacy supplier payments JSON -> SQLite: ${legacyPayments.length}`);
        try {
          const backupPath = `${supplierPath}.migrated.bak`;
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(supplierPath, backupPath);
          }
          fs.writeFileSync(supplierPath, '[]', 'utf8');
        } catch (backupErr) {
          console.warn('Failed to backup/clear legacy supplier payments JSON:', backupErr);
        }
      }
    }
  } catch (e) {
    console.error('Failed to migrate legacy purchase/supplier JSON data:', e);
  }
}

async function ensureCorePrismaSchema(client) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "Category" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "color" TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS "Product" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "price" REAL NOT NULL,
      "stock" INTEGER NOT NULL,
      "barcode" TEXT,
      "unitsPerBox" INTEGER NOT NULL DEFAULT 1,
      "boxPurchasePrice" REAL NOT NULL DEFAULT 0,
      "boxSalePrice" REAL NOT NULL DEFAULT 0,
      "categoryId" INTEGER,
      CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "username" TEXT NOT NULL,
      "name" TEXT,
      "passwordHash" TEXT NOT NULL,
      "role" TEXT DEFAULT 'cashier',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "Sale" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "total" REAL NOT NULL,
      "discount" REAL NOT NULL DEFAULT 0,
      "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
      "commission" REAL NOT NULL DEFAULT 0,
      "clientName" TEXT,
      "cashierId" INTEGER,
      CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "SaleItem" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "saleId" INTEGER NOT NULL,
      "productId" INTEGER NOT NULL,
      "quantity" INTEGER NOT NULL,
      "price" REAL NOT NULL,
      CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "Return" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "saleId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "cashierId" INTEGER,
      CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Return_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "ReturnItem" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "returnId" INTEGER NOT NULL,
      "productId" INTEGER NOT NULL,
      "quantity" INTEGER NOT NULL,
      "price" REAL NOT NULL,
      CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "Client" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "phone" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "Debt" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "amount" REAL NOT NULL,
      "note" TEXT,
      "reason" TEXT,
      "dueDate" DATETIME,
      "paid" BOOLEAN NOT NULL DEFAULT false,
      "paidAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "clientId" INTEGER NOT NULL,
      "createdById" INTEGER,
      CONSTRAINT "Debt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Debt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "DebtPayment" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "amount" REAL NOT NULL,
      "note" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "debtId" INTEGER NOT NULL,
      "userId" INTEGER,
      CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DebtPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "DailyNote" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "type" TEXT NOT NULL,
      "amount" REAL NOT NULL,
      "text" TEXT NOT NULL,
      "noteDate" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "ChickenLegDay" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "date" DATETIME NOT NULL,
      "startingStock" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "ChickenLegLog" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL,
      "note" TEXT,
      "logDate" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "dayId" INTEGER NOT NULL,
      CONSTRAINT "ChickenLegLog_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ChickenLegDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "UserActivityLog" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "userId" INTEGER NOT NULL,
      "action" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "PurchaseInvoice" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceNumber" TEXT,
      "date" DATETIME,
      "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "supplierName" TEXT,
      "cashier" TEXT,
      "itemsCount" INTEGER NOT NULL DEFAULT 0,
      "totalAmount" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "PurchaseInvoiceItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceId" TEXT NOT NULL,
      "productId" INTEGER,
      "productName" TEXT,
      "quantity" REAL NOT NULL DEFAULT 0,
      "cost" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PurchaseInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS "SupplierPayment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "supplierName" TEXT NOT NULL,
      "amount" REAL NOT NULL,
      "note" TEXT,
      "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "InvoiceChangeLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceType" TEXT NOT NULL,
      "invoiceId" TEXT NOT NULL,
      "userId" INTEGER,
      "userName" TEXT,
      "action" TEXT NOT NULL,
      "fieldName" TEXT,
      "oldValue" TEXT,
      "newValue" TEXT,
      "description" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "AppSetting" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "value" TEXT,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "TelegramBotSetting" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "userId" INTEGER NOT NULL,
      "botToken" TEXT NOT NULL,
      "chatId" TEXT NOT NULL,
      "scope" TEXT NOT NULL DEFAULT 'user',
      "label" TEXT,
      "cashierChatId" TEXT,
      "ownerChatId" TEXT,
      "cashierUserId" INTEGER,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TelegramBotSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChickenLegDay_date_key" ON "ChickenLegDay"("date");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "TelegramBotSetting_userId_key" ON "TelegramBotSetting"("userId");`,
    `CREATE INDEX IF NOT EXISTS "TelegramBotSetting_scope_idx" ON "TelegramBotSetting"("scope");`,
    `CREATE INDEX IF NOT EXISTS "TelegramBotSetting_cashierUserId_idx" ON "TelegramBotSetting"("cashierUserId");`,
    `CREATE INDEX IF NOT EXISTS "TelegramBotSetting_enabled_idx" ON "TelegramBotSetting"("enabled");`,
    `CREATE INDEX IF NOT EXISTS "UserActivityLog_userId_idx" ON "UserActivityLog"("userId");`,
    `CREATE INDEX IF NOT EXISTS "UserActivityLog_createdAt_idx" ON "UserActivityLog"("createdAt");`,
    `CREATE INDEX IF NOT EXISTS "UserActivityLog_userId_createdAt_idx" ON "UserActivityLog"("userId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PurchaseInvoice_timestamp_idx" ON "PurchaseInvoice"("timestamp");`,
    `CREATE INDEX IF NOT EXISTS "PurchaseInvoice_date_idx" ON "PurchaseInvoice"("date");`,
    `CREATE INDEX IF NOT EXISTS "PurchaseInvoice_supplierName_idx" ON "PurchaseInvoice"("supplierName");`,
    `CREATE INDEX IF NOT EXISTS "PurchaseInvoiceItem_invoiceId_idx" ON "PurchaseInvoiceItem"("invoiceId");`,
    `CREATE INDEX IF NOT EXISTS "PurchaseInvoiceItem_productId_idx" ON "PurchaseInvoiceItem"("productId");`,
    `CREATE INDEX IF NOT EXISTS "SupplierPayment_supplierName_idx" ON "SupplierPayment"("supplierName");`,
    `CREATE INDEX IF NOT EXISTS "SupplierPayment_timestamp_idx" ON "SupplierPayment"("timestamp");`,
    `CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_invoiceType_idx" ON "InvoiceChangeLog"("invoiceType");`,
    `CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_invoiceId_idx" ON "InvoiceChangeLog"("invoiceId");`,
    `CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_userId_idx" ON "InvoiceChangeLog"("userId");`,
    `CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_createdAt_idx" ON "InvoiceChangeLog"("createdAt");`,
    `CREATE INDEX IF NOT EXISTS "InvoiceChangeLog_invoiceType_invoiceId_idx" ON "InvoiceChangeLog"("invoiceType", "invoiceId");`
  ];

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }
}

async function getPrisma() {
  if (prismaInstance) return prismaInstance;
  if (!prismaInitPromise) {
    prismaInitPromise = (async () => {
      const { LitePrismaLikeClient } = require('./sqlite-client.cjs');
      const client = new LitePrismaLikeClient({
        datasources: {
          db: {
            url: `file:${dbPath}`,
          },
        },
      });
      try {
        await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        await client.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
        await client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
      } catch (e) {
        console.error('Failed to set SQLite pragmas:', e);
      }
      await ensureCorePrismaSchema(client);
      await ensureLegacySaleSchema(client);
      await ensurePurchaseSupplierSchema(client);
      await ensureInvoiceChangeLogSchema(client);
      await migrateLegacyPurchaseSupplierJson(client);
      prismaInstance = client;
      return client;
    })();
  }
  return prismaInitPromise;
}

async function resetPrismaConnection() {
  try {
    const client = prismaInstance || (await prismaInitPromise?.catch(() => null));
    if (client) {
      await client.$disconnect().catch(() => {});
    }
  } finally {
    prismaInstance = null;
    prismaInitPromise = null;
  }
}

function isSqliteBusy(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('sqlite_busy') ||
    msg.includes('database is locked') ||
    msg.includes('database is busy') ||
    msg.includes('timed out during query execution')
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withSqliteRetry(operationName, task, { maxRetries = SQLITE_BUSY_MAX_RETRIES } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      if (!isSqliteBusy(err) || attempt >= maxRetries) {
        throw err;
      }
      const waitMs = SQLITE_BUSY_RETRY_DELAY_MS * attempt;
      console.warn(`${operationName} retry ${attempt}/${maxRetries} بسبب انشغال قاعدة البيانات`);
      await sleep(waitMs);
    }
  }
  throw new Error(`${operationName} failed`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SYNC_HTTP_TIMEOUT_MS) {
  for (let attempt = 0; attempt <= SYNC_HTTP_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (e) {
      if (e?.name === 'AbortError') {
        if (attempt < SYNC_HTTP_MAX_RETRIES) {
          await sleep(SYNC_HTTP_RETRY_DELAY_MS);
          continue;
        }
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function createWindow() {
  // محاولة جلب اسم المركز من قاعدة البيانات لتعيينه كعنوان للنافذة
  let appTitle = "CRO P";
  try {
    const prisma = await getPrisma();
    const setting = await prisma.appSetting.findUnique({ where: { key: 'storeName' } });
    if (setting && setting.value) {
      appTitle = setting.value;
    }
  } catch (e) {
    console.error("Failed to fetch app title:", e);
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: appTitle,
    icon: path.join(__dirname, "icons", "icon.ico"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) {
    win.loadURL("http://localhost:8080"); // Vite dev server
    // win.webContents.openDevTools();
  } else {
    // Try multiple candidate locations for the built renderer when packaged.
    const candidates = [
      path.join(__dirname, "..", "dist", "index.html"),
      path.join(__dirname, "dist", "index.html"),
      path.join(process.resourcesPath || '', "app", "dist", "index.html"),
      path.join(process.resourcesPath || '', "dist", "index.html")
    ];
    console.log('Renderer load candidates:', candidates);

    let loaded = false;
    for (const target of candidates) {
      try {
        if (target && fs.existsSync(target)) {
          console.log('Loading renderer from:', target);
          await win.loadFile(target);
          loaded = true;
          break;
        }
      } catch (err) {
        console.error('Failed to load candidate', target, err);
      }
    }

    if (!loaded) {
      const errMsg = `Could not find any renderer index.html. Tried:\n${candidates.join('\n')}`;
      console.error(errMsg);
      try {
        const logDir = app.getPath('userData');
        const logPath = path.join(logDir, 'app-load-error.log');
        fs.appendFileSync(logPath, new Date().toISOString() + ' | ' + errMsg + '\n', 'utf8');
      } catch (e) {
        console.error('Failed to write load error log:', e);
      }
      try {
        dialog.showErrorBox('Application Error', 'تعذر تحميل واجهة المستخدم. تحقق من ملفات التثبيت. راجع ملف السجل app-load-error.log في مجلد التطبيق.');
      } catch (e) {
        console.error('Could not show error dialog:', e);
      }
      // Show a minimal error page so DevTools can be opened and inspected
      try {
        await win.loadURL('data:text/html,<h2>خطأ في تحميل التطبيق</h2><pre>' + encodeURIComponent(errMsg) + '</pre>');
      } catch (e) {
        console.error('Failed to load fallback error page:', e);
      }
    }

    // Open DevTools in production builds to inspect white screen issues
    // try {
    //   win.webContents.openDevTools({ mode: 'undocked' });
    // } catch (e) {
    //   console.warn('Could not open DevTools:', e);
    // }
  }
  // Send current update status to the renderer
  pushUpdateState({});
}

app.whenReady().then(async () => {
  console.log(`Using database at: ${dbPath}`);
  
  // بدء مراقبة الاتصال بالإنترنت
  initNetworkMonitoring();
  
  const backupsDir = path.resolve(__dirname, '..', 'backups');
  console.log(`Backups directory: ${backupsDir}`);
  let startupDbInitError = null;

  // List available backup files to verify full_debts.json presence
  try {
    if (fs.existsSync(backupsDir)) {
      const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json'));
      console.log('Available backup files:', files);

    }
  } catch (e) {
    console.error('Failed to list backups:', e);
  }

  // --- إصلاح مشكلة قاعدة البيانات في النسخة المبنية ---
  if (!isDev) {
    try {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // إذا لم يكن ملف قاعدة البيانات موجوداً في بيانات المستخدم، قم بنسخه من ملفات التطبيق
      if (!hasUsableDbFile(dbPath)) {
        const bundledDbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
        const resourcesDbPath = path.join(process.resourcesPath, 'prisma', 'dev.db');
        const localBackupDbPath = getLocalDbBackupPath(dbPath);
        const legacyDbPath = getLegacyDbPath(dbPath);
        const hasLocalBackupDb = hasUsableDbFile(localBackupDbPath);
        const hasLegacyDb = hasUsableDbFile(legacyDbPath);

        if ((hasLocalBackupDb || hasLegacyDb) && !ALLOW_STARTUP_DB_SOURCE_SWITCH) {
          throw new Error(
            "Preserve mode is ON. Detected existing cashier database in another path. " +
            "To prevent any replacement, startup migration is blocked. " +
            "Set ALLOW_STARTUP_DB_SOURCE_SWITCH=true only if you explicitly want migration."
          );
        }

        if (ALLOW_STARTUP_DB_SOURCE_SWITCH && hasLocalBackupDb) {
          console.log(`Initializing DB: Restoring from local backup ${localBackupDbPath}`);
          copySqliteBundle(localBackupDbPath, dbPath);
        } else if (ALLOW_STARTUP_DB_SOURCE_SWITCH && hasLegacyDb) {
          console.log(`Initializing DB: Migrating from legacy userData ${legacyDbPath}`);
          copySqliteBundle(legacyDbPath, dbPath);
        } else if (hasUsableDbFile(resourcesDbPath)) {
          console.log(`Initializing DB: Copying from resources path ${resourcesDbPath}`);
          copySqliteBundle(resourcesDbPath, dbPath);
        } else if (hasUsableDbFile(bundledDbPath)) {
          console.log(`Initializing DB: Copying from bundled path ${bundledDbPath}`);
          copySqliteBundle(bundledDbPath, dbPath);
        } else {
          console.warn("Warning: Bundled database not found. App will start with empty DB (tables might be missing).");
        }
      }
    } catch (err) {
      console.error("Error initializing database:", err);
      startupDbInitError = err;
    }
  }

  if (startupDbInitError) {
    dialog.showErrorBox(
      "Database Safety Guard",
      `Startup stopped to protect cashier data.\n\n${String(startupDbInitError?.message || startupDbInitError)}`
    );
    app.quit();
    return;
  }
  // ---------------------------------------------------

  createWindow();

  // --- التأكد من وجود حساب المدير عند بدء التشغيل (إصلاح تلقائي) ---
  try {
    const prisma = await getPrisma();
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!admin) {
      console.log('Admin user missing on startup. Recreating default admin...');
      const salt = randomBytes(16).toString("hex");
      const derivedKey = await scryptAsync("admin", salt, 64);
      const hash = `${salt}:${derivedKey.toString("hex")}`;
      await prisma.user.create({
        data: { username: "admin", name: "المدير", passwordHash: hash, role: "admin" }
      });
    }
  } catch (e) { console.error("Error ensuring admin user:", e); }

  initAutoUpdater();

  void (async () => {
    try {
      await initSyncAgent();
    } catch (e) {
      console.error('Failed to init sync agent:', e);
    }

    try {
      await initAutoArchive();
    } catch (e) {
      console.error('Failed to init auto archive:', e);
    }

    try {
      await restartTelegramBots();
    } catch (e) {
      console.error('Failed to init Telegram bots:', e);
    }

    try {
      await fixDebtReasonEncoding();
    } catch (e) {
      console.error('Failed to run debt reason fix:', e);
    }
  })();

  // Server process is disabled as we use IPC now
  // if (!isDev) {
  //   // In production, fork the server process.
  //   const serverPath = path.join(process.resourcesPath, "app", "server", "index.cjs");
  //   serverProcess = fork(serverPath);
  //   serverProcess.on('message', (msg) => {
  //     console.log('[Server Process]', msg);
  //   });
  // }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    if (activeUserId) {
      try {
        const prisma = await getPrisma();
        const created = await prisma.userActivityLog.create({
          data: { userId: Number(activeUserId), action: 'logout (system exit)' },
          include: { user: { select: { id: true, name: true, username: true } } }
        });
        enqueueSyncEvent('activity.create', created);
        activeUserId = null;
      } catch (e) {
        console.error("Failed to log system exit:", e);
      }
    }
    if (prismaInstance) {
      prismaInstance.$disconnect().catch(console.error);
    }
    app.quit();
    // Terminate the server process if it exists
    // if (serverProcess) {
    //   serverProcess.kill();
    // }
  }
});

// --- IPC Handlers ---

ipcMain.handle("authenticate-user", async (event, { username, password }) => {
  try {
    if (isDeveloperLogin(username, password)) {
      activeUserId = null;
      return { ok: true, user: DEVELOPER_LOGIN.user };
    }

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      console.log(`Authentication failed: User '${username}' not found.`);
      return { ok: false, error: "Invalid credentials" };
    }
    // Verify using passwordHash field (matches schema/seed)
    const [salt, storedHash] = user.passwordHash.split(':');
    const derivedKey = await scryptAsync(password, salt, 64);
    const derivedHash = derivedKey.toString("hex");
    if (derivedHash !== storedHash) {
      return { ok: false, error: "Invalid credentials" };
    }
    // Log using 'action' field (matches schema)
    const createdLog = await prisma.userActivityLog.create({
      data: { userId: user.id, action: 'login' },
      include: { user: { select: { id: true, name: true, username: true } } }
    });
    enqueueSyncEvent('activity.create', createdLog);
    activeUserId = user.id;
    return {
      ok: true,
      user: { id: user.id, username: user.username, name: user.name, role: user.role }
    };
  } catch (error) {
    console.error("Authentication error:", error);
    // تسجيل الخطأ في ملف خارجي للمساعدة في التشخيص
    try {
      const logPath = path.join(app.getPath('userData'), 'auth-error.log');
      fs.appendFileSync(logPath, `${new Date().toISOString()} - ${error.message}\n${error.stack}\n`);
    } catch (e) {}
    return { ok: false, error: `حدث خطأ في النظام: ${error.message}` };
  }
});

ipcMain.handle('list-categories', async () => {
  const prisma = await getPrisma();
  return await prisma.category.findMany({
    select: { id: true, name: true, description: true, color: true }
  });
});

ipcMain.handle('list-products', async () => {
  const prisma = await getPrisma();
    const products = await prisma.product.findMany({
      select: {
        id: true, name: true, price: true, stock: true, barcode: true,
        unitsPerBox: true, boxPurchasePrice: true, boxSalePrice: true,
        categoryId: true,
        category: { select: { name: true } }
      }
    });

    // جلب البدائل من الملف
    const logDir = app.getPath('userData');
    const altPath = path.join(logDir, 'product-alternatives.json');
    let alternatives = {};
    if (fs.existsSync(altPath)) {
        try { alternatives = JSON.parse(fs.readFileSync(altPath, 'utf8')); } catch(e) {}
    }

    // جلب العروض من الملف (لأن قاعدة البيانات قد لا تدعم الحقول الجديدة)
    const offersPath = path.join(logDir, 'product-offers.json');
    let offers = {};
    if (fs.existsSync(offersPath)) {
        try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {}
    }

    return products.map(p => ({
      ...p,
      categoryName: p.category?.name || null,
      alternativeProductId: alternatives[String(p.id)] || null,
      isOffer: offers[String(p.id)]?.isOffer || false,
      offerUnderlyingProductId: offers[String(p.id)]?.offerUnderlyingProductId || null,
      offerUnderlyingProductQuantity: offers[String(p.id)]?.offerUnderlyingProductQuantity || null,
      packageItems: normalizeOfferPackageItems(offers[String(p.id)])
    }));
});

ipcMain.handle('upsert-product', async (event, product) => {
  beginCashierWrite();
  try {
    console.log('[LOCAL_WRITE] upsert-product start', {
      id: product?.id ?? null,
      name: product?.name ?? null
    });
    const prisma = await getPrisma();
    let data = {
      name: product.name,
      price: product.price,
      stock: product.stock,
      barcode: product.barcode || null,
      unitsPerBox: product.unitsPerBox,
      boxPurchasePrice: product.boxPurchasePrice,
      boxSalePrice: product.boxSalePrice
    };

    if (product.categoryId !== undefined && product.categoryId !== null && product.categoryId !== "") {
      data.category = { connect: { id: Number(product.categoryId) } };
    }
    
    // Fallback: only look up by name if ID is missing (legacy support)
    if (!data.category && product.categoryName) {
      try {
        const cats = await prisma.category.findMany({
          where: { name: product.categoryName },
          take: 1
        });
        if (cats.length > 0) data.category = { connect: { id: cats[0].id } };
      } catch (e) {
        console.error("Category lookup failed:", e);
      }
    }
    if (product.id) {
      let oldProduct = null;
      // --- تسجيل التعديلات اليدوية للمخزون (Tracking) ---
      try {
        oldProduct = await prisma.product.findUnique({ where: { id: product.id } });
        if (oldProduct && data.stock !== undefined) {
          const oldStock = Number(oldProduct.stock);
          const newStock = Number(data.stock);
          if (oldStock !== newStock) {
            const logDir = app.getPath('userData');
            const logPath = path.join(logDir, 'product-manual-logs.json');
            let logs = [];
            if (fs.existsSync(logPath)) {
              try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) {}
            }
            logs.unshift({ productId: product.id, timestamp: new Date().toISOString(), oldStock, newStock, diff: newStock - oldStock });
            fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
          }
        }
      } catch (e) { console.error("Failed to log stock change:", e); }
      if (!data.category) {
        data.category = { disconnect: true };
      }

      // If user changed unit sale price and left box sale untouched,
      // auto-derive box sale from unit price and units per box.
      if (oldProduct) {
        const oldUnitPrice = toFiniteNumber(oldProduct.price, 0);
        const nextUnitPrice = toFiniteNumber(data.price, 0);
        const oldBoxSalePrice = toFiniteNumber(oldProduct.boxSalePrice, 0);
        const incomingBoxSalePrice = toFiniteNumber(data.boxSalePrice, oldBoxSalePrice);
        const unitChanged = Math.abs(nextUnitPrice - oldUnitPrice) > 0.0001;
        const boxUnchanged = Math.abs(incomingBoxSalePrice - oldBoxSalePrice) <= 0.0001;

        if (unitChanged && boxUnchanged) {
          data.boxSalePrice = computeLinkedBoxSalePrice(
            nextUnitPrice,
            data.unitsPerBox ?? oldProduct.unitsPerBox
          );
        }
      }

      // --------------------------------------------------
      const updated = await prisma.product.update({
        where: { id: product.id },
        data
      });

      let categoryName = product.categoryName || null;
      if (!categoryName && updated.categoryId) {
        try {
          const cat = await prisma.category.findUnique({
            where: { id: Number(updated.categoryId) },
            select: { name: true }
          });
          categoryName = cat?.name || null;
        } catch (e) {}
      }
      enqueueSyncEvent('product.upsert', { ...updated, categoryName });
      
      // حفظ بيانات العرض في ملف JSON
      const logDir = app.getPath('userData');
      const offersPath = path.join(logDir, 'product-offers.json');
      let offers = {};
      if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }
      
      if (product.isOffer) {
        const packageItems = Array.isArray(product.packageItems) ? product.packageItems : [];
        offers[String(updated.id)] = {
          isOffer: true,
          offerUnderlyingProductId: product.offerUnderlyingProductId ? Number(product.offerUnderlyingProductId) : null,
          offerUnderlyingProductQuantity: product.offerUnderlyingProductQuantity ? Number(product.offerUnderlyingProductQuantity) : null,
          packageItems: packageItems
            .map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity) }))
            .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && Number.isFinite(item.quantity) && item.quantity > 0)
        };
      } else {
        if (offers[String(updated.id)]) delete offers[String(updated.id)];
      }
      fs.writeFileSync(offersPath, JSON.stringify(offers, null, 2));

      if (oldProduct && shouldRefreshAutoPricingProfileBySaleChange(oldProduct, updated)) {
        try {
          upsertAutoPricingProfileFromProduct(updated, { source: 'manual-product-edit' });
        } catch (e) {
          console.error('Failed to refresh auto pricing profile after manual product sale edit:', e);
        }
      }

      if (oldProduct) {
        try {
          const pricingSettings = await loadAutoPricingSettingsFromDb();
          if (pricingSettings.enabled && pricingSettings.applyOnProductEdit) {
            const costChange = getCostChangeStats(oldProduct, updated);
            if (shouldTriggerAutoPricingFromCostChange(costChange, pricingSettings.minCostChangePercent)) {
              const autoPricingResult = await runAutoPricingPass({
                productIds: [updated.id],
                source: 'auto-pricing-manual-product-edit',
                note: 'Auto pricing after manual product cost update'
              });
              if (!autoPricingResult?.ok) {
                console.error('Auto pricing after manual product edit failed:', autoPricingResult?.error);
              }
            }
          }
        } catch (e) {
          console.error('Failed to trigger auto pricing after manual product update:', e);
        }
      }

      console.log('[LOCAL_WRITE] upsert-product done', { id: updated?.id ?? null });
      return updated;
    } else {
      const created = await prisma.product.create({ data });

      let categoryName = product.categoryName || null;
      if (!categoryName && created.categoryId) {
        try {
          const cat = await prisma.category.findUnique({
            where: { id: Number(created.categoryId) },
            select: { name: true }
          });
          categoryName = cat?.name || null;
        } catch (e) {}
      }
      enqueueSyncEvent('product.upsert', { ...created, categoryName });
      
      // حفظ بيانات العرض في ملف JSON للمنتج الجديد
      if (product.isOffer) {
        const logDir = app.getPath('userData');
        const offersPath = path.join(logDir, 'product-offers.json');
        let offers = {};
        if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }
        
        const packageItems = Array.isArray(product.packageItems) ? product.packageItems : [];
        offers[String(created.id)] = {
          isOffer: true,
          offerUnderlyingProductId: product.offerUnderlyingProductId ? Number(product.offerUnderlyingProductId) : null,
          offerUnderlyingProductQuantity: product.offerUnderlyingProductQuantity ? Number(product.offerUnderlyingProductQuantity) : null,
          packageItems: packageItems
            .map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity) }))
            .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && Number.isFinite(item.quantity) && item.quantity > 0)
        };
        fs.writeFileSync(offersPath, JSON.stringify(offers, null, 2));
      }
      console.log('[LOCAL_WRITE] upsert-product done', { id: created?.id ?? null });
      return created;
    }
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('set-product-alternative', async (event, { productId, alternativeId }) => {
  const logDir = app.getPath('userData');
  const altPath = path.join(logDir, 'product-alternatives.json');
  let alternatives = {};
  if (fs.existsSync(altPath)) {
    try { alternatives = JSON.parse(fs.readFileSync(altPath, 'utf8')); } catch (e) {}
  }

  const pId = String(productId);
  const aId = alternativeId ? String(alternativeId) : null;
  if (aId && aId === pId) {
    throw new Error('Cannot set product as its own alternative');
  }

  // Keep one mapping direction only: sourceProduct -> alternativeProduct.
  // This allows multiple source products to use the same alternative.
  if (aId) {
    alternatives[pId] = aId;
    // Cleanup legacy reverse entry from old one-to-one behavior, if present.
    if (alternatives[aId] === pId) delete alternatives[aId];
  } else {
    delete alternatives[pId];
  }

  fs.writeFileSync(altPath, JSON.stringify(alternatives, null, 2));
  return { ok: true };
});
ipcMain.handle('get-product-history', async (event, productId) => {
  const prisma = await getPrisma();
  const pId = Number(productId);
  const history = [];

  try {
    // 1. المبيعات المباشرة
    const sales = await prisma.saleItem.findMany({
      where: { productId: pId },
      include: { sale: true }
    });
    sales.forEach(item => {
      history.push({
        type: 'sale',
        date: item.sale.createdAt,
        quantity: -Number(item.quantity),
        price: Number(item.price),
        ref: item.sale.id,
        note: `فاتورة مبيعات #${item.sale.id}`
      });
    });

    // 1.5 المبيعات عبر العروض (إذا كان هذا المنتج جزءاً من عرض)
    const logDir = app.getPath('userData');
    const offersPath = path.join(logDir, 'product-offers.json');
    if (fs.existsSync(offersPath)) {
      try {
        const offers = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
        // البحث عن العروض التي تعتمد على هذا المنتج
        const offerIds = Object.keys(offers).filter(key => {
            const offer = offers[key];
            return offer.isOffer && Number(offer.offerUnderlyingProductId) === pId;
        }).map(Number);

        if (offerIds.length > 0) {
            const offerSales = await prisma.saleItem.findMany({
                where: { productId: { in: offerIds } },
                include: { sale: true, product: { select: { name: true } } }
            });

            offerSales.forEach(item => {
                const offer = offers[String(item.productId)];
                const qtyDeducted = Number(item.quantity) * Number(offer.offerUnderlyingProductQuantity);
                
                history.push({
                    type: 'sale',
                    date: item.sale.createdAt,
                    quantity: -qtyDeducted,
                    price: Number(item.price),
                    ref: item.sale.id,
                    note: `مباع ضمن عرض: ${item.product?.name || 'عرض'} (فاتورة #${item.sale.id})`
                });
            });
        }
      } catch (e) { console.error("Error reading offers for history:", e); }
    }

    // 2. المرتجعات
    const returns = await prisma.returnItem.findMany({
      where: { productId: pId },
      include: { return: true }
    });
    returns.forEach(item => {
      history.push({
        type: 'return',
        date: item.return.createdAt,
        quantity: Number(item.quantity),
        price: Number(item.price),
        ref: item.return.id,
        note: `مرتجع مبيعات #${item.return.id}`
      });
    });

    // 3. المشتريات (من SQLite)
    try {
      const purchases = await prisma.purchaseInvoiceItem.findMany({
        where: { productId: pId },
        include: {
          invoice: {
            select: { invoiceNumber: true, date: true, timestamp: true }
          }
        }
      });
      purchases.forEach((item) => {
        history.push({
          type: 'purchase',
          date: item.invoice?.date || item.invoice?.timestamp || item.createdAt,
          quantity: Number(item.quantity || 0),
          price: Number(item.cost || 0),
          ref: item.invoice?.invoiceNumber || item.invoiceId,
          note: `فاتورة شراء #${item.invoice?.invoiceNumber || item.invoiceId}`
        });
      });
    } catch (e) {}

    // 4. التعديلات اليدوية (من ملف JSON)
    const manualLogPath = path.join(logDir, 'product-manual-logs.json');
    if (fs.existsSync(manualLogPath)) {
      try {
        const manualLogs = JSON.parse(fs.readFileSync(manualLogPath, 'utf8'));
        manualLogs.filter(l => Number(l.productId) === pId).forEach(log => {
          const diff = Number(log.diff);
          const isIncrease = diff > 0;
          const diffLabel = isIncrease ? `زيادة +${diff}` : `نقصان ${Math.abs(diff)}`;
          const isServer = log.source === 'server';
          const sourceLabel = isServer ? 'الخادم' : 'تعديل يدوي';
          const baseNote = log.note || 'تعديل المخزون';
          history.push({
            type: isServer ? 'server-adjustment' : 'adjustment',
            date: new Date(log.timestamp),
            quantity: diff,
            price: 0,
            ref: sourceLabel,
            note: `${baseNote}: ${log.oldStock} -> ${log.newStock} (${diffLabel})`
          });
        });
      } catch (e) {}
    }

    // ترتيب حسب التاريخ (الأحدث أولاً)
    return history.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (e) {
    console.error("Error fetching product history:", e);
    return [];
  }
});

ipcMain.handle('delete-product', async (event, id) => {
  const prisma = await getPrisma();
  const deleted = await prisma.product.delete({ where: { id: Number(id) } });
  enqueueSyncEvent('product.delete', { id: deleted.id });
  return deleted;
});

ipcMain.handle('upsert-category', async (event, category) => {
  const prisma = await getPrisma();
    const data = {
      name: category.name,
      description: category.description || null,
      color: category.color
    };
    if (category.id && Number.isInteger(Number(category.id))) {
      const updated = await prisma.category.update({
        where: { id: Number(category.id) },
        data
      });
      enqueueSyncEvent('category.upsert', updated);
      return updated;
    } else {
      const created = await prisma.category.create({ data });
      enqueueSyncEvent('category.upsert', created);
      return created;
    }
});

ipcMain.handle('delete-category', async (event, id) => {
  const prisma = await getPrisma();
  const deleted = await prisma.category.delete({ where: { id: Number(id) } });
  enqueueSyncEvent('category.delete', { id: deleted.id });
  return deleted;
});

ipcMain.handle('list-users', async () => {
  const prisma = await getPrisma();
  return await prisma.user.findMany({
    select: { id: true, username: true, name: true, role: true }
  });
});

ipcMain.handle('create-user', async (event, data) => {
  const prisma = await getPrisma();
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(data.password, salt, 64);
    const hash = `${salt}:${derivedKey.toString("hex")}`;
    const created = await prisma.user.create({
      data: {
        username: data.username,
        name: data.name,
        passwordHash: hash,
        role: data.role
      }
    });
    enqueueSyncEvent('user.upsert', created);
    return created;
});

ipcMain.handle('update-user', async (event, data) => {
  const prisma = await getPrisma();
    const updateData = {
      username: data.username,
      name: data.name,
      role: data.role
    };
    if (data.password) {
      const salt = randomBytes(16).toString("hex");
      const derivedKey = await scryptAsync(data.password, salt, 64);
      updateData.passwordHash = `${salt}:${derivedKey.toString("hex")}`;
    }
    const updated = await prisma.user.update({
      where: { id: data.id },
      data: updateData
    });
    enqueueSyncEvent('user.upsert', updated);
    return updated;
});

ipcMain.handle('delete-user', async (event, id) => {
  const prisma = await getPrisma();
  const deleted = await prisma.user.delete({ where: { id: Number(id) } });
  enqueueSyncEvent('user.delete', { id: deleted.id });
  return deleted;
});

ipcMain.handle('list-clients', async () => {
  const prisma = await getPrisma();
  return await prisma.client.findMany({
    orderBy: { name: 'asc' }
  });
});

ipcMain.handle('create-client', async (event, data) => {
  const prisma = await getPrisma();
  const created = await prisma.client.create({
    data: {
      name: data.clientName,
      phone: data.phone
    }
  });
  enqueueSyncEvent('client.upsert', created);
  return created;
});

ipcMain.handle('update-client', async (event, data) => {
  console.log('[LOCAL_WRITE] update-client start', {
    id: data?.id ?? null,
    name: data?.clientName ?? null
  });
  const prisma = await getPrisma();
  const updated = await prisma.client.update({
    where: { id: data.id },
    data: {
      name: data.clientName,
      phone: data.phone
    }
  });
  enqueueSyncEvent('client.upsert', updated);
  console.log('[LOCAL_WRITE] update-client done', { id: updated?.id ?? null });
  return updated;
});

ipcMain.handle('delete-client', async (event, { id }) => {
  const prisma = await getPrisma();
  const deleted = await prisma.client.delete({ where: { id } });
  enqueueSyncEvent('client.delete', { id: deleted.id });
  return deleted;
});

ipcMain.handle('list-debts', async () => {
  const prisma = await getPrisma();
  try {
    console.log(`Fetching debts from database (${dbPath})...`);
    const debts = await prisma.debt.findMany({
      include: {
        client: true,
        payments: {
          // تم تصحيح العلاقة هنا لتكون 'user' بدلاً من 'createdBy' حسب ملف schema.prisma
          include: { user: { select: { id: true, name: true, username: true } } },
          orderBy: { createdAt: 'desc' }
        },
        createdBy: { select: { id: true, name: true, username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Found ${debts.length} debts`);
    const totalAmount = debts.reduce((sum, d) => sum + Number(d.amount), 0);
    console.log(`Total debt amount in DB: ${totalAmount}`);
    return debts;
  } catch (error) {
    console.error('Error fetching debts:', error);
    throw error;
  }
});

ipcMain.handle('create-debt', async (event, data) => {
  const prisma = await getPrisma();
    const created = await prisma.debt.create({
      data: {
        amount: data.amount,
        reason: data.reason,
        note: data.note,
        clientId: data.clientId,
        createdById: data.actorId
      }
    });
    enqueueSyncEvent('debt.upsert', created);
    return created;
});

ipcMain.handle('update-debt', async (event, data) => {
  const prisma = await getPrisma();
    const updated = await prisma.debt.update({
      where: { id: data.id },
      data: {
        amount: data.amount,
        reason: data.reason,
        note: data.note
      }
    });
    enqueueSyncEvent('debt.upsert', updated);
    return updated;
});

ipcMain.handle('add-debt-payment', async (event, data) => {
  const prisma = await getPrisma();
    let userIdToUse = data.userId ?? null;
    if (!userIdToUse) {
      try {
        const recent = await prisma.userActivityLog.findFirst({
          where: { action: 'login' },
          orderBy: { createdAt: 'desc' },
          include: { user: true }
        });
        if (recent && recent.user) userIdToUse = recent.user.id;
      } catch (e) {
        // ignore and leave userIdToUse as null
      }
    }

    const created = await prisma.debtPayment.create({
      data: {
        debtId: data.debtId,
        amount: data.amount,
        note: data.note,
        userId: userIdToUse ?? null
      },
      include: { user: { select: { id: true, name: true, username: true } } }
    });
    enqueueSyncEvent('debt.payment.upsert', created);

    // Persist a simple log entry for debugging: payment creation details
    try {
      const logDir = app.getPath('userData');
      const logPath = path.join(logDir, 'app-payments.log');
      const when = new Date().toISOString();
      const entry = `${when} | add-debt-payment | debtId=${data.debtId} | amount=${data.amount} | userIdUsed=${userIdToUse} | createdId=${created.id} | user=${created.user ? (created.user.name || created.user.username) : 'null'}\n`;
      fs.appendFileSync(logPath, entry, { encoding: 'utf8' });
    } catch (e) {
      console.error('Failed to write payment log:', e);
    }

    return created;
});

ipcMain.handle('update-debt-payment', async (event, data) => {
  const prisma = await getPrisma();
    const updated = await prisma.debtPayment.update({
      where: { id: data.id },
      data: {
        amount: data.amount,
        note: data.note,
        userId: data.userId ?? undefined
      },
      include: { user: { select: { id: true, name: true, username: true } } }
    });
    enqueueSyncEvent('debt.payment.upsert', updated);
    return updated;
});

ipcMain.handle('assign-debt-payment-user', async (event, { paymentId, userId }) => {
  const prisma = await getPrisma();
    const updated = await prisma.debtPayment.update({
      where: { id: Number(paymentId) },
      data: { userId: userId != null ? Number(userId) : null },
      include: { user: { select: { id: true, name: true, username: true } } }
    });
    enqueueSyncEvent('debt.payment.upsert', updated);
    return updated;
});

ipcMain.handle('mark-debt-paid', async (event, { id, userId }) => {
  const prisma = await getPrisma();
    const debt = await prisma.debt.findUnique({
      where: { id },
      include: { payments: true }
    });
    if (!debt) throw new Error("Debt not found");

    const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Number(debt.amount) - paid;

    let createdPayment = null;
    if (remaining > 0) {
      createdPayment = await prisma.debtPayment.create({
        data: {
          debtId: id,
          amount: remaining,
          note: "Full settlement",
          userId: userId
        }
      });
    }
    if (createdPayment) enqueueSyncEvent('debt.payment.upsert', createdPayment);
    enqueueSyncEvent('debt.markPaid', { id, paidAt: new Date().toISOString() });
    return { ok: true };
});

ipcMain.handle('create-sale', async (event, data) => {
  beginCashierWrite();
  try {
    console.log('[LOCAL_WRITE] create-sale start', {
      items: Array.isArray(data?.items) ? data.items.length : 0,
      paymentMethod: data?.paymentMethod ?? null,
      clientId: data?.clientId ?? null
    });
    const prisma = await getPrisma();
    // تحميل بيانات العروض من الملف
    const logDir = app.getPath('userData');
    const offersPath = path.join(logDir, 'product-offers.json');
    let offers = {};
    if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }

    // استخدام Transaction لضمان تكامل البيانات: إنشاء الفاتورة وخصم المخزون كعملية واحدة
      const startTime = Date.now();
  const maxRetries = 3;
  let sale;
  let createdDebt = null;
  let createdClient = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      sale = await prisma.$transaction(async (tx) => {
        const subTotal = data.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = Math.max(0, subTotal - (Number(data.discount) || 0));
        const amountReceived = Number(data.amountReceived || 0);
        const hasPartialPayment = amountReceived > 0 && amountReceived < total;
        let debtAmount = 0;
        if (hasPartialPayment) {
          debtAmount = total - amountReceived;
        } else if (data.paymentMethod === 'debt' && amountReceived <= 0) {
          debtAmount = total;
        }
        
        const sale = await tx.sale.create({
          data: {
            total,
            discount: data.discount || 0,
            paymentMethod: data.paymentMethod,
            cashierId: data.cashierId,
            clientName: data.clientName || null,
            items: {
              create: data.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
              }))
            }
          },
          include: { items: { include: { product: true } }, cashier: { select: { id: true, name: true, username: true } } }
        });
        
        if (debtAmount > 0) {
          let debtClientId = data.clientId ? Number(data.clientId) : null;
          if (!debtClientId) {
            const name = String(data.clientName || '').trim();
            if (!name) {
              throw new Error('يرجى إدخال اسم العميل عند دفع جزء من الفاتورة.');
            }
            const existing = await tx.client.findFirst({ where: { name } });
            if (existing) {
              debtClientId = existing.id;
            } else {
              const newClient = await tx.client.create({ data: { name } });
              createdClient = newClient;
              debtClientId = newClient.id;
            }
          }
          const note = hasPartialPayment ? `دفعة جزئية، المستلم: ${amountReceived}` : 'تم تسجيلها كدين من نقطة البيع';
          createdDebt = await tx.debt.create({
            data: {
              amount: debtAmount,
              reason: `${SALE_DEBT_PREFIX}${sale.id}`,
              note,
              clientId: debtClientId,
              createdById: data.cashierId
            }
          });
        }
        
        for (const item of data.items) {
          await applySaleStockMovement(tx, offers, item.productId, item.quantity, 'decrement');
        }
        return sale;
      }, { maxWait: 2000, timeout: 15000 });
      break;
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (isSqliteBusy(err) && attempt < maxRetries) {
        console.warn(`create-sale retry ${attempt}/${maxRetries} due to busy database: ${msg}`);
        await sleep(400 * attempt);
        continue;
      }
      console.error('[LOCAL_WRITE] create-sale failed:', err);
      throw err;
    }
  }
  if (Date.now() - startTime > 3000) {
    console.warn(`create-sale slow: ${Date.now() - startTime}ms`);
  }
  if (!sale) throw new Error('Sale creation failed');
  if (createdClient) enqueueSyncEvent('client.upsert', createdClient);
  if (createdDebt) enqueueSyncEvent('debt.upsert', createdDebt);
  
  // Log the sales invoice creation
  if (sale?.id) {
    const prisma = await getPrisma();
    await logInvoiceChange(prisma, {
      invoiceType: 'sale',
      invoiceId: sale.id,
      userId: activeUserId,
      userName: data?.userName || 'Unknown',
      action: 'create',
      description: `تم إنشاء فاتورة بيع جديدة - المجموع: ${sale.total}`,
      fieldName: 'invoice',
      oldValue: null,
      newValue: JSON.stringify({ 
        total: sale.total,
        discount: data?.discount || 0,
        itemsCount: data?.items?.length || 0,
        paymentMethod: data?.paymentMethod,
        clientName: data?.clientName,
        createdAt: new Date().toISOString()
      })
    });
  }
  
  enqueueSyncEvent('sale.create', sale);
  if (sale?.items?.length) {
    void syncProductsByIds(sale.items.map(item => item.productId));
  }
    console.log('[LOCAL_WRITE] create-sale done', {
      saleId: sale?.id ?? null,
      total: sale?.total ?? null
    });
    return sale;
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('list-sales', async (event, options = {}) => {
  const prisma = await getPrisma();
    const queryOptions = {
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            price: true,
            product: {
              select: {
                name: true,
                boxPurchasePrice: true,
                unitsPerBox: true
              }
            }
          }
        },
        cashier: { select: { id: true, name: true, username: true } },
        returns: {
          select: {
            id: true,
            createdAt: true,
            items: {
              select: {
                productId: true,
                quantity: true,
                price: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    };

    // إذا تم تمرير limit، استخدمه. وإلا استخدم 500 كقيمة افتراضية (للحفاظ على أداء القوائم العادية)
    // إذا تم تمرير limit بقيمة كبيرة (مثل 0 أو -1 أو رقم كبير) سيتم جلب الكل أو العدد المحدد
    const requestedLimit = Number(options?.limit);
    if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
       queryOptions.take = Math.min(Math.trunc(requestedLimit), 100000);
    } else {
       queryOptions.take = 500;
    }

    const requestedOffset = Number(options?.offset);
    if (Number.isFinite(requestedOffset) && requestedOffset > 0) {
      queryOptions.skip = Math.trunc(requestedOffset);
    }

    const sales = await prisma.sale.findMany({
      ...queryOptions
    });

    // جلب الديون لربط العملاء بالفواتير الآجلة (حل بديل لعدم وجود علاقة مباشرة في قاعدة البيانات)
        const debts = await prisma.debt.findMany({
      where: { reason: { startsWith: SALE_DEBT_PREFIX } },
      include: { client: true, payments: true }
    });

    const saleDebtMap = new Map();
    for (const d of debts) {
      const match = String(d.reason || '').match(/(\d+)/);
      if (match && match[1]) {
        saleDebtMap.set(match[1], d);
      }
    }

    return sales.map(s => {
      const debt = saleDebtMap.get(String(s.id));
      const total = Number(s.total || 0);
      let debtRemaining = 0;
      let amountReceived = total;
      if (debt) {
        const paid = (debt.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        debtRemaining = Math.max(0, Number(debt.amount || 0) - paid);
        amountReceived = Math.max(0, total - debtRemaining);
      }
      return {
        ...s,
        client: debt?.client || null,
        debtOriginalAmount: debt ? Number(debt.amount || 0) : 0,
        debtRemaining,
        amountReceived
      };
    });
});

ipcMain.handle('update-sale', async (event, data) => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    // تحميل بيانات العروض من الملف
    const logDir = app.getPath('userData');
    const offersPath = path.join(logDir, 'product-offers.json');
    let offers = {};
    if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }
    let deletedDebtId = null;

    const updatedSale = await withSqliteRetry('update-sale', () => prisma.$transaction(async (tx) => {
      const { saleId, items, discount, date, time, paymentMethod, clientId, clientName } = data;
      const amountReceived = Math.max(0, Number(data.amountReceived || 0));

      // 1. جلب الفاتورة الحالية لإعادة المخزون
      const currentSale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: { include: { product: true } } }
      });

      if (!currentSale) throw new Error("Sale not found");

      // 2. إعادة الكميات القديمة للمخزون
      for (const item of currentSale.items) {
        await applySaleStockMovement(tx, offers, item.productId, item.quantity, 'increment');
      }

      // 3. حذف العناصر القديمة
      await tx.saleItem.deleteMany({ where: { saleId } });

      // 4. إنشاء العناصر الجديدة وخصم المخزون
      let subTotal = 0;
      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.price);
        subTotal += qty * price;

        await tx.saleItem.create({
          data: { saleId, productId: item.productId, quantity: qty, price }
        });

        await applySaleStockMovement(tx, offers, item.productId, qty, 'decrement');
      }

      // 5. تحديث رأس الفاتورة (الإجمالي والخصم)
      const updateData = {
        total: Math.max(0, subTotal - (Number(discount) || 0)),
        discount: Number(discount) || 0,
        paymentMethod: paymentMethod || undefined,
        clientName: clientName !== undefined ? clientName : undefined
      };

      if (date) {
        const dateTimeStr = time ? `${date}T${time}` : date;
        const newDate = new Date(dateTimeStr);
        if (!isNaN(newDate.getTime())) updateData.createdAt = newDate;
      }

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: updateData,
        include: { items: true }
      });

      const debtReason = `${SALE_DEBT_PREFIX}${saleId}`;
      const existingDebt = await tx.debt.findFirst({
        where: { reason: debtReason }
      });
      const updatedTotal = Math.max(0, Number(updatedSale.total || 0));
      const hasPartialPayment = amountReceived > 0 && amountReceived < updatedTotal;
      const nextDebtAmount = hasPartialPayment
        ? Math.max(0, updatedTotal - amountReceived)
        : (paymentMethod === 'debt' ? updatedTotal : 0);
      let resolvedClientId = clientId ? Number(clientId) : null;
      const normalizedClientName = String(clientName || '').trim();

      if (!resolvedClientId && normalizedClientName) {
        const existingClient = await tx.client.findFirst({ where: { name: normalizedClientName } });
        if (existingClient) {
          resolvedClientId = existingClient.id;
        } else {
          const createdClient = await tx.client.create({ data: { name: normalizedClientName } });
          resolvedClientId = createdClient.id;
        }
      }

      if (!resolvedClientId && existingDebt) {
        resolvedClientId = existingDebt.clientId;
      }

      // إدارة الدين عند تعديل الفاتورة:
      // 1) إذا أصبحت آجلة وبمبلغ صالح => upsert للدين
      // 2) إذا لم تعد آجلة أو أصبح المبلغ صفر => حذف الدين القديم (إن وجد)
      if ((paymentMethod === 'debt' || hasPartialPayment) && nextDebtAmount > 0) {
        if (!resolvedClientId) {
          throw new Error('يرجى اختيار عميل أو إدخال اسم عميل صالح للفواتير الآجلة.');
        }

        if (existingDebt) {
          await tx.debt.update({
            where: { id: existingDebt.id },
            data: {
              amount: nextDebtAmount,
              clientId: resolvedClientId,
              note: 'تم تحديث الدين بعد تعديل الفاتورة'
            }
          });
        } else {
          await tx.debt.create({
            data: {
              amount: nextDebtAmount,
              reason: debtReason,
              note: 'تم تحويلها إلى دين بعد التعديل',
              clientId: resolvedClientId,
              createdById: updatedSale.cashierId
            }
          });
        }
      } else if (existingDebt) {
        await tx.debt.delete({ where: { id: existingDebt.id } });
        deletedDebtId = existingDebt.id;
      }

      return updatedSale;
    }));
    
    // Log the sales invoice change
    if (updatedSale?.id) {
      await logInvoiceChange(await getPrisma(), {
        invoiceType: 'sale',
        invoiceId: updatedSale.id,
        userId: activeUserId,
        userName: data?.userName || 'Unknown',
        action: 'update',
        description: `تم تعديل فاتورة البيع - المجموع: ${updatedSale.total}`,
        fieldName: 'invoice',
        oldValue: null,
        newValue: JSON.stringify({ 
          total: updatedSale.total,
          discount: updatedSale.discount,
          itemsCount: updatedSale.items?.length || 0,
          paymentMethod: data?.paymentMethod,
          clientName: data?.clientName,
          updatedAt: new Date().toISOString()
        })
      });
    }
    
    let cashier = null;
    if (updatedSale?.cashierId) {
      try {
        cashier = await prisma.user.findUnique({
          where: { id: Number(updatedSale.cashierId) },
          select: { id: true, name: true, username: true }
        });
      } catch (e) {}
    }
    enqueueSyncEvent('sale.update', { ...updatedSale, cashier });
    if (updatedSale?.items?.length) {
      void syncProductsByIds(updatedSale.items.map(item => item.productId));
    }
    try {
      const debt = await prisma.debt.findFirst({
        where: { reason: `${SALE_DEBT_PREFIX}${data.saleId}` }
      });
      if (debt) {
        enqueueSyncEvent('debt.upsert', debt);
      } else if (deletedDebtId) {
        enqueueSyncEvent('debt.delete', { id: deletedDebtId });
      }
    } catch (e) {
      if (deletedDebtId) {
        enqueueSyncEvent('debt.delete', { id: deletedDebtId });
      }
    }
    return updatedSale;
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('create-return', async (event, data) => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    // تحميل بيانات العروض من الملف
    const logDir = app.getPath('userData');
    const offersPath = path.join(logDir, 'product-offers.json');
    let offers = {};
    if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }

    // Transaction لإنشاء المرتجع وإعادة الكميات للمخزون
    const ret = await withSqliteRetry('create-return', () => prisma.$transaction(async (tx) => {
      const ret = await tx.return.create({
        data: {
          saleId: data.saleId,
          items: {
            create: data.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price
            }))
          }
        },
        include: { items: true }
      });
      for (const item of data.items) {
        await applySaleStockMovement(tx, offers, item.productId, item.quantity, 'increment');
      }

      // تحديث الفاتورة الأصلية (خصم المواد المرجعة وتحديث الإجمالي)
      const sale = await tx.sale.findUnique({
        where: { id: data.saleId },
        include: { items: true }
      });

      if (sale) {
        let totalDeduction = 0;
        for (const returnItem of data.items) {
          const saleItem = sale.items.find(si => si.productId === returnItem.productId);
          if (saleItem) {
            const deduction = saleItem.price * returnItem.quantity;
            totalDeduction += deduction;
            
            const newQty = saleItem.quantity - returnItem.quantity;
            if (newQty > 0) {
              await tx.saleItem.update({
                where: { id: saleItem.id },
                data: { quantity: newQty }
              });
            } else {
              await tx.saleItem.delete({ where: { id: saleItem.id } });
            }
          }
        }

        const newTotal = sale.total - totalDeduction;
        await tx.sale.update({
          where: { id: data.saleId },
          data: { total: newTotal > 0 ? newTotal : 0 }
        });

        // تحديث الدين إذا كانت الفاتورة آجلة
        if (sale.paymentMethod === 'debt') {
          const debt = await tx.debt.findFirst({ where: { reason: `فاتورة مبيعات #${sale.id}` } });
          if (debt) {
            await tx.debt.update({ where: { id: debt.id }, data: { amount: newTotal > 0 ? newTotal : 0 } });
          }
        }
      }

      return ret;
    }));
    enqueueSyncEvent('return.create', ret);
    if (ret?.items?.length) {
      void syncProductsByIds(ret.items.map(item => item.productId));
    }
    try {
      const sale = await prisma.sale.findUnique({ where: { id: data.saleId } });
      if (sale?.paymentMethod === 'debt') {
        const debt = await prisma.debt.findFirst({
          where: { reason: `فاتورة مبيعات #${data.saleId}` }
        });
        if (debt) enqueueSyncEvent('debt.upsert', debt);
      }
    } catch (e) {}
    return ret;
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('list-returns', async () => {
  const prisma = await getPrisma();
    return await prisma.return.findMany({
      include: {
        items: { include: { product: true } },
        sale: true,
        cashier: true
      },
      orderBy: { createdAt: 'desc' }
    });
});

ipcMain.handle('list-daily-notes', async () => {
  const prisma = await getPrisma();
    return await prisma.dailyNote.findMany({ orderBy: { noteDate: 'desc' } });
});

ipcMain.handle('create-daily-note', async (event, data) => {
  const prisma = await getPrisma();
    // Expect data: { type, amount, text, date }
    const noteDate = data.date ? new Date(data.date) : new Date();
    const created = await prisma.dailyNote.create({
      data: {
        type: data.type,
        amount: Number(data.amount || 0),
        text: data.text || "",
        noteDate
      }
    });
    enqueueSyncEvent('dailyNote.upsert', created);
    return created;
});

ipcMain.handle('update-daily-note', async (event, data) => {
  const prisma = await getPrisma();
    const updated = await prisma.dailyNote.update({
      where: { id: Number(data.id) },
      data: {
        type: data.type,
        amount: Number(data.amount || 0),
        text: data.text || ""
      }
    });
    enqueueSyncEvent('dailyNote.upsert', updated);
    return updated;
});

ipcMain.handle('delete-daily-note', async (event, id) => {
  const prisma = await getPrisma();
    const deleted = await prisma.dailyNote.delete({ where: { id: Number(id) } });
    enqueueSyncEvent('dailyNote.delete', { id: deleted.id });
    return deleted;
});

ipcMain.handle('list-chicken-logs', async (event, { date }) => {
  const prisma = await getPrisma();
    // Normalize incoming date to start of day Date object
    let dayDate = date;
    if (typeof dayDate === 'string') {
      dayDate = new Date(dayDate);
    }
    if (dayDate instanceof Date && !isNaN(dayDate.getTime())) {
      dayDate.setHours(0, 0, 0, 0);
    } else {
      // invalid date, return empty
      return { startingStock: 0, logs: [] };
    }

    const day = await prisma.chickenLegDay.findUnique({ where: { date: dayDate } });
    let logs = [];
    if (day) {
      logs = await prisma.chickenLegLog.findMany({ where: { dayId: day.id } });
    }
    return { startingStock: day?.startingStock || 0, logs: logs || [] };
});

ipcMain.handle('set-chicken-day', async (event, { date, startingStock }) => {
  const prisma = await getPrisma();
    // Normalize date to start of day
    let dayDate = date;
    if (typeof dayDate === 'string') dayDate = new Date(dayDate);
    if (dayDate instanceof Date && !isNaN(dayDate.getTime())) dayDate.setHours(0, 0, 0, 0);
    else throw new Error('Invalid date');

    return await prisma.chickenLegDay.upsert({
      where: { date: dayDate },
      update: { startingStock },
      create: { date: dayDate, startingStock }
    });
});

ipcMain.handle('create-chicken-log', async (event, data) => {
  const prisma = await getPrisma();
    // Ensure day exists using normalized date
    let dayDate = data.date;
    if (typeof dayDate === 'string') dayDate = new Date(dayDate);
    if (dayDate instanceof Date && !isNaN(dayDate.getTime())) dayDate.setHours(0, 0, 0, 0);
    else throw new Error('Invalid date');

    const day = await prisma.chickenLegDay.upsert({
      where: { date: dayDate },
      update: {},
      create: { date: dayDate, startingStock: 0 }
    });
    return await prisma.chickenLegLog.create({
      data: {
        // Use the normalized Date object (start of day) so Prisma receives a proper DateTime
        logDate: dayDate,
        name: data.name,
        reason: data.reason,
        quantity: data.quantity,
        note: data.note,
        dayId: day.id
      }
    });
});

ipcMain.handle('create-user-activity-log', async (event, { userId, action }) => {
    if (action === 'logout') {
      activeUserId = null;
    }
    if (userId === null || userId === undefined || !Number.isFinite(Number(userId))) {
      return { ok: true };
    }
  const prisma = await getPrisma();
    const created = await prisma.userActivityLog.create({
      data: { userId: Number(userId), action },
      include: { user: { select: { id: true, name: true, username: true } } }
    });
    enqueueSyncEvent('activity.create', created);
    return { ok: true };
});

ipcMain.handle('get-last-sale', async () => {
  const prisma = await getPrisma();
    const lastSale = await prisma.sale.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: true } }
      }
    });

    if (!lastSale) return null;

    // محاولة العثور على الدين المرتبط للحصول على معرف العميل
    const debt = await prisma.debt.findFirst({
      where: { reason: `فاتورة مبيعات #${lastSale.id}` }
    });

  return { ...lastSale, clientId: debt ? debt.clientId : null };
});

function parseSaleIdentifier(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const id = Number(digits[digits.length - 1]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

ipcMain.handle('get-sale-by-id', async (event, saleIdentifier) => {
  const prisma = await getPrisma();
  const saleId = parseSaleIdentifier(saleIdentifier);
  if (!saleId) return null;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { product: true } }
    }
  });

  if (!sale) return null;

  const debt = await prisma.debt.findFirst({
    where: { reason: `${SALE_DEBT_PREFIX}${sale.id}` }
  });

  return { ...sale, clientId: debt ? debt.clientId : null };
});

// --- Factory Reset ---
ipcMain.handle('factory-reset', async () => {
  const prisma = await getPrisma();
  try {
    console.log('Factory reset requested. Clearing data...');

    // استخدام Transaction لضمان حذف البيانات بالترتيب الصحيح (لتجنب أخطاء العلاقات)
    // Use a single callback transaction for SQLite compatibility.
    await prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany();
      await tx.returnItem.deleteMany();
      await tx.debtPayment.deleteMany();
      await tx.chickenLegLog.deleteMany();
      await tx.userActivityLog.deleteMany();

      await tx.sale.deleteMany();
      await tx.return.deleteMany();
      await tx.debt.deleteMany();
      await tx.dailyNote.deleteMany();
      await tx.chickenLegDay.deleteMany();
      await tx.appSetting.deleteMany();

      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.client.deleteMany();

      await tx.user.deleteMany({
        where: {
          username: { not: 'admin' }
        }
      });
    });

    // التأكد من وجود حساب المدير، وإذا لم يكن موجوداً (تم حذفه سابقاً) نقوم بإنشائه
    const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!adminExists) {
      const salt = randomBytes(16).toString("hex");
      const derivedKey = await scryptAsync("admin", salt, 64);
      const hash = `${salt}:${derivedKey.toString("hex")}`;
      await prisma.user.create({
        data: { username: "admin", name: "المدير", passwordHash: hash, role: "admin" }
      });
    }

    // إعادة تشغيل التطبيق لتطبيق التغييرات وتنظيف الذاكرة
    await prisma.$disconnect();
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (e) {
    console.error("Factory reset failed:", e);
    return { ok: false, error: e.message };
  }
});

// --- App settings (key/value) stored in the database ---
ipcMain.handle('get-app-setting', async (event, key) => {
  const prisma = await getPrisma();
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
});

// --- App Updates ---
ipcMain.handle('get-update-status', async () => {
  return updateState;
});

ipcMain.handle('check-for-updates', async () => {
  const now = new Date().toISOString();
  pushUpdateState({ lastCheckedAt: now });

  if (!app.isPackaged) {
    pushUpdateState({ status: "dev", available: false });
    return { ok: false, reason: "dev" };
  }

  try {
    const res = await autoUpdater.checkForUpdates();
    return { ok: true, updateInfo: res?.updateInfo || null };
  } catch (e) {
    const message = String(e?.message || e);
    pushUpdateState({ status: "error", error: message });
    return { ok: false, error: message };
  }
});

ipcMain.handle('set-app-setting', async (event, { key, value }) => {
  const prisma = await getPrisma();
    const result = await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
    if (key === 'storeName') {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.setTitle(value);
    }
    if (key === 'cloudSyncEnabled' || key === 'cloudServerUrl' || key === 'cloudStoreId' || key === 'cloudStoreSecret') {
      updateSyncSetting(key, value);
      void flushSyncQueue();
    }
    if (key === 'telegramBotSettings') {
      void restartTelegramBots();
    }
    if (key === 'autoArchiveEnabled' || key === 'autoArchiveRetentionDays') {
      updateAutoArchiveSetting(key, value);
      scheduleAutoArchive();
      if (autoArchiveState.enabled) void runAutoArchive();
    }
    return result;
});

ipcMain.handle('cloud-sync-status', async () => {
  return {
    enabled: syncState.enabled,
    queueLength: syncState.queue.length,
    lastError: syncState.lastError,
    lastSuccessAt: syncState.lastSuccessAt
  };
});

ipcMain.handle('cloud-sync-now', async () => {
  const result = await runFullSync();
  await flushSyncQueue();
  return result;
});

ipcMain.handle('cloud-sync-full', async () => {
  const result = await runFullSync();
  await flushSyncQueue();
  return result;
});

ipcMain.handle('get-telegram-bot-settings', async () => {
  const settings = await loadTelegramSettings();
  return {
    enabled: settings.enabled,
    scope: 'cashier_copy',
    label: settings.label,
    cashierChatId: settings.cashierChatId,
    ownerChatId: settings.ownerChatId,
    cashierUserId: settings.cashierUserId,
    cashierUser: settings.cashierUser,
    botTokenMasked: maskTelegramToken(settings.botToken),
    running: telegramBotState.enabled,
    activeBots: telegramBotState.bots.reduce((sum, bot) => sum + (bot.recipients?.length || 0), 0),
    lastError: telegramBotState.lastError,
    lastMessageAt: telegramBotState.lastMessageAt
  };
});

ipcMain.handle('set-telegram-bot-settings', async (event, payload) => {
  const prisma = await getPrisma();
  await ensureTelegramBotSettingsTable(prisma);
  await migrateLegacyTelegramSettings(prisma);
  const settings = sanitizeTelegramSettings(payload || {});
  const previousToken = await getSavedTelegramBotToken();
  const botToken = settings.botToken || previousToken;
  const cashierChatId = settings.cashierChatId || '';
  const ownerChatId = settings.ownerChatId || '';
  const cashierUserId = settings.cashierUserId ? Number(settings.cashierUserId) : null;
  await prisma.appSetting.upsert({
    where: { key: 'telegramBotsEnabled' },
    update: { value: String(settings.enabled) },
    create: { key: 'telegramBotsEnabled', value: String(settings.enabled) }
  });
  await prisma.$executeRaw`DELETE FROM "TelegramBotSetting"`;
  if (botToken || cashierChatId || ownerChatId) {
    const storageUserId = await getTelegramStorageUserId(prisma, cashierUserId);
    await prisma.$executeRaw`
      INSERT INTO "TelegramBotSetting" ("userId", "scope", "label", "botToken", "chatId", "cashierChatId", "ownerChatId", "cashierUserId", "enabled", "createdAt", "updatedAt")
      VALUES (${storageUserId}, 'cashier_copy', ${settings.label || 'نسخة الكاشير'}, ${botToken}, ${cashierChatId}, ${cashierChatId}, ${ownerChatId}, ${cashierUserId}, ${settings.enabled !== false}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
  }
  await restartTelegramBots();
  return {
    ok: true,
    running: telegramBotState.enabled,
    activeBots: telegramBotState.bots.reduce((sum, bot) => sum + (bot.recipients?.length || 0), 0),
    lastError: telegramBotState.lastError
  };
});

ipcMain.handle('test-telegram-bot', async (event, payload) => {
  const target = String(payload?.target || 'cashier') === 'owner' ? 'owner' : 'cashier';
  const bot = {
    userId: Number(payload?.userId || 0),
    username: String(payload?.username || ''),
    name: String(payload?.name || ''),
    role: target === 'owner' ? 'admin' : 'cashier',
    botToken: String(payload?.botToken || '').trim() || await getSavedTelegramBotToken(),
    chatId: String(target === 'owner' ? payload?.ownerChatId : payload?.cashierChatId || payload?.chatId || '').trim()
  };
  if (!bot.botToken || !bot.chatId) return { ok: false, error: 'botToken and chatId are required' };
  try {
    await sendTelegramMessage(bot, `تم ربط بوت ${bot.name || bot.username || bot.userId} بنجاح.\nاكتب /help لعرض الأوامر.`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('get-network-status', async () => {
  return {
    isOnline: networkState.isOnline,
    lastCheck: networkState.lastOnlineCheck
  };
});

// --- Archives (auto archive files) ---
ipcMain.handle('list-archives', async () => {
  try {
    const dir = ensureArchiveDir();
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const items = files.map(file => {
      const fullPath = path.join(dir, file);
      const stats = fs.statSync(fullPath);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = safeJsonParse(raw, null);
      const meta = parsed || {};
      const counts = {
        sales: Array.isArray(meta.sales) ? meta.sales.length : 0,
        returns: Array.isArray(meta.returns) ? meta.returns.length : 0,
        invoices: Array.isArray(meta.invoices) ? meta.invoices.length : 0
      };
      return {
        file,
        size: stats.size,
        modifiedAt: stats.mtime?.toISOString?.() || stats.mtime,
        type: meta.type || 'unknown',
        generatedAt: meta.generatedAt || null,
        retentionDays: meta.retentionDays ?? null,
        range: meta.range || null,
        counts
      };
    });
    return items.sort((a, b) => new Date(b.modifiedAt || 0).getTime() - new Date(a.modifiedAt || 0).getTime());
  } catch (e) {
    console.error('Failed to list archives:', e);
    return [];
  }
});

ipcMain.handle('read-archive', async (event, { file }) => {
  try {
    const dir = ensureArchiveDir();
    const safeName = path.basename(String(file || ''));
    const fullPath = path.join(dir, safeName);
    if (!fullPath.startsWith(dir)) throw new Error('Invalid archive path');
    if (!fs.existsSync(fullPath)) throw new Error('Archive not found');
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed = safeJsonParse(raw, null);
    if (!parsed) throw new Error('Invalid archive file');
    const counts = {
      sales: Array.isArray(parsed.sales) ? parsed.sales.length : 0,
      returns: Array.isArray(parsed.returns) ? parsed.returns.length : 0,
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices.length : 0
    };
    return {
      ...parsed,
      counts,
      sales: undefined,
      returns: undefined,
      invoices: undefined
    };
  } catch (e) {
    console.error('Failed to read archive:', e);
    throw e;
  }
});

ipcMain.handle('run-archive-now', async () => {
  try {
    await runAutoArchive(true);
    return {
      ok: true,
      lastRunAt: autoArchiveState.lastRunAt,
      lastError: autoArchiveState.lastError
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Decode a raw receipt (base64) using the specified encoding and return text
ipcMain.handle('decode-receipt', async (event, { dataBase64, encoding }) => {
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    const enc = encoding || 'windows-1256';
    const decoded = iconv.decode(buf, enc);
    const plain = decoded.replace(/[\x00-\x1F\x7F]/g, '');
    return { ok: true, text: plain };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// --- Backups: simple backup/restore helpers ---
const BACKUP_TYPE_CONFIG = {
  all: {
    key: 'all',
    label: 'full database',
    ext: 'db',
    prefix: 'backup-full',
    mimeFilter: { name: 'Database', extensions: ['db'] }
  },
  products: {
    key: 'products',
    label: 'products',
    ext: 'json',
    prefix: 'backup-products',
    mimeFilter: { name: 'JSON', extensions: ['json'] }
  },
  debts: {
    key: 'debts',
    label: 'debts',
    ext: 'json',
    prefix: 'backup-debts',
    mimeFilter: { name: 'JSON', extensions: ['json'] }
  }
};

function normalizeBackupType(type) {
  return BACKUP_TYPE_CONFIG[type] ? type : 'all';
}

function parseDateIfValid(value, fallback = null) {
  if (!value) return fallback;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
}

function buildManagedBackupPath(type) {
  const normalizedType = normalizeBackupType(type);
  const cfg = BACKUP_TYPE_CONFIG[normalizedType];
  return path.join(getManagedBackupsDir(), buildBackupFilename(cfg.prefix, cfg.ext));
}

function inferBackupTypeFromPath(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base.endsWith('.db')) return 'all';
  if (base.startsWith(BACKUP_TYPE_CONFIG.products.prefix) || base.includes('products')) return 'products';
  if (base.startsWith(BACKUP_TYPE_CONFIG.debts.prefix) || base.includes('debts')) return 'debts';
  return 'unknown';
}

function listManagedBackupFiles() {
  const dir = getManagedBackupsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.db') || file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      return {
        file,
        path: fullPath,
        type: inferBackupTypeFromPath(file),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return files;
}

async function createFullDatabaseBackupTo(targetDbPath) {
  const src = isDev ? path.join(__dirname, '..', 'prisma', 'dev.db') : path.join(app.getPath('userData'), 'dev.db');
  if (!fs.existsSync(src)) return { ok: false, error: 'Source DB not found' };

  const prisma = await getPrisma();
  try {
    await prisma.$queryRaw`PRAGMA integrity_check;`;
  } catch (dbError) {
    return { ok: false, error: 'Database is corrupted, cannot create backup' };
  }

  try {
    await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (checkpointError) {
    console.warn('WAL checkpoint failed before backup, continuing with file bundle copy:', checkpointError);
  }

  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });

  for (const candidate of [targetDbPath, `${targetDbPath}-wal`, `${targetDbPath}-shm`]) {
    try {
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    } catch (e) {
      console.warn('Failed to remove old backup target before writing:', candidate, e);
    }
  }

  try {
    const escapedTarget = escapeSqliteFilePath(targetDbPath);
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`);
  } catch (vacuumError) {
    console.warn('VACUUM INTO failed, falling back to SQLite bundle copy:', vacuumError);
    copySqliteBundle(src, targetDbPath);
  }

  return { ok: true, path: targetDbPath, includes: 'full-database' };
}

async function createProductsBackupTo(targetJsonPath) {
  const prisma = await getPrisma();
  const products = await prisma.product.findMany({ orderBy: { id: 'asc' } });
  fs.writeFileSync(targetJsonPath, JSON.stringify(products, null, 2), 'utf8');
  return { ok: true, path: targetJsonPath, count: products.length };
}

async function createDebtsBackupTo(targetJsonPath) {
  const prisma = await getPrisma();
  const [clients, debts, debtPayments] = await Promise.all([
    prisma.client.findMany({ orderBy: { id: 'asc' } }),
    prisma.debt.findMany({ include: { payments: true }, orderBy: { id: 'asc' } }),
    prisma.debtPayment.findMany({ orderBy: { id: 'asc' } })
  ]);

  const payload = {
    kind: 'debts-backup-v1',
    generatedAt: new Date().toISOString(),
    clients,
    debts,
    debtPayments
  };
  fs.writeFileSync(targetJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, path: targetJsonPath, count: debts.length };
}

async function restoreProductsFromPayload(rawProducts) {
  if (!Array.isArray(rawProducts)) {
    return { ok: false, error: 'Invalid products backup format' };
  }
  const prisma = await getPrisma();
  const existingCategories = await prisma.category.findMany({ select: { id: true } });
  const existingCatIds = new Set(existingCategories.map((c) => c.id));

  await prisma.$transaction(async (tx) => {
    for (const p of rawProducts) {
      let catId = p.categoryId;
      if (catId && !existingCatIds.has(catId)) catId = null;

      const productData = {
        name: String(p.name || ''),
        price: Number(p.price || 0),
        stock: Number(p.stock || 0),
        barcode: p.barcode ?? null,
        categoryId: catId,
        unitsPerBox: p.unitsPerBox ? Number(p.unitsPerBox) : 1,
        boxPurchasePrice: p.boxPurchasePrice ? Number(p.boxPurchasePrice) : 0,
        boxSalePrice: p.boxSalePrice ? Number(p.boxSalePrice) : 0
      };

      if (p.id) {
        const productId = Number(p.id);
        const existing = await tx.product.findUnique({ where: { id: productId } });
        if (existing) {
          await tx.product.update({ where: { id: productId }, data: productData });
        } else {
          await tx.product.create({ data: { ...productData, id: productId } });
        }
      } else {
        await tx.product.create({ data: productData });
      }
    }
  });

  BrowserWindow.getAllWindows().forEach((w) => w.reload());
  return { ok: true, message: `Restored ${rawProducts.length} products` };
}

async function restoreDebtsFromPayload(payload) {
  const clients = Array.isArray(payload?.clients) ? payload.clients : [];
  const debts = Array.isArray(payload?.debts) ? payload.debts : [];
  const debtPayments = Array.isArray(payload?.debtPayments) ? payload.debtPayments : [];
  if (!clients.length && !debts.length && !debtPayments.length) {
    return { ok: false, error: 'Invalid debts backup format' };
  }

  const prisma = await getPrisma();
  await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ select: { id: true } });
    const validUserIds = new Set(users.map((u) => u.id));

    await tx.debtPayment.deleteMany({});
    await tx.debt.deleteMany({});
    await tx.client.deleteMany({});

    for (const c of clients) {
      await tx.client.create({
        data: {
          id: Number(c.id),
          name: String(c.name || ''),
          phone: c.phone ?? null,
          createdAt: parseDateIfValid(c.createdAt, new Date()) || new Date()
        }
      });
    }

    const validClientIds = new Set(clients.map((c) => Number(c.id)));
    for (const d of debts) {
      const clientId = Number(d.clientId);
      if (!validClientIds.has(clientId)) continue;
      const createdById = Number(d.createdById);
      const dueDate = parseDateIfValid(d.dueDate, null);
      const paidAt = parseDateIfValid(d.paidAt, null);
      await tx.debt.create({
        data: {
          id: Number(d.id),
          amount: Number(d.amount || 0),
          note: d.note ?? null,
          reason: d.reason ?? null,
          dueDate: dueDate,
          paid: Boolean(d.paid),
          paidAt: paidAt,
          createdAt: parseDateIfValid(d.createdAt, new Date()) || new Date(),
          clientId,
          createdById: validUserIds.has(createdById) ? createdById : null
        }
      });
    }

    const validDebtIds = new Set(debts.map((d) => Number(d.id)));
    const paymentsSource = debtPayments.length
      ? debtPayments
      : debts.flatMap((d) => (Array.isArray(d.payments) ? d.payments : []));
    for (const p of paymentsSource) {
      const debtId = Number(p.debtId);
      if (!validDebtIds.has(debtId)) continue;
      const userId = Number(p.userId);
      await tx.debtPayment.create({
        data: {
          id: Number(p.id),
          amount: Number(p.amount || 0),
          note: p.note ?? null,
          createdAt: parseDateIfValid(p.createdAt, new Date()) || new Date(),
          debtId,
          userId: validUserIds.has(userId) ? userId : null
        }
      });
    }

    const debtsAfter = await tx.debt.findMany({ include: { payments: true } });
    for (const debt of debtsAfter) {
      const paidAmount = debt.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const debtPaid = paidAmount >= Number(debt.amount || 0);
      await tx.debt.update({
        where: { id: debt.id },
        data: {
          paid: debtPaid,
          paidAt: debtPaid ? (debt.paidAt || new Date()) : null
        }
      });
    }
  });

  BrowserWindow.getAllWindows().forEach((w) => w.reload());
  return { ok: true, message: `Restored ${clients.length} clients and ${debts.length} debts` };
}

async function restoreDatabaseFromPath(chosenPath) {
  const { LitePrismaLikeClient } = require('./sqlite-client.cjs');
  const backupPrisma = new LitePrismaLikeClient({
    datasources: {
      db: {
        url: `file:${chosenPath}`
      }
    }
  });
  try {
    const integrityCheck = await backupPrisma.$queryRaw`PRAGMA integrity_check;`;
    await backupPrisma.$disconnect();
    if (!integrityCheck || integrityCheck[0]?.integrity_check !== 'ok') {
      return { ok: false, error: 'Backup file is corrupted' };
    }
  } catch (dbError) {
    await backupPrisma.$disconnect();
    return { ok: false, error: 'Backup file is corrupted or invalid' };
  }

  const dest = isDev ? path.join(__dirname, '..', 'prisma', 'dev.db') : path.join(app.getPath('userData'), 'dev.db');
  await resetPrismaConnection();
  const localSafetyBackup = getLocalDbBackupPath(dest);
  if (hasUsableDbFile(dest)) {
    copySqliteBundle(dest, localSafetyBackup);
  }
  copySqliteBundle(chosenPath, dest);
  await getPrisma();
  BrowserWindow.getAllWindows().forEach((w) => w.reload());
  return { ok: true, path: dest };
}

async function restoreBackupFromAnyPath(chosenPath) {
  if (!fs.existsSync(chosenPath)) return { ok: false, error: 'File not found' };
  if (chosenPath.toLowerCase().endsWith('.db')) {
    return restoreDatabaseFromPath(chosenPath);
  }

  if (!chosenPath.toLowerCase().endsWith('.json')) {
    return { ok: false, error: 'Unsupported backup file type' };
  }

  const content = fs.readFileSync(chosenPath, 'utf8');
  const parsed = safeJsonParse(content, null);
  if (Array.isArray(parsed)) {
    return restoreProductsFromPayload(parsed);
  }
  if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.clients) || Array.isArray(parsed.debts) || Array.isArray(parsed.debtPayments))) {
    return restoreDebtsFromPayload(parsed);
  }
  return { ok: false, error: 'Invalid JSON backup format' };
}

async function createBackupByType(type, targetPath) {
  const normalizedType = normalizeBackupType(type);
  if (normalizedType === 'all') return createFullDatabaseBackupTo(targetPath);
  if (normalizedType === 'products') return createProductsBackupTo(targetPath);
  if (normalizedType === 'debts') return createDebtsBackupTo(targetPath);
  return { ok: false, error: 'Unsupported backup type' };
}

ipcMain.handle('backup-create', async (event, payload = {}) => {
  try {
    const type = normalizeBackupType(payload?.type);
    const filePath = buildManagedBackupPath(type);
    const result = await createBackupByType(type, filePath);
    if (!result?.ok) return result;
    return {
      ok: true,
      type,
      path: filePath,
      file: path.basename(filePath),
      managedDir: getManagedBackupsDir()
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('backup-list', async () => {
  try {
    return { ok: true, dir: getManagedBackupsDir(), files: listManagedBackupFiles() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), files: [] };
  }
});

ipcMain.handle('backup-restore-managed', async (event, payload = {}) => {
  try {
    const managedDir = getManagedBackupsDir();
    const fileName = path.basename(String(payload?.file || ''));
    if (!fileName) return { ok: false, error: 'Backup file not selected' };
    const fullPath = path.resolve(managedDir, fileName);
    if (!fullPath.startsWith(path.resolve(managedDir))) {
      return { ok: false, error: 'Invalid backup file path' };
    }
    return await restoreBackupFromAnyPath(fullPath);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('backup-all', async () => {
  try {
    const defaultName = buildBackupFilename(BACKUP_TYPE_CONFIG.all.prefix, BACKUP_TYPE_CONFIG.all.ext);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save full database backup',
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      buttonLabel: 'Save',
      filters: [BACKUP_TYPE_CONFIG.all.mimeFilter]
    });
    if (canceled || !filePath) return { ok: false, error: 'User cancelled' };
    return await createFullDatabaseBackupTo(filePath);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('backup-products', async () => {
  try {
    const defaultName = buildBackupFilename(BACKUP_TYPE_CONFIG.products.prefix, BACKUP_TYPE_CONFIG.products.ext);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export products to JSON',
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      filters: [BACKUP_TYPE_CONFIG.products.mimeFilter],
      buttonLabel: 'Export'
    });
    if (canceled || !filePath) return { ok: false, error: 'User cancelled' };
    return await createProductsBackupTo(filePath);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('backup-debts', async () => {
  try {
    const defaultName = buildBackupFilename(BACKUP_TYPE_CONFIG.debts.prefix, BACKUP_TYPE_CONFIG.debts.ext);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export debts to JSON',
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      filters: [BACKUP_TYPE_CONFIG.debts.mimeFilter],
      buttonLabel: 'Export'
    });
    if (canceled || !filePath) return { ok: false, error: 'User cancelled' };
    return await createDebtsBackupTo(filePath);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('restore-debts', async (event, payload = {}) => {
  try {
    let chosenPath = payload?.filePath;
    if (!chosenPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Choose debts backup file',
        defaultPath: app.getPath('desktop'),
        properties: ['openFile'],
        filters: [BACKUP_TYPE_CONFIG.debts.mimeFilter]
      });
      if (canceled || !filePaths || filePaths.length === 0) return { ok: false, error: 'User cancelled' };
      chosenPath = filePaths[0];
    }

    const content = fs.readFileSync(chosenPath, 'utf8');
    const parsed = safeJsonParse(content, null);
    return await restoreDebtsFromPayload(parsed);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('backup-restore', async (event, payload = {}) => {
  try {
    let chosenPath = payload?.filePath;
    if (!chosenPath) {
      const managedDir = getManagedBackupsDir();
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Choose backup file to restore',
        defaultPath: managedDir,
        properties: ['openFile'],
        filters: [
          { name: 'Backup Files', extensions: ['db', 'json'] },
          { name: 'Database', extensions: ['db'] },
          { name: 'JSON', extensions: ['json'] }
        ]
      });
      if (canceled || !filePaths || filePaths.length === 0) return { ok: false, error: 'User cancelled' };
      chosenPath = filePaths[0];
    }
    return await restoreBackupFromAnyPath(chosenPath);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('list-user-activity-logs', async (event, { dateFrom, dateTo } = {}) => {
  const prisma = await getPrisma();
    const where = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      where.createdAt = { gte: from };
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt = where.createdAt ? { ...where.createdAt, lte: to } : { lte: to };
    }
    return await prisma.userActivityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' }
    });
});

ipcMain.handle('import-legacy-dbf', async () => {
  const prisma = await getPrisma();
  let DBFFile;
  try {
    DBFFile = require('dbffile').DBFFile;
  } catch (e) {
    return { ok: false, error: "مكتبة dbffile غير مثبتة. الرجاء تشغيل: npm install dbffile" };
  }

  try {
    const dbfPath = 'C:\\Users\\PC-HP-HU\\Desktop\\POS S\\src\\lib\\Products.DBF';
    if (!fs.existsSync(dbfPath)) {
      return { ok: false, error: `الملف غير موجود في المسار:\n${dbfPath}` };
    }

    console.log(`Reading DBF file from: ${dbfPath}`);
    const dbf = await DBFFile.open(dbfPath, { encoding: 'win1256' }); // استخدام ترميز win1256 لدعم العربية
    const records = await dbf.readRecords(dbf.recordCount);
    
    // تسجيل حقول أول سجل للمساعدة في التشخيص
    if (records.length > 0) {
      console.log('DBF Import - First Record Keys:', Object.keys(records[0]));
      console.log('DBF Import - First Record Sample:', records[0]);
    }

    let importedCount = 0;
    
    // استخدام Transaction لتسريع العملية
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const name = record['ITEM_NAME'] ? String(record['ITEM_NAME']).trim() : null;
        if (!name) continue;

        const price = record['PRICE'] ? Number(record['PRICE']) : 0;
        const barcode = record['BARCODE'] ? String(record['BARCODE']).trim() : null;
        
        // تصحيح قراءة التعبئة (الوحدات في الصندوق) بناءً على السجل UNIT
        const unitsPerBox = (record['UNIT'] && Number(record['UNIT']) > 0) ? Number(record['UNIT']) : 1;

        // تصحيح قراءة المخزون: استخدام CRTB (الرصيد الحالي) وضربه في التعبئة لتحويله لقطع
        let rawStock = 0;
        if (record['CRTB'] !== undefined && record['CRTB'] !== null) rawStock = Number(record['CRTB']);
        else if (record['OLDB'] !== undefined && record['OLDB'] !== null) rawStock = Number(record['OLDB']);
        const stock = Math.round(rawStock * unitsPerBox);
        
        // تصحيح أسعار الصندوق (PRICEPT للشراء، PRICET للبيع)
        const boxPurchasePrice = record['PRICEPT'] ? Number(record['PRICEPT']) : 0;
        const boxSalePrice = record['PRICET'] ? Number(record['PRICET']) : 0;
        
        // إنشاء المنتج أو تحديثه إذا كان الباركود موجوداً
        await tx.product.create({
          data: { name, price, stock, barcode, unitsPerBox, boxPurchasePrice, boxSalePrice }
        }).catch(err => console.log(`Skipped duplicate or error for ${name}: ${err.message}`));
        
        importedCount++;
      }
    });

    return { ok: true, count: importedCount };
  } catch (e) {
    console.error("DBF Import Error:", e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('list-purchase-invoices', async (event, { limit } = {}) => {
  const prisma = await getPrisma();
  const take = Number(limit);
  const invoices = await prisma.purchaseInvoice.findMany({
    include: { items: true },
    orderBy: { timestamp: 'desc' },
    ...(Number.isFinite(take) && take > 0 ? { take: Math.floor(take) } : {})
  });
  return invoices.map(mapPurchaseInvoiceRecord).filter(Boolean);
});

ipcMain.handle('process-purchase-invoice', async (event, data) => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    const payload = {
      ...data,
      id: data?.id ? String(data.id) : undefined,
      items: Array.isArray(data?.items) ? data.items : []
    };

    const saved = await withSqliteRetry('process-purchase-invoice', () => savePurchaseInvoiceWithData(payload, { requireExisting: false }));
    if (!saved.ok) return { ok: false, error: saved.error };

    if (saved.record) {
      // Log the invoice creation
      await logInvoiceChange(prisma, {
        invoiceType: 'purchase',
        invoiceId: saved.record.id,
        userId: activeUserId,
        userName: data?.userName || 'Unknown',
        action: 'create',
        description: `تم إنشاء فاتورة شراء جديدة من ${saved.record.supplierName} - المجموع: ${saved.record.totalAmount}`,
        fieldName: 'invoice',
        oldValue: null,
        newValue: JSON.stringify({ 
          supplierName: saved.record.supplierName, 
          totalAmount: saved.record.totalAmount,
          itemsCount: saved.record.itemsCount,
          createdAt: new Date().toISOString()
        })
      });

      enqueueSyncEvent('purchase.invoice.create', saved.record);
      const touchedProductIds = (saved.record.items || []).map((item) => item.productId).filter(Boolean);
      void syncProductsByIds(touchedProductIds);

      const autoPricingProductIds = (saved.record.items || [])
        .filter((item) => item.cost !== undefined && item.cost !== null && item.cost !== '')
        .map((item) => item.productId)
        .filter(Boolean);

      const autoPricingResult = await runAutoPricingPass({
        productIds: autoPricingProductIds.length ? autoPricingProductIds : touchedProductIds,
        source: 'auto-pricing-purchase',
        note: 'Auto pricing after purchase invoice'
      });
      if (!autoPricingResult?.ok) {
        console.error('Auto pricing after purchase invoice failed:', autoPricingResult?.error);
      }
    }

    return { ok: true, invoice: saved.record };
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('update-purchase-invoice', async (event, data) => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    const { result, updatedRecord } = await withSqliteRetry('update-purchase-invoice', () => updatePurchaseInvoiceWithData({
      ...data,
      id: data?.id ? String(data.id) : data?.id,
      items: Array.isArray(data?.items) ? data.items : []
    }));

    if (result?.ok && updatedRecord) {
      // Log the invoice change
      await logInvoiceChange(prisma, {
        invoiceType: 'purchase',
        invoiceId: updatedRecord.id,
        userId: activeUserId,
        userName: data?.userName || 'Unknown',
        action: 'update',
        description: `تم تعديل فاتورة الشراء - المجموع: ${updatedRecord.totalAmount}`,
        fieldName: 'invoice',
        oldValue: null,
        newValue: JSON.stringify({ 
          supplierName: updatedRecord.supplierName, 
          totalAmount: updatedRecord.totalAmount,
          itemsCount: updatedRecord.itemsCount,
          updatedAt: new Date().toISOString()
        })
      });

      enqueueSyncEvent('purchase.invoice.update', updatedRecord);
      const touchedProductIds = (updatedRecord.items || []).map((item) => item.productId).filter(Boolean);
      void syncProductsByIds(touchedProductIds);

      const autoPricingProductIds = (updatedRecord.items || [])
        .filter((item) => item.cost !== undefined && item.cost !== null && item.cost !== '')
        .map((item) => item.productId)
        .filter(Boolean);

      const autoPricingResult = await runAutoPricingPass({
        productIds: autoPricingProductIds.length ? autoPricingProductIds : touchedProductIds,
        source: 'auto-pricing-purchase',
        note: 'Auto pricing after purchase invoice update'
      });
      if (!autoPricingResult?.ok) {
        console.error('Auto pricing after purchase invoice update failed:', autoPricingResult?.error);
      }
    }

    return result;
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('add-supplier-payment', async (event, data) => {
  beginCashierWrite();
  try {
    return await withSqliteRetry('add-supplier-payment', () => applySupplierPaymentAdd(data || {}));
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('update-supplier-payment', async (event, data) => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    const id = data?.id ? String(data.id) : '';
    if (!id) return { ok: false, error: 'Payment id is required' };

    const existing = await withSqliteRetry('update-supplier-payment-find', () => prisma.supplierPayment.findUnique({ where: { id } }));
    if (!existing) return { ok: false, error: 'Payment not found' };

    const updated = await withSqliteRetry('update-supplier-payment', () => prisma.supplierPayment.update({
      where: { id },
      data: {
        supplierName: data?.supplierName ? String(data.supplierName) : existing.supplierName,
        amount: Number(data?.amount ?? existing.amount ?? 0),
        note: data?.note !== undefined ? String(data.note || '') : existing.note,
        timestamp: data?.timestamp ? parsePurchaseDate(data.timestamp) || existing.timestamp : existing.timestamp
      }
    }));

    const mapped = mapSupplierPaymentRecord(updated);
    enqueueSyncEvent('supplier.payment.add', mapped);
    return { ok: true, payment: mapped };
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('list-supplier-payments', async () => {
  const prisma = await getPrisma();
  const payments = await prisma.supplierPayment.findMany({
    orderBy: { timestamp: 'desc' }
  });
  return payments.map(mapSupplierPaymentRecord).filter(Boolean);
});

ipcMain.handle('zero-negative-stock', async () => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    const negatives = await prisma.product.findMany({
      where: { stock: { lt: 0 } },
      select: { id: true }
    });
    if (!negatives.length) return { ok: true, updated: 0 };

    await prisma.product.updateMany({
      where: { stock: { lt: 0 } },
      data: { stock: 0 }
    });
    void syncProductsByIds(negatives.map((p) => p.id));
    return { ok: true, updated: negatives.length };
  } catch (e) {
    console.error('Failed to zero negative stock:', e);
    return { ok: false, error: String(e?.message || e) };
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('zero-all-stock', async () => {
  beginCashierWrite();
  try {
    const prisma = await getPrisma();
    const products = await prisma.product.findMany({
      select: { id: true }
    });
    if (!products.length) return { ok: true, updated: 0 };

    await prisma.product.updateMany({
      data: { stock: 0 }
    });
    void syncProductsByIds(products.map((p) => p.id));
    return { ok: true, updated: products.length };
  } catch (e) {
    console.error('Failed to zero all stock:', e);
    return { ok: false, error: String(e?.message || e) };
  } finally {
    endCashierWrite();
  }
});

ipcMain.handle('choose-receipt-barcode-image', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose receipt barcode image',
      defaultPath: app.getPath('pictures'),
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    });
    if (canceled || !filePaths || filePaths.length === 0) return { ok: false, error: 'User cancelled' };

    const sourcePath = filePaths[0];
    const ext = path.extname(sourcePath).toLowerCase() || '.png';
    const fileName = `receipt-barcode${ext}`;
    const targetPath = path.join(app.getPath('userData'), fileName);
    fs.copyFileSync(sourcePath, targetPath);

    const prisma = await getPrisma();
    await prisma.appSetting.upsert({
      where: { key: 'receiptBarcodeImage' },
      update: { value: fileName },
      create: { key: 'receiptBarcodeImage', value: fileName }
    });
    await prisma.appSetting.upsert({
      where: { key: 'receiptBarcodeEnabled' },
      update: { value: 'true' },
      create: { key: 'receiptBarcodeEnabled', value: 'true' }
    });

    return { ok: true, fileName, path: targetPath };
  } catch (e) {
    console.error('Failed to choose receipt barcode image:', e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('list-pricing-logs', async (event, { dateFrom, dateTo, search, source, limit } = {}) => {
  try {
    let logs = readPricingLogs();
    const fromDate = normalizeDateBoundary(dateFrom, false);
    const toDate = normalizeDateBoundary(dateTo, true);
    const sourceValue = String(source || '').trim();
    const searchValue = String(search || '').trim().toLowerCase();

    if (fromDate) {
      logs = logs.filter((log) => {
        const dt = new Date(log?.createdAt || 0);
        return !Number.isNaN(dt.getTime()) && dt >= fromDate;
      });
    }
    if (toDate) {
      logs = logs.filter((log) => {
        const dt = new Date(log?.createdAt || 0);
        return !Number.isNaN(dt.getTime()) && dt <= toDate;
      });
    }
    if (sourceValue && sourceValue !== 'all') {
      logs = logs.filter((log) => String(log?.source || '') === sourceValue);
    }
    if (searchValue) {
      logs = logs.filter((log) => {
        const haystack = [
          log?.productName,
          log?.note,
          log?.source
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(searchValue);
      });
    }

    logs.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    const max = toPositiveNumberOrFallback(limit, 1000);
    return logs.slice(0, max);
  } catch (e) {
    console.error('Failed to list pricing logs:', e);
    return [];
  }
});

ipcMain.handle('capture-auto-pricing-profiles', async () => {
  try {
    const prisma = await getPrisma();
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        unitsPerBox: true,
        boxPurchasePrice: true,
        boxSalePrice: true,
        price: true
      }
    });

    const profiles = readAutoPricingProfiles();
    let captured = 0;
    const now = new Date().toISOString();

    for (const product of products) {
      const snapshot = buildPricingSnapshot(product);
      const unitMarkupPercent = Number.isFinite(snapshot.unitProfitPercent)
        ? Number(snapshot.unitProfitPercent)
        : null;
      const boxMarkupPercent = Number.isFinite(snapshot.boxProfitPercent)
        ? Number(snapshot.boxProfitPercent)
        : null;
      if (unitMarkupPercent === null && boxMarkupPercent === null) continue;

      profiles[String(product.id)] = {
        productId: product.id,
        productName: product.name || '',
        unitMarkupPercent,
        boxMarkupPercent,
        unitsPerBox: snapshot.unitsPerBox,
        capturedAt: now
      };
      captured += 1;
    }

    writeAutoPricingProfiles(profiles);
    return { ok: true, captured };
  } catch (e) {
    console.error('Failed to capture auto pricing profiles:', e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('run-auto-pricing', async () => {
  return await runAutoPricingPass({
    source: 'auto-pricing-batch',
    note: 'Auto pricing run'
  });
});

ipcMain.handle('list-center-cashbox-entries', async (event, { limit } = {}) => {
  try {
    const entries = sortCenterCashboxEntries(readCenterCashboxEntries());
    const maxLimit = Number(limit);
    if (Number.isFinite(maxLimit) && maxLimit > 0) {
      return entries.slice(0, Math.floor(maxLimit));
    }
    return entries;
  } catch (e) {
    console.error("Failed to list center cashbox entries:", e);
    return [];
  }
});

ipcMain.handle('create-center-cashbox-entry', async (event, payload = {}) => {
  try {
    const type = normalizeCashboxType(payload.type);
    const amount = toPositiveNumber(payload.amount);
    if (!amount) return { ok: false, error: "Invalid amount" };

    if (type === "withdrawal" && !isAdminRole(payload.actorRole)) {
      return { ok: false, error: "Only admin can create withdrawals" };
    }

    const now = new Date().toISOString();
    const createdById = Number(payload.createdById);
    const createdByName = String(payload.createdByName || "System").trim() || "System";
    const entries = readCenterCashboxEntries();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      amount,
      note: String(payload.note || "").trim(),
      createdAt: now,
      updatedAt: now,
      createdById: Number.isFinite(createdById) ? createdById : null,
      createdByName,
      updatedById: Number.isFinite(createdById) ? createdById : null,
      updatedByName: createdByName
    };

    entries.unshift(entry);
    writeCenterCashboxEntries(entries);
    enqueueSyncEvent("center.cashbox.create", entry);
    return { ok: true, entry };
  } catch (e) {
    console.error("Failed to create center cashbox entry:", e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('update-center-cashbox-entry', async (event, payload = {}) => {
  try {
    const entryId = String(payload.id || "").trim();
    if (!entryId) return { ok: false, error: "Missing entry id" };

    const entries = readCenterCashboxEntries();
    const index = entries.findIndex((entry) => String(entry?.id) === entryId);
    if (index < 0) return { ok: false, error: "Entry not found" };

    const current = entries[index];
    const nextType = payload.type ? normalizeCashboxType(payload.type) : normalizeCashboxType(current.type);
    if (!isAdminRole(payload.actorRole) && (current.type === "withdrawal" || nextType === "withdrawal")) {
      return { ok: false, error: "Only admin can modify withdrawals" };
    }

    const nextAmount = payload.amount === undefined ? toPositiveNumber(current.amount) : toPositiveNumber(payload.amount);
    if (!nextAmount) return { ok: false, error: "Invalid amount" };

    const updatedById = Number(payload.updatedById);
    const updatedByNameRaw = String(payload.updatedByName || "").trim();
    const updatedByName = updatedByNameRaw || current.updatedByName || current.createdByName || "System";

    const updatedEntry = {
      ...current,
      type: nextType,
      amount: nextAmount,
      note: payload.note === undefined ? String(current.note || "") : String(payload.note || "").trim(),
      updatedAt: new Date().toISOString(),
      updatedById: Number.isFinite(updatedById) ? updatedById : current.updatedById ?? null,
      updatedByName
    };

    entries[index] = updatedEntry;
    writeCenterCashboxEntries(entries);
    enqueueSyncEvent("center.cashbox.update", updatedEntry);
    return { ok: true, entry: updatedEntry };
  } catch (e) {
    console.error("Failed to update center cashbox entry:", e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('delete-center-cashbox-entry', async (event, payload = {}) => {
  try {
    const entryId = String(payload.id || "").trim();
    if (!entryId) return { ok: false, error: "Missing entry id" };

    const entries = readCenterCashboxEntries();
    const index = entries.findIndex((entry) => String(entry?.id) === entryId);
    if (index < 0) return { ok: false, error: "Entry not found" };

    const current = entries[index];
    if (current?.type === "withdrawal" && !isAdminRole(payload.actorRole)) {
      return { ok: false, error: "Only admin can delete withdrawals" };
    }

    entries.splice(index, 1);
    writeCenterCashboxEntries(entries);
    enqueueSyncEvent("center.cashbox.delete", { id: entryId });
    return { ok: true };
  } catch (e) {
    console.error("Failed to delete center cashbox entry:", e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('export-center-cashbox-csv', async (event, { limit } = {}) => {
  try {
    const allEntries = sortCenterCashboxEntries(readCenterCashboxEntries());
    const maxLimit = Number(limit);
    const entries = Number.isFinite(maxLimit) && maxLimit > 0
      ? allEntries.slice(0, Math.floor(maxLimit))
      : allEntries;

    const rows = entries.map((entry) => [
      entry?.createdAt || "",
      entry?.type === "withdrawal" ? "withdrawal" : "deposit",
      Number(entry?.amount || 0),
      entry?.note || "",
      entry?.createdByName || "",
      entry?.updatedByName || "",
      entry?.updatedAt || ""
    ]);

    const csvLines = [
      ["createdAt", "type", "amount", "note", "createdBy", "updatedBy", "updatedAt"],
      ...rows
    ].map((row) => row.map(csvEscape).join(","));

    const defaultName = `center-cashbox-${new Date().toISOString().slice(0, 10)}.csv`;
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export cashbox movements",
      defaultPath: path.join(app.getPath("desktop"), defaultName),
      filters: [{ name: "CSV", extensions: ["csv"] }],
      buttonLabel: "Export"
    });

    if (canceled || !filePath) {
      return { ok: false, canceled: true };
    }

    fs.writeFileSync(filePath, `\uFEFF${csvLines.join("\n")}`, "utf8");
    return { ok: true, path: filePath, count: rows.length };
  } catch (e) {
    console.error("Failed to export center cashbox csv:", e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('reset-suppliers', async () => {
  const prisma = await getPrisma();
  const logDir = app.getPath('userData');
  const paymentsPath = path.join(logDir, 'supplier-payments.json');
  const invoicesPath = path.join(logDir, 'purchase-invoices.json');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.supplierPayment.deleteMany({});
      await tx.purchaseInvoiceItem.deleteMany({});
      await tx.purchaseInvoice.deleteMany({});
    });
    // Keep legacy files empty to prevent re-import after reset.
    fs.writeFileSync(paymentsPath, '[]', 'utf8');
    fs.writeFileSync(invoicesPath, '[]', 'utf8');
    enqueueSyncEvent('supplier.reset', { at: new Date().toISOString() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- Invoice Change Log Handlers ---
/**
 * Utility function to log invoice changes
 */
async function logInvoiceChange(prisma, {
  invoiceType,
  invoiceId,
  userId,
  userName,
  action,
  fieldName,
  oldValue,
  newValue,
  description
}) {
  try {
    await ensureInvoiceChangeLogSchema(prisma);
    // تحقق من وجود الجدول أولاً
    try {
      await prisma.invoiceChangeLog.create({
        data: {
          invoiceType,
          invoiceId: String(invoiceId),
          userId,
          userName,
          action,
          fieldName: fieldName || null,
          oldValue: oldValue !== undefined ? String(oldValue) : null,
          newValue: newValue !== undefined ? String(newValue) : null,
          description: description || null
        }
      });
    } catch (tableErr) {
      // إذا كان الخطأ متعلقاً بعدم وجود الجدول، تجاهله بصمت
      if (tableErr?.code === 'P2021' || String(tableErr?.message || '').includes('does not exist')) {
        console.debug('[LOG] InvoiceChangeLog table not found after schema ensure - skipping log');
        return;
      }
      throw tableErr;
    }
  } catch (e) {
    console.debug('Failed to log invoice change:', String(e?.message || e).slice(0, 100));
  }
}

ipcMain.handle('list-invoice-changes', async (event, { invoiceType, invoiceId, limit } = {}) => {
  const prisma = await getPrisma();
  try {
    await ensureInvoiceChangeLogSchema(prisma);
    const where = {};
    if (invoiceType) where.invoiceType = invoiceType;
    if (invoiceId) where.invoiceId = String(invoiceId);
    
    const changes = await prisma.invoiceChangeLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(Number.isFinite(limit) && limit > 0 ? { take: Math.floor(limit) } : {})
    });
    return changes;
  } catch (e) {
    console.error('Failed to list invoice changes:', e);
    return [];
  }
});

ipcMain.handle('get-invoice-changes-by-id', async (event, { invoiceType, invoiceId }) => {
  const prisma = await getPrisma();
  try {
    await ensureInvoiceChangeLogSchema(prisma);
    const changes = await prisma.invoiceChangeLog.findMany({
      where: {
        invoiceType: String(invoiceType),
        invoiceId: String(invoiceId)
      },
      orderBy: { createdAt: 'asc' }
    });
    return changes;
  } catch (e) {
    console.error('Failed to get invoice changes:', e);
    return [];
  }
});

ipcMain.handle('freeze-product', async (event, { fromId, toId, quantity }) => {
  const prisma = await getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. خصم الكمية من المنتج الطازج
      const fresh = await tx.product.update({
        where: { id: Number(fromId) },
        data: { stock: { decrement: Number(quantity) } }
      });

      // 2. إضافة الكمية للمنتج المجمد
      const frozen = await tx.product.update({
        where: { id: Number(toId) },
        data: { stock: { increment: Number(quantity) } }
      });

      // 3. تسجيل العملية في سجلات الحركة اليدوية (للمراجعة لاحقاً)
      const logDir = app.getPath('userData');
      const logPath = path.join(logDir, 'product-manual-logs.json');
      let logs = [];
      if (fs.existsSync(logPath)) {
        try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) {}
      }
      
      const timestamp = new Date().toISOString();
      // سجل للمنتج الطازج
      logs.unshift({
        productId: fromId,
        timestamp,
        oldStock: fresh.stock + Number(quantity),
        newStock: fresh.stock,
        diff: -Number(quantity),
        reason: `تحويل تجميد -> ${frozen.name}`
      });
      // سجل للمنتج المجمد
      logs.unshift({
        productId: toId,
        timestamp,
        oldStock: frozen.stock - Number(quantity),
        newStock: frozen.stock,
        diff: Number(quantity),
        reason: `تحويل تجميد <- ${fresh.name}`
      });
      
      fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

      return { ok: true, fresh, frozen };
    });
    void syncProductsByIds([fromId, toId]);
    return { ok: true };
  } catch (e) {
    console.error("Freezing error:", e);
    throw e;
  }
});

// --- Compute AI Context ---
function getArchivedSalesSourceDirs() {
  const dirs = [];
  try {
    dirs.push(ensureArchiveDir());
  } catch {}

  try {
    const userDataArchives = path.join(app.getPath('userData'), 'archives');
    if (!dirs.includes(userDataArchives)) {
      dirs.push(userDataArchives);
    }
  } catch {}

  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!dirs.includes(backupsDir)) {
    dirs.push(backupsDir);
  }

  return dirs;
}

function loadArchivedSalesData() {
  const archivedData = [];
  const seenFiles = new Set();

  for (const dir of getArchivedSalesSourceDirs()) {
    try {
      if (!dir || !fs.existsSync(dir)) continue;
      const archiveFiles = fs.readdirSync(dir).filter((file) => file.endsWith('.json') && file.includes('sales'));
      for (const file of archiveFiles) {
        const fileKey = `${dir}::${file}`;
        if (seenFiles.has(fileKey)) continue;
        seenFiles.add(fileKey);

        try {
          const filePath = path.join(dir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (Array.isArray(data?.sales)) {
            archivedData.push(...data.sales);
          }
        } catch (error) {
          console.error(`Failed to read archive ${file} from ${dir}:`, error);
        }
      }
    } catch (error) {
      console.error(`Failed to scan archive directory ${dir}:`, error);
    }
  }

  return archivedData;
}

function getMonthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function ensureMonthlyBucket(map, monthKey) {
  if (!monthKey) return null;
  if (!map[monthKey]) {
    map[monthKey] = {
      month: monthKey,
      revenue: 0,
      cost: 0,
      profit: 0,
      invoices: 0,
      liveInvoices: 0,
      archivedInvoices: 0,
      soldItems: 0,
      returnsCount: 0,
      returnsValue: 0,
      purchaseInvoicesCount: 0,
      purchaseInvoicesTotal: 0,
      supplierPaymentsCount: 0,
      supplierPaymentsTotal: 0,
      debtCreatedAmount: 0,
      debtPaidAmount: 0,
      debtPaymentsCount: 0,
      activityCount: 0,
      logins: 0,
      logouts: 0,
      pricingChanges: 0,
      invoiceChanges: 0,
      notesCount: 0,
      notesAmount: 0,
      cashboxIn: 0,
      cashboxOut: 0,
      cashboxNet: 0
    };
  }
  return map[monthKey];
}

async function computeAiContext() {
  const prisma = await getPrisma();
  const sales = await prisma.sale.findMany({
    include: {
      items: { include: { product: true } },
      cashier: { select: { id: true, name: true, username: true, role: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 1000
  });

  const productCostById = new Map();
  for (const sale of sales) {
    for (const item of sale.items || []) {
      const product = item.product;
      if (!product || productCostById.has(product.id)) continue;
      const unitsPerBox = Number(product.unitsPerBox || 1) > 0 ? Number(product.unitsPerBox || 1) : 1;
      const costPerUnit = Number(product.boxPurchasePrice || 0) / unitsPerBox;
      productCostById.set(product.id, costPerUnit);
    }
  }

  let totalRevenue = 0;
  let totalCost = 0;
  let dailyProfits = {};
  let weeklyProfits = {};
  let monthlyProfits = {};
  const monthlyBreakdownMap = {};
  const productSalesMap = new Map();

  for (const sale of sales) {
    const saleDate = new Date(sale.createdAt);
    const dayKey = saleDate.toISOString().split('T')[0];
    const weekKey = `${saleDate.getFullYear()}-W${Math.ceil((saleDate.getDate() - saleDate.getDay() + 1) / 7)}`;
    const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;

    const saleRevenue = Number(sale.total);
    totalRevenue += saleRevenue;

    let saleCost = 0;
    for (const item of sale.items) {
      const product = item.product;
      if (product) {
        const costPerUnit = product.boxPurchasePrice / product.unitsPerBox;
        saleCost += costPerUnit * Number(item.quantity);
      }
    }
    totalCost += saleCost;
    const profit = saleRevenue - saleCost;

    if (!dailyProfits[dayKey]) dailyProfits[dayKey] = { revenue: 0, cost: 0, profit: 0 };
    dailyProfits[dayKey].revenue += saleRevenue;
    dailyProfits[dayKey].cost += saleCost;
    dailyProfits[dayKey].profit += profit;

    if (!weeklyProfits[weekKey]) weeklyProfits[weekKey] = { revenue: 0, cost: 0, profit: 0 };
    weeklyProfits[weekKey].revenue += saleRevenue;
    weeklyProfits[weekKey].cost += saleCost;
    weeklyProfits[weekKey].profit += profit;

    if (!monthlyProfits[monthKey]) monthlyProfits[monthKey] = { revenue: 0, cost: 0, profit: 0 };
    monthlyProfits[monthKey].revenue += saleRevenue;
    monthlyProfits[monthKey].cost += saleCost;
    monthlyProfits[monthKey].profit += profit;

    const monthlyBucket = ensureMonthlyBucket(monthlyBreakdownMap, monthKey);
    monthlyBucket.revenue += saleRevenue;
    monthlyBucket.cost += saleCost;
    monthlyBucket.profit += profit;
    monthlyBucket.invoices += 1;
    monthlyBucket.liveInvoices += 1;
    monthlyBucket.soldItems += sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    for (const item of sale.items || []) {
      const productId = Number(item.productId || 0);
      if (!productId) continue;
      const existing = productSalesMap.get(productId) || {
        productId,
        name: item.product?.name || `منتج ${productId}`,
        quantity: 0,
        revenue: 0,
        cost: 0,
        profit: 0
      };
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.price || 0) * quantity;
      const costPerUnit = Number(productCostById.get(productId) || 0);
      const cost = costPerUnit * quantity;
      existing.quantity += quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += revenue - cost;
      productSalesMap.set(productId, existing);
    }
  }

  const archivedData = loadArchivedSalesData();

  for (const sale of archivedData) {
    const saleDate = new Date(sale.createdAt);
    const dayKey = saleDate.toISOString().split('T')[0];
    const weekKey = `${saleDate.getFullYear()}-W${Math.ceil((saleDate.getDate() - saleDate.getDay() + 1) / 7)}`;
    const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;

    const saleRevenue = Number(sale.total || 0);
    totalRevenue += saleRevenue;

    let saleCost = 0;
    if (sale.items && Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const quantity = Number(item.quantity || 0);
        const mappedCost = productCostById.get(Number(item.productId));
        if (Number.isFinite(mappedCost)) {
          saleCost += Number(mappedCost) * quantity;
        } else {
          saleCost += (Number(item.price || 0) * 0.7) * quantity;
        }
      }
    }
    totalCost += saleCost;
    const profit = saleRevenue - saleCost;

    if (!dailyProfits[dayKey]) dailyProfits[dayKey] = { revenue: 0, cost: 0, profit: 0 };
    dailyProfits[dayKey].revenue += saleRevenue;
    dailyProfits[dayKey].cost += saleCost;
    dailyProfits[dayKey].profit += profit;

    if (!weeklyProfits[weekKey]) weeklyProfits[weekKey] = { revenue: 0, cost: 0, profit: 0 };
    weeklyProfits[weekKey].revenue += saleRevenue;
    weeklyProfits[weekKey].cost += saleCost;
    weeklyProfits[weekKey].profit += profit;

    if (!monthlyProfits[monthKey]) monthlyProfits[monthKey] = { revenue: 0, cost: 0, profit: 0 };
    monthlyProfits[monthKey].revenue += saleRevenue;
    monthlyProfits[monthKey].cost += saleCost;
    monthlyProfits[monthKey].profit += profit;

    const monthlyBucket = ensureMonthlyBucket(monthlyBreakdownMap, monthKey);
    monthlyBucket.revenue += saleRevenue;
    monthlyBucket.cost += saleCost;
    monthlyBucket.profit += profit;
    monthlyBucket.invoices += 1;
    monthlyBucket.archivedInvoices += 1;
    monthlyBucket.soldItems += Array.isArray(sale.items)
      ? sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0;

    for (const item of sale.items || []) {
      const productId = Number(item.productId || 0);
      if (!productId) continue;
      const existing = productSalesMap.get(productId) || {
        productId,
        name: item.product?.name || item.name || `منتج ${productId}`,
        quantity: 0,
        revenue: 0,
        cost: 0,
        profit: 0
      };
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.price || 0) * quantity;
      const mappedCost = Number(productCostById.get(productId) || 0);
      const cost = mappedCost > 0 ? mappedCost * quantity : (Number(item.price || 0) * 0.7) * quantity;
      existing.quantity += quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += revenue - cost;
      productSalesMap.set(productId, existing);
    }
  }

  const dailyKeys = Object.keys(dailyProfits);
  const avgDailyProfit = dailyKeys.length > 0 ? Object.values(dailyProfits).reduce((sum, d) => sum + d.profit, 0) / dailyKeys.length : 0;

  const weeklyKeys = Object.keys(weeklyProfits);
  const avgWeeklyProfit = weeklyKeys.length > 0 ? Object.values(weeklyProfits).reduce((sum, w) => sum + w.profit, 0) / weeklyKeys.length : 0;

  const monthlyKeys = Object.keys(monthlyProfits);
  const avgMonthlyProfit = monthlyKeys.length > 0 ? Object.values(monthlyProfits).reduce((sum, m) => sum + m.profit, 0) / monthlyKeys.length : 0;
  const monthlyBreakdown = Object.values(monthlyBreakdownMap)
    .map((bucket) => ({
      ...bucket,
      marginPercent: bucket.revenue > 0 ? Number(((bucket.profit / bucket.revenue) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    .slice(0, 18);
  const productSalesSummary = Array.from(productSalesMap.values())
    .map((item) => ({
      ...item,
      marginPercent: item.revenue > 0 ? Number((((item.revenue - item.cost) / item.revenue) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 20);

  return {
    totalRevenue: totalRevenue.toFixed(2),
    totalCost: totalCost.toFixed(2),
    totalProfit: (totalRevenue - totalCost).toFixed(2),
    avgDailyProfit: avgDailyProfit.toFixed(2),
    avgWeeklyProfit: avgWeeklyProfit.toFixed(2),
    avgMonthlyProfit: avgMonthlyProfit.toFixed(2),
    salesCount: sales.length + archivedData.length,
    liveSalesCount: sales.length,
    archivedSalesCount: archivedData.length,
    recentSales: sales.slice(0, 10).map(s => ({
      date: s.createdAt,
      total: s.total,
      itemsCount: s.items.length,
      cashier: s.cashier?.name || s.cashier?.username || 'غير محدد'
    })),
    monthlyBreakdown,
    productSalesSummary,
    topProfitableDays: Object.entries(dailyProfits)
      .sort(([,a], [,b]) => b.profit - a.profit)
      .slice(0, 5)
      .map(([date, data]) => ({ date, profit: data.profit.toFixed(2) })),
    topProfitableWeeks: Object.entries(weeklyProfits)
      .sort(([,a], [,b]) => b.profit - a.profit)
      .slice(0, 5)
      .map(([week, data]) => ({ week, profit: data.profit.toFixed(2) })),
    topProfitableMonths: Object.entries(monthlyProfits)
      .sort(([,a], [,b]) => b.profit - a.profit)
      .slice(0, 5)
      .map(([month, data]) => ({ month, profit: data.profit.toFixed(2) }))
  };
}

function formatArabicCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ar-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

async function buildFullAiContext() {
  const prisma = await getPrisma();
  const baseContext = await computeAiContext();
  const safeQuery = async (query, fallback) => {
    try {
      return await query();
    } catch (error) {
      const message = String(error?.message || error || '');
      if (error?.code === 'P2021' || message.includes('does not exist')) {
        return fallback;
      }
      throw error;
    }
  };

  const [
    products,
    categoriesCount,
    returns,
    purchaseInvoices,
    supplierPayments,
    debts,
    clientsCount,
    users,
    activityLogs,
    invoiceChangeLogs,
    dailyNotes,
    chickenLegLogs
  ] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        unitsPerBox: true,
        boxPurchasePrice: true,
        boxSalePrice: true,
        category: { select: { id: true, name: true } }
      }
    }),
    prisma.category.count(),
    prisma.return.findMany({
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } }
          }
        },
        cashier: {
          select: { id: true, username: true, name: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    }),
    prisma.purchaseInvoice.findMany({
      include: { items: true },
      orderBy: { timestamp: 'desc' },
      take: 500
    }),
    prisma.supplierPayment.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500
    }),
    prisma.debt.findMany({
      include: {
        client: { select: { id: true, name: true, phone: true } },
        payments: true,
        createdBy: { select: { id: true, username: true, name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    }),
    prisma.client.count(),
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            sales: true,
            returns: true,
            activityLogs: true,
            debtsCreated: true,
            debtPayments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    safeQuery(() => prisma.userActivityLog.findMany({
      include: {
        user: { select: { id: true, username: true, name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    }), []),
    safeQuery(() => prisma.invoiceChangeLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    }), []),
    safeQuery(() => prisma.dailyNote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    }), []),
    safeQuery(() => prisma.chickenLegLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    }), [])
  ]);

  const pricingLogs = readPricingLogs();
  const centerCashboxEntries = sortCenterCashboxEntries(readCenterCashboxEntries());
  const sampleProducts = products
    .filter((product) => String(product?.name || '').trim())
    .slice(0, 25)
    .map((product) => ({
      id: product.id,
      name: String(product.name || '').trim(),
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      category: product.category?.name || null
    }));
  const lowStockProducts = products
    .filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5)
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  const outOfStockProducts = products
    .filter((product) => Number(product.stock || 0) <= 0)
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  const inventoryValue = products.reduce((sum, product) => {
    const unitsPerBox = Number(product.unitsPerBox || 1) > 0 ? Number(product.unitsPerBox || 1) : 1;
    const costPerUnit = Number(product.boxPurchasePrice || 0) / unitsPerBox;
    return sum + (costPerUnit * Number(product.stock || 0));
  }, 0);
  const retailInventoryValue = products.reduce((sum, product) => {
    return sum + (Number(product.price || 0) * Number(product.stock || 0));
  }, 0);

  const topSellingProducts = new Map();
  for (const sale of baseContext.recentSales || []) {
    void sale;
  }

  const returnsCount = returns.length;
  const returnedItemsCount = returns.reduce((sum, record) => {
    return sum + record.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0);
  }, 0);
  const returnsValue = returns.reduce((sum, record) => {
    return sum + record.items.reduce((itemSum, item) => itemSum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
  }, 0);

  const purchaseInvoicesCount = purchaseInvoices.length;
  const purchaseInvoicesTotal = purchaseInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const purchaseItemsCount = purchaseInvoices.reduce((sum, invoice) => sum + Number(invoice.itemsCount || 0), 0);
  const supplierPaymentsCount = supplierPayments.length;
  const supplierPaymentsTotal = supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const totalDebtAmount = debts.reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
  const paidDebtAmount = debts.reduce((sum, debt) => sum + (debt.paid ? Number(debt.amount || 0) : 0), 0);
  const unpaidDebtAmount = debts.reduce((sum, debt) => sum + (!debt.paid ? Number(debt.amount || 0) : 0), 0);
  const debtPaymentsCount = debts.reduce((sum, debt) => sum + (Array.isArray(debt.payments) ? debt.payments.length : 0), 0);
  const debtPaymentsTotal = debts.reduce((sum, debt) => {
    return sum + (Array.isArray(debt.payments)
      ? debt.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount || 0), 0)
      : 0);
  }, 0);
  const overdueDebtsCount = debts.filter((debt) => {
    if (debt.paid || !debt.dueDate) return false;
    const dueDate = new Date(debt.dueDate);
    return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
  }).length;

  const usersByRole = users.reduce((acc, user) => {
    const roleKey = String(user.role || 'unknown');
    acc[roleKey] = (acc[roleKey] || 0) + 1;
    return acc;
  }, {});
  const recentLoginCount = activityLogs.filter((log) => String(log.action || '').toLowerCase() === 'login').length;
  const recentLogoutCount = activityLogs.filter((log) => String(log.action || '').toLowerCase() === 'logout').length;
  const recentSalesByCashier = {};
  for (const sale of baseContext.recentSales || []) {
    const cashierName = String(sale.cashier || 'غير محدد');
    if (!recentSalesByCashier[cashierName]) {
      recentSalesByCashier[cashierName] = { cashier: cashierName, invoices: 0, revenue: 0, itemsSold: 0 };
    }
    recentSalesByCashier[cashierName].invoices += 1;
    recentSalesByCashier[cashierName].revenue += Number(sale.total || 0);
    recentSalesByCashier[cashierName].itemsSold += Number(sale.itemsCount || 0);
  }
  const activeEmployees = Object.values(recentSalesByCashier)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const invoiceChangesByAction = invoiceChangeLogs.reduce((acc, log) => {
    const actionKey = String(log.action || 'unknown');
    acc[actionKey] = (acc[actionKey] || 0) + 1;
    return acc;
  }, {});
  const pricingLogsBySource = pricingLogs.reduce((acc, log) => {
    const sourceKey = String(log?.source || 'manual');
    acc[sourceKey] = (acc[sourceKey] || 0) + 1;
    return acc;
  }, {});
  const dailyNotesByType = dailyNotes.reduce((acc, note) => {
    const typeKey = String(note.type || 'other');
    if (!acc[typeKey]) {
      acc[typeKey] = { count: 0, total: 0 };
    }
    acc[typeKey].count += 1;
    acc[typeKey].total += Number(note.amount || 0);
    return acc;
  }, {});
  const centerCashboxBalance = centerCashboxEntries.reduce((sum, entry) => {
    const amount = Number(entry?.amount || 0);
    return sum + (String(entry?.type || '').toLowerCase() === 'withdrawal' ? -amount : amount);
  }, 0);
  const monthlyAnalyticsMap = {};
  for (const baseMonth of Array.isArray(baseContext.monthlyBreakdown) ? baseContext.monthlyBreakdown : []) {
    monthlyAnalyticsMap[baseMonth.month] = { ...baseMonth };
  }
  const touchMonthlyAnalytics = (value) => {
    const monthKey = getMonthKey(value);
    if (!monthKey) return null;
    if (!monthlyAnalyticsMap[monthKey]) {
      monthlyAnalyticsMap[monthKey] = ensureMonthlyBucket({}, monthKey);
    }
    return monthlyAnalyticsMap[monthKey];
  };

  for (const record of returns) {
    const bucket = touchMonthlyAnalytics(record.createdAt);
    if (!bucket) continue;
    bucket.returnsCount += 1;
    bucket.returnsValue += record.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
  }

  for (const invoice of purchaseInvoices) {
    const bucket = touchMonthlyAnalytics(invoice.timestamp);
    if (!bucket) continue;
    bucket.purchaseInvoicesCount += 1;
    bucket.purchaseInvoicesTotal += Number(invoice.totalAmount || 0);
  }

  for (const payment of supplierPayments) {
    const bucket = touchMonthlyAnalytics(payment.timestamp);
    if (!bucket) continue;
    bucket.supplierPaymentsCount += 1;
    bucket.supplierPaymentsTotal += Number(payment.amount || 0);
  }

  for (const debt of debts) {
    const debtBucket = touchMonthlyAnalytics(debt.createdAt);
    if (debtBucket) {
      debtBucket.debtCreatedAmount += Number(debt.amount || 0);
    }
    for (const payment of debt.payments || []) {
      const paymentBucket = touchMonthlyAnalytics(payment.createdAt || payment.paymentDate || payment.date);
      if (!paymentBucket) continue;
      paymentBucket.debtPaidAmount += Number(payment.amount || 0);
      paymentBucket.debtPaymentsCount += 1;
    }
  }

  for (const log of activityLogs) {
    const bucket = touchMonthlyAnalytics(log.createdAt);
    if (!bucket) continue;
    bucket.activityCount += 1;
    const action = String(log.action || '').toLowerCase();
    if (action === 'login') bucket.logins += 1;
    if (action === 'logout') bucket.logouts += 1;
  }

  for (const log of pricingLogs) {
    const bucket = touchMonthlyAnalytics(log?.createdAt);
    if (!bucket) continue;
    bucket.pricingChanges += 1;
  }

  for (const log of invoiceChangeLogs) {
    const bucket = touchMonthlyAnalytics(log.createdAt);
    if (!bucket) continue;
    bucket.invoiceChanges += 1;
  }

  for (const note of dailyNotes) {
    const bucket = touchMonthlyAnalytics(note.createdAt || note.noteDate);
    if (!bucket) continue;
    bucket.notesCount += 1;
    bucket.notesAmount += Number(note.amount || 0);
  }

  for (const entry of centerCashboxEntries) {
    const bucket = touchMonthlyAnalytics(entry?.createdAt);
    if (!bucket) continue;
    const amount = Number(entry?.amount || 0);
    const type = String(entry?.type || '').toLowerCase();
    if (type === 'withdrawal') {
      bucket.cashboxOut += amount;
      bucket.cashboxNet -= amount;
    } else {
      bucket.cashboxIn += amount;
      bucket.cashboxNet += amount;
    }
  }

  const monthlyAnalytics = Object.values(monthlyAnalyticsMap)
    .map((bucket) => ({
      ...bucket,
      marginPercent: Number(bucket.marginPercent || (bucket.revenue > 0 ? ((bucket.profit / bucket.revenue) * 100) : 0)).toFixed(2),
    }))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    .slice(0, 18);
  const latestMonthReport = monthlyAnalytics[0] || null;

  return {
    ...baseContext,
    categoriesCount,
    clientsCount,
    inventory: {
      productsCount: products.length,
      categoriesCount,
      sampleProducts,
      totalStockUnits: products.reduce((sum, product) => sum + Number(product.stock || 0), 0),
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      inventoryValue: inventoryValue.toFixed(2),
      retailInventoryValue: retailInventoryValue.toFixed(2),
      lowStockProducts: lowStockProducts.slice(0, 10).map((product) => ({
        id: product.id,
        name: product.name,
        stock: Number(product.stock || 0),
        price: Number(product.price || 0),
        category: product.category?.name || null
      })),
      outOfStockProducts: outOfStockProducts.slice(0, 10).map((product) => ({
        id: product.id,
        name: product.name,
        stock: Number(product.stock || 0),
        price: Number(product.price || 0),
        category: product.category?.name || null
      })),
      topSellingProducts: (Array.isArray(baseContext.productSalesSummary) ? baseContext.productSalesSummary : []).slice(0, 10)
    },
    returns: {
      returnsCount,
      returnedItemsCount,
      returnsValue: returnsValue.toFixed(2),
      recentReturns: returns.slice(0, 10).map((record) => ({
        id: record.id,
        createdAt: record.createdAt,
        cashier: record.cashier?.name || record.cashier?.username || 'غير محدد',
        itemsCount: record.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        amount: record.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0)
      }))
    },
    purchasing: {
      purchaseInvoicesCount,
      purchaseInvoicesTotal: purchaseInvoicesTotal.toFixed(2),
      purchaseItemsCount,
      recentPurchaseInvoices: purchaseInvoices.slice(0, 10).map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || null,
        supplierName: invoice.supplierName || 'غير محدد',
        totalAmount: Number(invoice.totalAmount || 0),
        itemsCount: Number(invoice.itemsCount || 0),
        timestamp: invoice.timestamp
      })),
      supplierPaymentsCount,
      supplierPaymentsTotal: supplierPaymentsTotal.toFixed(2),
      recentSupplierPayments: supplierPayments.slice(0, 10).map((payment) => ({
        id: payment.id,
        supplierName: payment.supplierName,
        amount: Number(payment.amount || 0),
        timestamp: payment.timestamp
      }))
    },
    debts: {
      debtsCount: debts.length,
      clientsCount,
      totalDebtAmount: totalDebtAmount.toFixed(2),
      paidDebtAmount: paidDebtAmount.toFixed(2),
      unpaidDebtAmount: unpaidDebtAmount.toFixed(2),
      debtPaymentsCount,
      debtPaymentsTotal: debtPaymentsTotal.toFixed(2),
      overdueDebtsCount,
      recentDebts: debts.slice(0, 10).map((debt) => ({
        id: debt.id,
        clientName: debt.client?.name || 'غير محدد',
        amount: Number(debt.amount || 0),
        paid: Boolean(debt.paid),
        dueDate: debt.dueDate,
        createdAt: debt.createdAt
      }))
    },
    employees: {
      usersCount: users.length,
      usersByRole,
      recentLoginCount,
      recentLogoutCount,
      activeEmployees,
      recentActivityLogs: activityLogs.slice(0, 20).map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        user: log.user?.name || log.user?.username || `#${log.userId}`
      }))
    },
    pricing: {
      pricingLogsCount: pricingLogs.length,
      pricingLogsBySource,
      recentPricingLogs: pricingLogs.slice(0, 10).map((log) => ({
        createdAt: log?.createdAt || null,
        productName: log?.productName || null,
        source: log?.source || null,
        note: log?.note || null,
        oldUnitPrice: Number(log?.oldUnitPrice || 0),
        newUnitPrice: Number(log?.newUnitPrice || 0),
        oldBoxPrice: Number(log?.oldBoxPrice || 0),
        newBoxPrice: Number(log?.newBoxPrice || 0)
      }))
    },
    invoiceAudit: {
      invoiceChangesCount: invoiceChangeLogs.length,
      invoiceChangesByAction,
      recentInvoiceChanges: invoiceChangeLogs.slice(0, 10).map((log) => ({
        id: log.id,
        invoiceType: log.invoiceType,
        invoiceId: log.invoiceId,
        action: log.action,
        userName: log.userName || null,
        description: log.description || null,
        createdAt: log.createdAt
      }))
    },
    cashbox: {
      entriesCount: centerCashboxEntries.length,
      balance: centerCashboxBalance.toFixed(2),
      recentEntries: centerCashboxEntries.slice(0, 10).map((entry) => ({
        id: entry?.id || null,
        type: entry?.type || null,
        amount: Number(entry?.amount || 0),
        note: entry?.note || null,
        createdByName: entry?.createdByName || null,
        createdAt: entry?.createdAt || null
      }))
    },
    notes: {
      notesCount: dailyNotes.length,
      notesByType: dailyNotesByType,
      recentNotes: dailyNotes.slice(0, 10).map((note) => ({
        id: note.id,
        type: note.type,
        amount: Number(note.amount || 0),
        text: note.text,
        noteDate: note.noteDate,
        createdAt: note.createdAt
      }))
    },
    chickenLeg: {
      logsCount: chickenLegLogs.length,
      recentLogs: chickenLegLogs.slice(0, 10).map((log) => ({
        id: log.id,
        name: log.name,
        reason: log.reason,
        quantity: Number(log.quantity || 0),
        logDate: log.logDate,
        createdAt: log.createdAt
      }))
    },
    monthlyAnalytics,
    latestMonthReport
  };
}

function buildAiContextSummary(context) {
  const sampleProductNames = Array.isArray(context.inventory?.sampleProducts)
    ? context.inventory.sampleProducts
        .map((product) => String(product?.name || '').trim())
        .filter(Boolean)
        .slice(0, 15)
    : [];
  const latestMonth = context?.latestMonthReport || context?.monthlyAnalytics?.[0] || null;
  return [
    'You have access to the full cashier scope, not only sales.',
    'Use the following extended context when answering.',
    `Products Count: ${context.inventory?.productsCount || 0}`,
    `Sample Product Names: ${sampleProductNames.length ? sampleProductNames.join(', ') : 'No product names available'}`,
    `Low Stock Products: ${context.inventory?.lowStockCount || 0}`,
    `Out Of Stock Products: ${context.inventory?.outOfStockCount || 0}`,
    `Inventory Cost Value: ${context.inventory?.inventoryValue || 0} IQD`,
    `Inventory Retail Value: ${context.inventory?.retailInventoryValue || 0} IQD`,
    `Returns Count: ${context.returns?.returnsCount || 0}`,
    `Returns Value: ${context.returns?.returnsValue || 0} IQD`,
    `Purchase Invoices Count: ${context.purchasing?.purchaseInvoicesCount || 0}`,
    `Purchase Invoices Total: ${context.purchasing?.purchaseInvoicesTotal || 0} IQD`,
    `Supplier Payments Total: ${context.purchasing?.supplierPaymentsTotal || 0} IQD`,
    `Debts Count: ${context.debts?.debtsCount || 0}`,
    `Unpaid Debt Amount: ${context.debts?.unpaidDebtAmount || 0} IQD`,
    `Overdue Debts Count: ${context.debts?.overdueDebtsCount || 0}`,
    `Employees Count: ${context.employees?.usersCount || 0}`,
    `Recent Login Count: ${context.employees?.recentLoginCount || 0}`,
    `Recent Logout Count: ${context.employees?.recentLogoutCount || 0}`,
    `Pricing Logs Count: ${context.pricing?.pricingLogsCount || 0}`,
    `Invoice Changes Count: ${context.invoiceAudit?.invoiceChangesCount || 0}`,
    `Cashbox Entries Count: ${context.cashbox?.entriesCount || 0}`,
    `Cashbox Net Balance: ${context.cashbox?.balance || 0} IQD`,
    `Daily Notes Count: ${context.notes?.notesCount || 0}`,
    `Monthly Reports Available: ${Array.isArray(context.monthlyAnalytics) ? context.monthlyAnalytics.length : 0}`,
    latestMonth ? `Latest Month Report: ${latestMonth.month} | revenue ${latestMonth.revenue} | profit ${latestMonth.profit} | invoices ${latestMonth.invoices} | archived ${latestMonth.archivedInvoices}` : 'Latest Month Report: unavailable',
    'When asked for a monthly report, build it from the monthly analytics that already combine live and archived invoices with returns, purchases, debts, staff activity, pricing, notes, and cashbox changes.',
    'When asked for a full cashier report, cover sales, archived invoices, inventory, purchases, suppliers, debts, employees, pricing, invoice audit, cashbox, and notes.',
    'Never claim that you do not have access to cashier data if the aggregated summary above is available.',
    'Always answer in Arabic.'
  ].join('\n');
}

function buildDirectProductNamesReply(context) {
  const sampleProducts = Array.isArray(context.inventory?.sampleProducts)
    ? context.inventory.sampleProducts.filter((product) => String(product?.name || '').trim())
    : [];

  if (!sampleProducts.length) {
    return 'لا توجد أسماء منتجات متاحة حالياً في البيانات المقروءة من قاعدة الكاشير.';
  }

  const lines = [
    'بعض أسماء المنتجات الموجودة حالياً:',
    '',
    ...sampleProducts.slice(0, 15).map((product, index) => {
      const parts = [`${index + 1}. ${product.name}`];
      if (Number.isFinite(Number(product.price))) {
        parts.push(`السعر: ${formatArabicCurrency(product.price)} د.ع`);
      }
      if (Number.isFinite(Number(product.stock))) {
        parts.push(`المخزون: ${Number(product.stock)}`);
      }
      if (product.category) {
        parts.push(`التصنيف: ${product.category}`);
      }
      return parts.join(' | ');
    })
  ];

  if (sampleProducts.length > 15) {
    lines.push('');
    lines.push(`يوجد أيضاً منتجات أخرى، وعدد المنتجات الكلي: ${Number(context.inventory?.productsCount || sampleProducts.length)}.`);
  }

  return lines.join('\n');
}

function resolveRequestedMonth(message, context) {
  const normalized = String(message || '').trim();
  const explicitMonth = normalized.match(/(20\d{2})[-\/](0[1-9]|1[0-2])/);
  if (explicitMonth) {
    return `${explicitMonth[1]}-${explicitMonth[2]}`;
  }

  const monthNames = {
    'كانون الثاني': '01',
    'يناير': '01',
    'شباط': '02',
    'فبراير': '02',
    'آذار': '03',
    'مارس': '03',
    'نيسان': '04',
    'أبريل': '04',
    'ابريل': '04',
    'مايو': '05',
    'أيار': '05',
    'حزيران': '06',
    'يونيو': '06',
    'تموز': '07',
    'يوليو': '07',
    'آب': '08',
    'أغسطس': '08',
    'اغسطس': '08',
    'أيلول': '09',
    'سبتمبر': '09',
    'تشرين الأول': '10',
    'اكتوبر': '10',
    'أكتوبر': '10',
    'تشرين الثاني': '11',
    'نوفمبر': '11',
    'كانون الأول': '12',
    'ديسمبر': '12'
  };

  const yearMatch = normalized.match(/20\d{2}/);
  for (const [name, monthNumber] of Object.entries(monthNames)) {
    if (normalized.includes(name)) {
      const year = yearMatch ? yearMatch[0] : String(new Date().getFullYear());
      return `${year}-${monthNumber}`;
    }
  }

  return context?.latestMonthReport?.month || context?.monthlyAnalytics?.[0]?.month || null;
}

function buildMonthlyCashierReport(context, requestedMonth = null) {
  const monthKey = requestedMonth || context?.latestMonthReport?.month || context?.monthlyAnalytics?.[0]?.month;
  const report = Array.isArray(context?.monthlyAnalytics)
    ? context.monthlyAnalytics.find((item) => item.month === monthKey)
    : null;

  if (!report) {
    return 'لا توجد بيانات شهرية كافية لبناء تقرير شهري حاليًا من الكاشير والأرشيف.';
  }

  const lines = [
    `تقرير شهري شامل للكاشير عن ${report.month}`,
    '',
    `المبيعات الكلية: ${formatArabicCurrency(report.revenue)} د.ع`,
    `الكلفة التقديرية: ${formatArabicCurrency(report.cost)} د.ع`,
    `الربح التقديري: ${formatArabicCurrency(report.profit)} د.ع`,
    `هامش الربح: ${Number(report.marginPercent || 0).toFixed(1)}%`,
    `عدد الفواتير: ${Number(report.invoices || 0)} | مباشر: ${Number(report.liveInvoices || 0)} | مؤرشف: ${Number(report.archivedInvoices || 0)}`,
    `عدد القطع المباعة: ${Number(report.soldItems || 0)}`,
    `المرتجعات: ${Number(report.returnsCount || 0)} | القيمة: ${formatArabicCurrency(report.returnsValue)} د.ع`,
    `فواتير الشراء: ${Number(report.purchaseInvoicesCount || 0)} | الإجمالي: ${formatArabicCurrency(report.purchaseInvoicesTotal)} د.ع`,
    `مدفوعات الموردين: ${Number(report.supplierPaymentsCount || 0)} | الإجمالي: ${formatArabicCurrency(report.supplierPaymentsTotal)} د.ع`,
    `الديون المنشأة: ${formatArabicCurrency(report.debtCreatedAmount)} د.ع`,
    `المبالغ المسددة من الديون: ${formatArabicCurrency(report.debtPaidAmount)} د.ع | دفعات: ${Number(report.debtPaymentsCount || 0)}`,
    `النشاط الإداري والموظفين: ${Number(report.activityCount || 0)} | دخول: ${Number(report.logins || 0)} | خروج: ${Number(report.logouts || 0)}`,
    `تغييرات التسعير: ${Number(report.pricingChanges || 0)} | تعديلات الفواتير: ${Number(report.invoiceChanges || 0)}`,
    `الملاحظات اليومية: ${Number(report.notesCount || 0)} | مبالغها: ${formatArabicCurrency(report.notesAmount)} د.ع`,
    `الصندوق المركزي: داخل ${formatArabicCurrency(report.cashboxIn)} د.ع | خارج ${formatArabicCurrency(report.cashboxOut)} د.ع | الصافي ${formatArabicCurrency(report.cashboxNet)} د.ع`,
    '',
    'هذا التقرير يشمل الفواتير المباشرة والفواتير المؤرشفة ضمن نفس الشهر.'
  ];

  return lines.join('\n');
}

function buildFullCashierOverview(context) {
  const topMonths = Array.isArray(context?.monthlyAnalytics) ? context.monthlyAnalytics.slice(0, 3) : [];
  const topProducts = Array.isArray(context?.inventory?.topSellingProducts) ? context.inventory.topSellingProducts.slice(0, 5) : [];
  const lines = [
    'تقرير شامل لكل الكاشير',
    '',
    `إجمالي المبيعات: ${formatArabicCurrency(context.totalRevenue)} د.ع`,
    `إجمالي الربح: ${formatArabicCurrency(context.totalProfit)} د.ع`,
    `عدد الفواتير الكلي: ${Number(context.salesCount || 0)} | مباشر: ${Number(context.liveSalesCount || 0)} | مؤرشف: ${Number(context.archivedSalesCount || 0)}`,
    `المخزون: ${Number(context.inventory?.productsCount || 0)} منتج | نازل المخزون: ${Number(context.inventory?.lowStockCount || 0)} | نافد: ${Number(context.inventory?.outOfStockCount || 0)}`,
    `قيمة المخزون بالكلفة: ${formatArabicCurrency(context.inventory?.inventoryValue)} د.ع | بالبيع: ${formatArabicCurrency(context.inventory?.retailInventoryValue)} د.ع`,
    `المرتجعات: ${Number(context.returns?.returnsCount || 0)} | القيمة: ${formatArabicCurrency(context.returns?.returnsValue)} د.ع`,
    `المشتريات: ${Number(context.purchasing?.purchaseInvoicesCount || 0)} | الإجمالي: ${formatArabicCurrency(context.purchasing?.purchaseInvoicesTotal)} د.ع`,
    `مدفوعات الموردين: ${formatArabicCurrency(context.purchasing?.supplierPaymentsTotal)} د.ع`,
    `الديون غير المسددة: ${formatArabicCurrency(context.debts?.unpaidDebtAmount)} د.ع | المتأخر: ${Number(context.debts?.overdueDebtsCount || 0)}`,
    `الموظفون: ${Number(context.employees?.usersCount || 0)} | نشاط حديث: ${Number(context.employees?.recentLoginCount || 0)} دخول / ${Number(context.employees?.recentLogoutCount || 0)} خروج`,
    `الصندوق المركزي الصافي: ${formatArabicCurrency(context.cashbox?.balance)} د.ع`,
    `سجل التسعير: ${Number(context.pricing?.pricingLogsCount || 0)} | تعديلات الفواتير: ${Number(context.invoiceAudit?.invoiceChangesCount || 0)}`,
    ''
  ];

  if (topMonths.length) {
    lines.push('أفضل الأشهر الأخيرة:');
    for (const month of topMonths) {
      lines.push(`- ${month.month}: ربح ${formatArabicCurrency(month.profit)} د.ع من ${Number(month.invoices || 0)} فاتورة`);
    }
    lines.push('');
  }

  if (topProducts.length) {
    lines.push('أكثر المنتجات دورانًا:');
    for (const product of topProducts) {
      lines.push(`- ${product.name}: كمية ${Number(product.quantity || 0)} | إيراد ${formatArabicCurrency(product.revenue)} د.ع`);
    }
  }

  return lines.join('\n');
}

function isMonthlyReportQuery(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (/(20\d{2})[-\/](0[1-9]|1[0-2])/.test(normalized) && (normalized.includes('report') || normalized.includes('تقرير'))) {
    return true;
  }
  const monthlyTerms = ['تقرير شهري', 'تحليل شهري', 'ملخص شهري', 'الشهر', 'شهري', 'monthly report', 'monthly'];
  return monthlyTerms.some((term) => normalized.includes(term.toLowerCase()));
}

function isFullCashierReportQuery(message) {
  const normalized = String(message || '').trim().toLowerCase();
  const terms = ['كل الكاشير', 'كامل الكاشير', 'شامل الكاشير', 'تقرير شامل', 'full cashier', 'full report', 'overall report'];
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function buildComprehensiveOfflineAIInsight(message, context) {
  const lines = [
    'تعذر الاتصال بمزود الذكاء الاصطناعي حالياً بسبب حد الاستخدام، لذلك هذا تحليل محلي مباشر من بيانات الكاشير:',
    '',
    `المبيعات: ${formatArabicCurrency(context.totalRevenue)} د.ع | الربح: ${formatArabicCurrency(context.totalProfit)} د.ع | الفواتير: ${Number(context.salesCount || 0)}`,
    `المخزون: ${Number(context.inventory?.productsCount || 0)} منتج | قليل المخزون: ${Number(context.inventory?.lowStockCount || 0)} | نافد: ${Number(context.inventory?.outOfStockCount || 0)}`,
    `المرتجعات: ${Number(context.returns?.returnsCount || 0)} | القيمة: ${formatArabicCurrency(context.returns?.returnsValue)} د.ع`,
    `المشتريات: ${Number(context.purchasing?.purchaseInvoicesCount || 0)} | الإجمالي: ${formatArabicCurrency(context.purchasing?.purchaseInvoicesTotal)} د.ع`,
    `الموردون: مدفوعات بعدد ${Number(context.purchasing?.supplierPaymentsCount || 0)} | الإجمالي: ${formatArabicCurrency(context.purchasing?.supplierPaymentsTotal)} د.ع`,
    `الديون: ${Number(context.debts?.debtsCount || 0)} | غير المسدد: ${formatArabicCurrency(context.debts?.unpaidDebtAmount)} د.ع | المتأخر: ${Number(context.debts?.overdueDebtsCount || 0)}`,
    `الموظفون: ${Number(context.employees?.usersCount || 0)} | دخول حديث: ${Number(context.employees?.recentLoginCount || 0)} | خروج حديث: ${Number(context.employees?.recentLogoutCount || 0)}`,
    `سجل التسعير: ${Number(context.pricing?.pricingLogsCount || 0)} | تعديلات الفواتير: ${Number(context.invoiceAudit?.invoiceChangesCount || 0)}`,
    `الصندوق المركزي: ${Number(context.cashbox?.entriesCount || 0)} حركة | الرصيد الصافي: ${formatArabicCurrency(context.cashbox?.balance)} د.ع`,
    `الملاحظات اليومية: ${Number(context.notes?.notesCount || 0)} | أرشيف الفواتير: ${Number(context.archivedSalesCount || 0)}`,
    ''
  ];

  if (/مخزون|منتجات|بضاعة|stock|product/i.test(String(message || ''))) {
    lines.push('الملاحظة: الأولوية الآن للمنتجات النافدة وقليلة المخزون، ثم مراجعة قيمة المخزون مقابل سرعة الدوران.');
  } else if (/موظف|موظفين|كاشير|نشاط|employee|staff|user/i.test(String(message || ''))) {
    lines.push('الملاحظة: يمكنك تقييم الموظفين من سجل الدخول والخروج وربطه بحركة الفواتير الحديثة.');
  } else if (/دين|ديون|عميل|مورد|purchase|supplier|debt/i.test(String(message || ''))) {
    lines.push('الملاحظة: راقب الديون غير المسددة والمتأخرة مع مدفوعات الموردين حتى لا يختنق التدفق النقدي.');
  } else if (/تسعير|سعر|pricing|price|فاتورة|فواتير|invoice/i.test(String(message || ''))) {
    lines.push('الملاحظة: لديك الآن بيانات كافية عن التسعير وتعديلات الفواتير لإعطاء تفسير أدق لأي تغير في الهامش أو المبيعات.');
  } else {
    lines.push('يمكنك سؤالي مباشرة عن المنتجات، الفواتير، الأرشيف، الموظفين، النشاط، التسعير، الديون، الموردين، المرتجعات أو الصندوق.');
  }

  return lines.join('\n');
}

function buildOfflineAIInsight(message, context) {
  const revenue = Number(context?.totalRevenue || 0);
  const cost = Number(context?.totalCost || 0);
  const profit = Number(context?.totalProfit || 0);
  const daily = Number(context?.avgDailyProfit || 0);
  const weekly = Number(context?.avgWeeklyProfit || 0);
  const monthly = Number(context?.avgMonthlyProfit || 0);
  const salesCount = Number(context?.salesCount || 0);
  const normalizedMessage = String(message || '').trim();
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const topDay = context?.topProfitableDays?.[0];
  const topWeek = context?.topProfitableWeeks?.[0];
  const topMonth = context?.topProfitableMonths?.[0];

  const lines = [
    'تعذر الاتصال بمزود الذكاء الاصطناعي حالياً بسبب حد الاستخدام، لذلك هذا تحليل محلي مباشر من بيانات الكاشير:',
    '',
    `إجمالي المبيعات: ${formatArabicCurrency(revenue)} د.ع`,
    `إجمالي الكلفة: ${formatArabicCurrency(cost)} د.ع`,
    `إجمالي الربح: ${formatArabicCurrency(profit)} د.ع`,
    `هامش الربح التقريبي: ${margin.toFixed(1)}%`,
    `عدد الفواتير المسجلة: ${salesCount}`,
    `متوسط الربح اليومي: ${formatArabicCurrency(daily)} د.ع`,
    `متوسط الربح الأسبوعي: ${formatArabicCurrency(weekly)} د.ع`,
    `متوسط الربح الشهري: ${formatArabicCurrency(monthly)} د.ع`,
  ];

  if (topDay) {
    lines.push(`أفضل يوم ربحًا: ${topDay.date} بقيمة ${formatArabicCurrency(topDay.profit)} د.ع`);
  }
  if (topWeek) {
    lines.push(`أفضل أسبوع ربحًا: ${topWeek.week} بقيمة ${formatArabicCurrency(topWeek.profit)} د.ع`);
  }
  if (topMonth) {
    lines.push(`أفضل شهر ربحًا: ${topMonth.month} بقيمة ${formatArabicCurrency(topMonth.profit)} د.ع`);
  }

  lines.push('');

  if (/ربح|ارباح|أرباح|profit/i.test(normalizedMessage)) {
    if (profit <= 0) {
      lines.push('الملاحظة: الربح الحالي ضعيف أو صفر، راجع أسعار البيع والكلفة والمنتجات الراكدة.');
    } else if (margin < 10) {
      lines.push('الملاحظة: الربح موجود لكن الهامش منخفض، ويفضل مراجعة المنتجات الأقل ربحية.');
    } else {
      lines.push('الملاحظة: وضع الربحية جيد مبدئيًا حسب البيانات الحالية.');
    }
  } else if (/مبيعات|بيع|sales/i.test(normalizedMessage)) {
    lines.push('الملاحظة: راقب الفواتير الحديثة وقارن الأيام أو الأسابيع الأعلى ربحًا لتكرار نفس النمط البيعي.');
  } else if (/نصيحة|تحليل|رأي|recommend|advice/i.test(normalizedMessage)) {
    if (margin < 10) {
      lines.push('نصيحة: ابدأ بمراجعة المنتجات الأعلى دورانًا ثم ارفع هامش الربح تدريجيًا على المنتجات الأقل حساسية للسعر.');
    } else {
      lines.push('نصيحة: ركز على تثبيت المنتجات الأكثر ربحًا ومراقبة أي هبوط مفاجئ في متوسط الربح اليومي.');
    }
  } else {
    lines.push('إذا أردت جوابًا أدق، اسألني بصيغة مثل: حلل الأرباح، ما أفضل يوم، أو هل الربح منخفض؟');
  }

  return lines.join('\n');
}

// --- AI Chat Handler ---
ipcMain.handle('ai-chat', async (event, { message, userRole }) => {
  try {
    // Only allow admin users
    if (userRole !== 'admin') {
      return { ok: false, error: 'Access denied. Only admin can use AI chat.' };
    }
    const context = await buildFullAiContext();
    const normalizedMessage = String(message || '').trim();

    if (/((اعطني|هات|اذكر|شنو|ما هي|ماهي).*(اسماء|أسماء).*(المنتجات|منتجات))|((اسماء|أسماء).*(المنتجات|منتجات))/i.test(normalizedMessage)) {
      return {
        ok: true,
        response: buildDirectProductNamesReply(context),
        context,
        source: 'local-products',
      };
    }

    if (isMonthlyReportQuery(normalizedMessage)) {
      return {
        ok: true,
        response: buildMonthlyCashierReport(context, resolveRequestedMonth(normalizedMessage, context)),
        context,
        source: 'local-monthly-report',
      };
    }

    if (isFullCashierReportQuery(normalizedMessage)) {
      return {
        ok: true,
        response: buildFullCashierOverview(context),
        context,
        source: 'local-full-report',
      };
    }

    const prisma = await getPrisma();
    const [apiKeySetting, modelSetting] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: 'openRouterApiKey' } }),
      prisma.appSetting.findUnique({ where: { key: 'openRouterModel' } }),
    ]);
    const openRouterApiKey = String(apiKeySetting?.value || process.env.OPENROUTER_API_KEY || '').trim();
    const openRouterModel = String(
      modelSetting?.value || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free'
    ).trim() || 'meta-llama/llama-3.2-3b-instruct:free';

    if (!openRouterApiKey || openRouterApiKey === 'YOUR_OPENROUTER_TOKEN_HERE') {
      return {
        ok: false,
        error: 'يرجى إدخال مفتاح OpenRouter API من الإعدادات ثم المحاولة مرة أخرى.'
      };
    }

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com', // Optional
        'X-Title': 'POS System AI Assistant' // Optional
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a POS (Point of Sale) system. You help analyze sales data, profits, and provide insights.

You already have direct access to aggregated business data extracted from the cashier system itself.
This data includes BOTH:
- live invoices from the current database
- archived invoices loaded from archived sales files

Never say that you do not have access to invoices, archived invoices, or database data.
If the user asks about archived invoices, answer using the provided archived totals and explicitly mention that archived invoices are included in the analysis.
If some detail is unavailable at row-level, say that the answer is based on aggregated invoice data from live and archived sales.

Business Context:
- Total Revenue: ${context.totalRevenue} IQD
- Total Cost: ${context.totalCost} IQD  
- Total Profit: ${context.totalProfit} IQD
- Average Daily Profit: ${context.avgDailyProfit} IQD
- Average Weekly Profit: ${context.avgWeeklyProfit} IQD
- Average Monthly Profit: ${context.avgMonthlyProfit} IQD
- Total Sales: ${context.salesCount}
- Live Invoices Count: ${context.liveSalesCount}
- Archived Invoices Count: ${context.archivedSalesCount}

You can answer questions about:
- Profit calculations and analysis
- Sales trends and patterns
- Business performance metrics
- Recommendations for improvement
- Financial insights

Always respond in Arabic since this is for an Arabic POS system. Be helpful, accurate, and provide actionable insights.`
          },
          {
            role: 'system',
            content: buildAiContextSummary(context)
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      let providerMessage = '';
      try {
        const errorBody = await response.json();
        providerMessage = errorBody?.error?.message || errorBody?.message || '';
      } catch {
        providerMessage = '';
      }

      if (response.status === 429) {
        if (isMonthlyReportQuery(normalizedMessage)) {
          return {
            ok: true,
            response: buildMonthlyCashierReport(context, resolveRequestedMonth(normalizedMessage, context)),
            context,
            source: 'local-monthly-report',
            warning: 'OpenRouter rate limit reached',
          };
        }
        if (isFullCashierReportQuery(normalizedMessage)) {
          return {
            ok: true,
            response: buildFullCashierOverview(context),
            context,
            source: 'local-full-report',
            warning: 'OpenRouter rate limit reached',
          };
        }
        return {
          ok: true,
          response: buildComprehensiveOfflineAIInsight(message, context),
          context,
          source: 'local-fallback',
          warning: 'OpenRouter rate limit reached',
        };
      }

      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}${providerMessage ? ` - ${providerMessage}` : ''}`
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'عذراً، لم أتمكن من الحصول على رد من الذكاء الاصطناعي.';

    return { ok: true, response: aiResponse, context };

  } catch (error) {
    console.error('AI Chat error:', error);
    return { ok: false, error: `حدث خطأ في الدردشة مع الذكاء الاصطناعي: ${error.message}` };
  }
});

// --- ESC/POS Constants ---
const ESC = '\x1B';
const GS = '\x1D';
const NUL = '\x00';

const INIT_PRINTER = ESC + '@';
const CUT_PAPER = GS + 'V' + NUL;

const ALIGN_LEFT = ESC + 'a' + '\x00';
const ALIGN_CENTER = ESC + 'a' + '\x01';
const ALIGN_RIGHT = ESC + 'a' + '\x02';

const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';

const SET_ARABIC_CHARSET = ESC + 't' + '\x16'; // Back to CP1256 (22)
const SET_RTL_MODE = ESC + 'U' + '\x01'; // Set RTL mode for Arabic text
const DISABLE_CHINESE = '\x1C\x2E'; // FS . (Cancel Chinese mode)

// Global reference to the print window to prevent it from being garbage collected or closed too early
let printWindow = null;
let cachedPrinterName = null; // تخزين اسم الطابعة لتسريع العملية

/**
 * Handles thermal receipt printing using raw ESC/POS commands.
 * This implementation communicates directly with a USB thermal printer.
 * It includes a mock mode for development without a physical printer.
 *
 * @param {object} event - The IPC event object.
 * @param {object} receiptPayload - The invoice data.
 * @param {boolean} isMock - If true, writes to a file instead of printing.
 */
ipcMain.handle("thermal:print-receipt", async (event, receiptPayload, isMock = false) => {
  try {
    // --- NEW METHOD: HTML System Printing ---
    // This renders the receipt as HTML in a hidden window and prints it using the system driver.
    // This solves all Arabic encoding/reshaping issues.
    
    // Reuse existing window or create a new one if it doesn't exist
    if (!printWindow || printWindow.isDestroyed()) {
      console.log('Creating new background print window...');
      printWindow = new BrowserWindow({
      show: false,
      width: 600,   // ✔ مناسب لطابعة 80mm
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

      printWindow.on('closed', () => {
        printWindow = null;
        cachedPrinterName = null;
      });
    }

    const payload = receiptPayload || {};
    console.log('Receipt Payload Keys:', Object.keys(payload));
    
    // جلب إعدادات المتجر من قاعدة البيانات لضمان استخدام الاسم والعنوان المحدثين
    try {
      const prisma = await getPrisma();
        const settings = await prisma.appSetting.findMany({
          where: { key: { in: ['storeName', 'storeAddress', 'storePhone', 'receiptBarcodeEnabled', 'receiptBarcodeImage', 'receiptTemplate'] } }
        });
        
        const storeName = settings.find(s => s.key === 'storeName')?.value;
        const storeAddress = settings.find(s => s.key === 'storeAddress')?.value;
        const storePhone = settings.find(s => s.key === 'storePhone')?.value;
        const receiptBarcodeEnabled = settings.find(s => s.key === 'receiptBarcodeEnabled')?.value;
        const receiptBarcodeImage = settings.find(s => s.key === 'receiptBarcodeImage')?.value;
        const receiptTemplate = settings.find(s => s.key === 'receiptTemplate')?.value;

        if (!payload.store) payload.store = {};
        // تعديل: استخدام البيانات من قاعدة البيانات فقط إذا لم تكن موجودة في البايلود
        // هذا يسمح للواجهة بإرسال الاسم المزخرف (رمضان) دون أن يتم استبداله
        if (!payload.store.name && storeName) payload.store.name = storeName;
        if (!payload.store.address && storeAddress) payload.store.address = storeAddress;
        if (!payload.store.phone && storePhone) payload.store.phone = storePhone;
        payload.receiptBarcodeEnabled = receiptBarcodeEnabled === null || receiptBarcodeEnabled === undefined
          ? payload.receiptBarcodeEnabled
          : receiptBarcodeEnabled !== 'false';
        if (receiptBarcodeImage) payload.qrImage = receiptBarcodeImage;
        if (!payload.receiptTemplate && receiptTemplate) payload.receiptTemplate = receiptTemplate;
    } catch (e) {
      console.error("Error fetching store settings for receipt:", e);
    }

    // إعداد الشعار (صورة الدجاجة)
    let logoHtml = '';
    try {
      const logoPath = path.join(__dirname, 'icons', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const bitmap = fs.readFileSync(logoPath);
        logoHtml = `<div class="logo-container"><img src="data:image/png;base64,${bitmap.toString('base64')}" style="width: 80px; height: auto;" alt="Logo" /></div>`;
      }
    } catch (e) { console.error("Error loading logo:", e); }

    // --- إضافة كود الباركود (QR) ---
    let qrHtml = '';
    const shouldShowReceiptBarcode = payload.receiptBarcodeEnabled !== false;
    const receiptBarcodeImage = payload.qrImage || 'qr.png';
    payload.qrImage = receiptBarcodeImage;
    if (shouldShowReceiptBarcode && receiptBarcodeImage) {
      try {
        const candidates = [
          path.join(__dirname, 'icons', payload.qrImage), // المسار الذي حددته (electron/icons/qr.png)
          path.join(__dirname, '..', 'public', receiptBarcodeImage),
          path.join(__dirname, '..', receiptBarcodeImage),
          path.join(process.resourcesPath, 'public', receiptBarcodeImage),
          path.join(process.resourcesPath, receiptBarcodeImage),
          path.join(app.getPath('userData'), receiptBarcodeImage)
        ];
        const qrPath = candidates.find(p => fs.existsSync(p));
        if (qrPath) {
          const bitmap = fs.readFileSync(qrPath);
          qrHtml = `<div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px;">
                      <div style="font-size: 10px; font-weight: bold; line-height: 1.2;">تابعونا على الفيسبوك<br>لمعرفة اخر عروضنا</div>
                      <img src="data:image/png;base64,${bitmap.toString('base64')}" style="width: 60px; height: auto;" alt="QR Code" />
                    </div>`;
        }
      } catch (e) { console.error("Error loading QR image:", e); }
    }
    // -----------------------------

    // دالة مساعدة لتحويل الأرقام (تم تعطيل التحويل للعربية)
    const toArabic = (num) => {
      if (num === undefined || num === null) return '';
      return String(num);
    };
    
    const formatMoney = (amount) => {
       const val = Number(amount).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2});
       return toArabic(val);
    };

    let html = '';

    // Check if this is an inventory report or a standard receipt
    if (payload.type === 'inventory') {
      const title = payload.title || 'تقرير جرد';
      const items = payload.items || [];
      const totalStock = payload.totalStock || 0;
      const totalValue = payload.totalValue || 0;
      const date = new Date().toLocaleDateString('en-US');
      const time = new Date().toLocaleTimeString('en-US');

      html = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', 'Tahoma', sans-serif; margin: 0; padding: 0; width: 100%; background-color: #fff; direction: rtl; color: #000; font-size: 12px; font-weight: 600; }
            .content {
              width: 100%;
              max-width: 100%;
              margin: 0;
              padding: 2px;
            }

            .header { text-align: center; margin-bottom: 10px; border: 2px solid #000; padding: 8px; border-radius: 8px; background-color: #f9f9f9; }
            .title { font-size: 16px; font-weight: bold; margin-bottom: 5px; color: #000; }
            .meta { font-size: 12px; font-weight: bold; color: #000; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9px; }
            th, td { border: 1px solid #000; padding: 6px 2px; text-align: center; }
            th { background-color: #eee; font-weight: bold; }
            td.name { text-align: center; width: 45%; font-weight: bold; }
            .totals-box { margin-top: 15px; border: 1px solid #000; padding: 8px; border-radius: 4px; background-color: #fdfdfd; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px; }
            .row.final { font-weight: bold; font-size: 12px; border-top: 1px dashed #ccc; padding-top: 4px; margin-top: 4px; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; font-weight: bold; color: #000; border-top: 1px dotted #000; padding-top: 8px; }
            .@page {
                size: 80mm auto;  margin: 0; } 
            </style>
        </head>
        <body>
          <div class="content">
          <div class="header">
            <div class="title">${title}</div>
            <div class="meta">${date} | ${time}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>المادة</th>
                <th>العدد</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td class="name">${item.name}</td>
                  <td>${toArabic(item.stock)}</td>
                  <td>${formatMoney(item.price)}</td>
                  <td>${formatMoney(Number(item.stock) * Number(item.price))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totals-box">
            <div class="row"><span>عدد الأصناف:</span><span>${toArabic(items.length)}</span></div>
            <div class="row"><span>إجمالي العدد:</span><span>${toArabic(totalStock)}</span></div>
            <div class="row final"><span>إجمالي القيمة:</span><span>${formatMoney(totalValue)} د.ع</span></div>
          </div>
          <div class="footer">
            نظام المبيعات - تقرير الجرد
          </div>
          </div>
        </body>
        </html>
      `;
    } else if (payload.type === 'payment') {
      // --- تصميم سند القبض الجديد ---
      const title = payload.title || 'سند قبض';
      const invoice = payload.invoice || {};
      const payment = payload.payment || {};
      const storeRaw = payload.store || {};
      const store = {
        name: storeRaw.name || 'هذا السند يعد بمثابة إيصال رسمي',
        address: storeRaw.address || '',
        phone: storeRaw.phone || ''
      };
      
      html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', 'Tahoma', sans-serif; margin: 0; padding: 0; width: 100%; background-color: #fff; direction: rtl; color: #000; font-size: 12px; }
          .content { width: 100%; padding: 5px; }
          .header { text-align: center; margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
          .store-name { font-size: 18px; font-weight: bold; }
          .doc-title { font-size: 16px; font-weight: bold; margin-top: 5px; border: 2px solid #000; display: inline-block; padding: 5px 20px; border-radius: 5px; }
          
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px; font-size: 11px; }
          .info-row { display: flex; justify-content: space-between; }
          .label { font-weight: bold; }
          
          .amount-box { border: 2px solid #000; padding: 10px; margin: 10px 0; text-align: center; border-radius: 8px; background-color: #f9f9f9; }
          .amount-label { font-size: 12px; font-weight: bold; margin-bottom: 5px; }
          .amount-value { font-size: 24px; font-weight: 900; }
          
          .balance-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .balance-table td, .balance-table th { border: 1px solid #000; padding: 8px; text-align: center; }
          .balance-table th { background-color: #eee; }
          
          .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px dotted #000; padding-top: 5px; }
          @page { size: 80mm auto; margin: 0; }
        </style>
      </head>
      <body>
        <div class="content">
          <div class="header">
            <div class="store-name">${store.name}</div>
            <div>${store.phone}</div>
            <div class="doc-title">${title}</div>
          </div>
          
          <div class="info-grid">
            <div class="info-row"><span class="label">رقم السند:</span> <span>${invoice.number}</span></div>
            <div class="info-row"><span class="label">التاريخ:</span> <span>${invoice.date}</span></div>
            <div class="info-row"><span class="label">الوقت:</span> <span>${invoice.time}</span></div>
            <div class="info-row"><span class="label">الكاشير:</span> <span>${invoice.cashier}</span></div>
          </div>
          
          <div style="margin: 10px 0; font-size: 14px;">
            <span class="label">استلمنا من السيد/ة:</span> <span style="font-weight:bold">${invoice.client}</span>
          </div>

          <div class="amount-box">
            <div class="amount-label">مبلغ الدفعة</div>
            <div class="amount-value">${formatMoney(payment.amount)} <span style="font-size:12px">د.ع</span></div>
          </div>

          <table class="balance-table">
            <thead>
              <tr>
                <th>الحساب السابق</th>
                <th>الدفعة الحالية</th>
                <th>الحساب المتبقي</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${formatMoney(payment.before)}</td>
                <td style="font-weight:bold">${formatMoney(payment.amount)}</td>
                <td style="font-weight:bold">${formatMoney(payment.after)}</td>
              </tr>
            </tbody>
          </table>
          
          ${payment.note ? `<div style="margin-top:10px; font-size:11px;"><strong>ملاحظات:</strong> ${payment.note}</div>` : ''}

          <div class="footer">
            ${payload.footer || 'شكراً لتعاملكم معنا'}
          </div>
        </div>
      </body>
      </html>
      `;
    } else {
      // Standard Receipt Logic
      if (payload.invoice) console.log('Invoice Keys:', Object.keys(payload.invoice));
      
      // Robust data extraction to handle both flat and nested structures
      const storeRaw = payload.store || {};
      const store = { 
        name: storeRaw.name || payload.storeName || 'المتجر', 
        address: storeRaw.address || payload.storeAddress || '', 
        phone: storeRaw.phone || payload.storePhone || '' 
      };

      const invoiceRaw = payload.invoice || {};
      const invoice = {
        number: toArabic(invoiceRaw.number || payload.invoiceNumber || payload.number || ''),
        date: toArabic(invoiceRaw.date || payload.date || ''),
        time: toArabic(invoiceRaw.time || payload.time || ''),
        cashier: invoiceRaw.cashier || payload.cashier || payload.cashierName || 'غير معروف',
        client: invoiceRaw.client || payload.client || '',
        subtotal: invoiceRaw.subtotal ?? payload.subtotal ?? 0,
        total: invoiceRaw.total ?? payload.total ?? 0,
        discount: invoiceRaw.discount ?? payload.discount ?? 0
      };

      const receiptTemplate = ['classic', 'compact', 'boxed'].includes(payload.receiptTemplate)
        ? payload.receiptTemplate
        : 'classic';
      const isCompactReceipt = receiptTemplate === 'compact';
      const isBoxedReceipt = receiptTemplate === 'boxed';
      const receiptBodyFontSize = isCompactReceipt ? '10px' : '12px';
      const receiptTableFontSize = isCompactReceipt ? '9px' : '11px';
      const receiptHeaderCss = isCompactReceipt
        ? 'text-align:center; margin-bottom:6px; border-bottom:1px solid #000; padding-bottom:4px;'
        : isBoxedReceipt
          ? 'text-align:center; margin-bottom:10px; border:2px solid #000; padding:8px;'
          : 'text-align:center; margin-bottom:10px; border:2px solid #000; padding:5px; border-radius:5px;';
      const receiptMetaCss = isCompactReceipt
        ? 'border-top:1px solid #000; border-bottom:1px solid #000; padding:4px 0; margin-bottom:6px; width:100%;'
        : isBoxedReceipt
          ? 'border:2px solid #000; padding:6px; margin-bottom:8px; width:100%;'
          : 'border:2px solid #000; padding:5px; margin-bottom:10px; border-radius:4px; width:100%;';
      const receiptTotalsCss = isCompactReceipt
        ? 'margin-top:5px; border-top:2px solid #000; padding-top:5px;'
        : isBoxedReceipt
          ? 'margin-top:6px; border:2px solid #000; padding:8px;'
          : 'margin-top:5px; border:2px solid #000; padding:5px; border-radius:5px;';
      const receiptTableBorderCss = isCompactReceipt ? 'border-bottom:1px solid #000;' : 'border:1px solid #000;';

      // Try to find items in payload.invoice.items or payload.items
      let items = [];
      if (Array.isArray(invoiceRaw.items) && invoiceRaw.items.length > 0) {
        items = invoiceRaw.items;
      } else if (Array.isArray(payload.items) && payload.items.length > 0) {
        items = payload.items;
      } else if (Array.isArray(invoiceRaw.items)) {
        items = invoiceRaw.items;
      } else if (Array.isArray(payload.items)) {
        items = payload.items;
      }
      
      console.log('Printing Receipt. Items count:', items.length);
      if (items.length > 0) console.log('First item sample:', JSON.stringify(items[0]));

      html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';">
        <style>
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', 'Tahoma', sans-serif; margin: 0; padding: 0; width: 100%; background-color: #fff; direction: rtl; color: #000; font-size: ${receiptBodyFontSize}; font-weight: 600; }
          .content {
              width: 100%;
              max-width: 100%;
              margin: 0;
              padding: 2px;
            }

          
          .header { ${receiptHeaderCss} }
          .logo-container { margin-bottom: 8px; display: flex; justify-content: center; }
          .store-name { font-size: ${isCompactReceipt ? '15px' : '18px'}; font-weight: 900; margin-bottom: ${isCompactReceipt ? '2px' : '4px'}; letter-spacing: -0.5px; }
          .company-name { font-size: ${isCompactReceipt ? '11px' : '14px'}; font-weight: 900; color: #000; margin-bottom: ${isCompactReceipt ? '2px' : '4px'}; }
          .phone-number { font-size: ${isCompactReceipt ? '11px' : '14px'}; font-weight: bold; margin-top: ${isCompactReceipt ? '2px' : '4px'}; font-family: monospace; }
          
          /* Info Box */
          .meta-box { ${receiptMetaCss} }
          .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          
          /* Table */
          table { width: 100%; border-collapse: collapse; margin-bottom: ${isCompactReceipt ? '6px' : '10px'}; font-size: ${receiptTableFontSize}; }
          th, td { ${receiptTableBorderCss} padding: ${isCompactReceipt ? '2px' : '4px'}; text-align: center; }
          th { background-color: #f2f2f2; font-weight: bold; }
          td.item-name { text-align: center; font-weight: bold; }
          
          .totals { ${receiptTotalsCss} }
          .row { display: flex; justify-content: space-between; margin-bottom: ${isCompactReceipt ? '2px' : '3px'}; font-size: ${isCompactReceipt ? '9px' : '10px'}; }
          .bold { font-weight: bold; }
          .final-total { font-size: ${isCompactReceipt ? '12px' : '14px'}; font-weight: bold; border-top: 2px solid #000; padding-top: 5px; margin-top: 5px; }
          .footer { text-align: center; margin-top: 15px; font-size: 9px; border-top: 1px dotted #000; padding-top: 10px; }
          @media print {
            @page {
                size: 80mm auto;  margin: 0; } 
            body { margin: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="content">
        <div class="header">
          <div class="store-name">${store.name}</div>
          <div class="company-name">${store.address}</div>
          <div class="phone-number">${store.phone}</div>
        </div>
        <div class="meta-box">
          <div class="meta-row"><span>رقم الفاتورة:</span> <span style="font-weight:bold;">INV-${invoice.number}</span></div>
          <div class="meta-row"><span>التاريخ:</span> <span style="font-weight:bold;">${invoice.date}</span></div>
          <div class="meta-row"><span>الوقت:</span> <span style="font-weight:bold;">${invoice.time || ''}</span></div>
          <div class="meta-row"><span>الكاشير:</span> <span>${invoice.cashier || 'غير معروف'}</span></div>
          ${invoice.client ? `<div class="meta-row"><span>العميل:</span> <span style="font-weight:bold;">${invoice.client}</span></div>` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 40%">الصنف</th>
              <th style="width: 15%">الكمية</th>
              <th style="width: 20%">السعر</th>
              <th style="width: 25%">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${items.length > 0 ? items.map(item => {
              const name = item.name || (item.product ? item.product.name : '') || 'صنف غير معروف';
              const qty = Number(item.qty || item.quantity || 0);
              const price = Number(item.price || 0);
              const total = Number(item.total || (qty * price) || 0);
              return `
              <tr>
                <td class="item-name">${name}</td>
                <td>${toArabic(qty)}</td>
                <td>${formatMoney(price)}</td>
                <td>${formatMoney(total)}</td>
              </tr>
            `;}).join('') : '<tr><td colspan="4" style="text-align:center; padding: 10px;">لا توجد أصناف</td></tr>'}
          </tbody>
        </table>
        <div class="totals">
          <div class="row"><span>المجموع الفرعي:</span><span>${formatMoney(invoice.subtotal)}</span></div>
          ${invoice.discount ? `<div class="row"><span>الخصم:</span><span>${formatMoney(invoice.discount)}</span></div>` : ''}
          <div class="row final-total"><span>الإجمالي:</span><span>${formatMoney(invoice.total)}</span></div>
          ${invoice.received !== undefined ? `<div class="row"><span>الواصل:</span><span>${formatMoney(invoice.received)}</span></div>` : ''}
          ${invoice.remaining !== undefined ? `<div class="row"><span>الباقي:</span><span>${formatMoney(invoice.remaining)}</span></div>` : ''}
        </div>
        <div class="footer">
          <div style="margin-bottom: 5px; font-size: 8px;">منتجات الريان لا تُبدّل ولا تُسترجع</div>
          ${payload.footer ? payload.footer.replace(/\n/g, '<br/>') : 'شكراً لزيارتكم'}
        </div>
        ${qrHtml}
        </div>
      </body>
      </html>
    `;
    }

    // FIX: Use a temporary file to load the HTML. Data URLs have size limits in Electron/Chromium.
    const tempPath = path.join(app.getPath('temp'), `receipt_${Date.now()}.html`);
    fs.writeFileSync(tempPath, html, 'utf8');
    await printWindow.loadFile(tempPath);

    if (isMock) {
      const mockPath = path.join(app.getPath('desktop'), 'receipt-mock.html');
      fs.writeFileSync(mockPath, html);
      // Don't close the window, just leave it for next time
      return { ok: true, message: `تم حفظ الفاتورة التجريبية في: ${mockPath}` };
    }

    // Wait for a moment to ensure rendering is complete before printing
    await new Promise(resolve => setTimeout(resolve, 10)); // تقليل وقت الانتظار

    // Find Printer
    let printerName = cachedPrinterName;

    if (!printerName) {
      const printers = await printWindow.webContents.getPrintersAsync();
      console.log("Available printers:", printers.map(p => `${p.name} (Default: ${p.isDefault})`));

      // 1. Try to use the System Default Printer first (if it's not a virtual one)
      let printer = printers.find(p => p.isDefault && !/AnyDesk|OneNote|PDF|XPS|Fax|Microsoft/i.test(p.name));
      
      // 2. If default is not suitable, search for a thermal printer by name
      if (!printer) {
        const candidates = printers.filter(p => !/AnyDesk|OneNote|PDF|XPS|Fax|Microsoft/i.test(p.name));
        printer = candidates.find(p => /POS|80C|XP|Receipt|Epson|Star|Rongta|Thermal/i.test(p.name)) || candidates[0];
      }

      // 3. Last resort: just take the first one
      if (!printer) printer = printers[0];
      
      if (printer) {
        printerName = printer.name;
        cachedPrinterName = printer.name;
      }
    }

    if (!printerName) {
      console.error("No suitable printer found.");
      return { ok: false, message: "لم يتم العثور على طابعة." };
    }

    console.log(`Printing HTML receipt to: ${printerName}`);

    // Print
    await new Promise((resolve, reject) => {
      let isDone = false;
      // إضافة مهلة زمنية (Timeout) لتجنب تعليق التطبيق إذا لم تستجب الطابعة
      const timeoutTimer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          // تدمير النافذة لإعادة تعيين حالة الطباعة في المرة القادمة
          if (printWindow) {
            try { printWindow.destroy(); } catch(e) {}
            printWindow = null;
            cachedPrinterName = null;
          }
          reject(new Error("Print operation timed out (10s)"));
        }
      }, 10000);

      printWindow.webContents.print({
        silent: true,
        deviceName: printerName,
        printBackground: true,
        margins: { marginType: 'none' },
        scaleFactor: 100,
        pageSize: {
          width: 70000,   // 80mm بوحدة microns
          height: 297000  // طول غير محدود تقريباً
        }
      }, (success, errorType) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timeoutTimer);
        console.log('Print command result:', success, errorType);
        // تنظيف الملف المؤقت بعد إرسال أمر الطباعة (اختياري، لكن جيد للنظافة)
        try { fs.unlinkSync(tempPath); } catch(e) {} 
        
        if (!success) {
          cachedPrinterName = null; // إعادة تعيين الكاش في حال الفشل
          reject(new Error(errorType || 'فشلت عملية الطباعة'));
        }
        else resolve();
      });
    });

    return { ok: true, message: "تم إظهار مربع حوار الطباعة." };
    
  } catch (error) {
    console.error("HTML Printing failed:", error);
    return { ok: false, message: error.message || "حدث خطأ غير معروف أثناء الطباعة." };
  }
});
