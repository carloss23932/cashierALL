const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { fork } = require("child_process");
const { scrypt, randomBytes } = require("crypto");
const { promisify } = require("util");
const iconv = require("iconv-lite");

// تعطيل الكاش الخاص بـ GPU لتجنب أخطاء بدء التشغيل الشائعة
app.commandLine.appendSwitch('disable-gpu-cache');
app.disableHardwareAcceleration();

// Consider the app packaged status as well — packaged builds should not try to load the Vite dev server.
const isDev = (process.env.NODE_ENV !== "production") && !app.isPackaged;

// Ensure DATABASE_URL is set correctly for both dev and prod
const dbPath = isDev
  ? path.join(__dirname, "..", "prisma", "dev.db")
  : path.join(app.getPath("userData"), "dev.db");

process.env.DATABASE_URL = `file:${dbPath}`;

// Keep a reference to the server process
// let serverProcess; // Unused: Express server is disabled

const scryptAsync = promisify(scrypt);

let prismaInstance = null;
let prismaInitPromise = null;
let activeUserId = null;
let mainWindow = null;

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
  lastError: null,
  lastSuccessAt: null,
  queuePath: null,
  intervalId: null,
  commandIntervalId: null,
  appliedCommandsPath: null,
  appliedCommands: []
};

const MAX_SYNC_QUEUE = 5000;
const SALE_DEBT_PREFIX = '\u0641\u0627\u062a\u0648\u0631\u0629 \u0645\u0628\u064a\u0639\u0627\u062a #';


function safeJsonParse(raw, fallback) {
  try { return JSON.parse(raw); } catch (e) { return fallback; }
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
      await prisma.$transaction([
        returnIds.length ? prisma.returnItem.deleteMany({ where: { returnId: { in: returnIds } } }) : prisma.returnItem.deleteMany({ where: { id: -1 } }),
        returnIds.length ? prisma.return.deleteMany({ where: { id: { in: returnIds } } }) : prisma.return.deleteMany({ where: { id: -1 } }),
        prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } }),
        prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
      ]);
    }

    // Archive purchase invoices (JSON file)
    const logDir = app.getPath('userData');
    const purchasePath = path.join(logDir, 'purchase-invoices.json');
    if (fs.existsSync(purchasePath)) {
      const raw = fs.readFileSync(purchasePath, 'utf8');
      const invoices = safeJsonParse(raw, []);
      if (Array.isArray(invoices) && invoices.length) {
        const archived = [];
        const kept = [];
        for (const inv of invoices) {
          const dt = parseArchiveDate(inv?.date || inv?.createdAt);
          if (dt && dt < cutoff) archived.push(inv);
          else kept.push(inv);
        }

        if (archived.length) {
          const archiveDir = ensureArchiveDir();
          const dates = archived.map(inv => {
            const dt = parseArchiveDate(inv?.date || inv?.createdAt);
            return dt ? dateKey(dt) : null;
          }).filter(Boolean).sort();
          const range = { from: dates[0] || 'unknown', to: dates[dates.length - 1] || 'unknown' };
          const payload = {
            type: 'purchase-invoices',
            generatedAt: new Date().toISOString(),
            retentionDays,
            range,
            summaryByDate: summarizePurchasesByDate(archived),
            invoices: archived
          };
          const fileName = `purchase-archive-${range.from}-${range.to}-${Date.now()}.json`;
          fs.writeFileSync(path.join(archiveDir, fileName), JSON.stringify(payload, null, 2), 'utf8');
          fs.writeFileSync(purchasePath, JSON.stringify(kept, null, 2), 'utf8');
        }
      }
    }

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

  syncState.isFlushing = true;
  const batch = syncState.queue.slice(0, 200);
  const payload = { events: batch };
  try {
    const res = await fetch(`${syncState.serverUrl.replace(/\/$/, '')}/api/sync/events`, {
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
      throw new Error(`Sync failed: ${res.status} ${text}`);
    }
    syncState.queue = syncState.queue.slice(batch.length);
    syncState.lastError = null;
    syncState.lastSuccessAt = new Date().toISOString();
    saveSyncQueue();
  } catch (e) {
    syncState.lastError = String(e.message || e);
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

  // Purchase invoices & supplier payments are stored in JSON files
  try {
    const logDir = app.getPath('userData');
    const purchasePath = path.join(logDir, 'purchase-invoices.json');
    if (fs.existsSync(purchasePath)) {
      const purchases = JSON.parse(fs.readFileSync(purchasePath, 'utf8'));
      if (Array.isArray(purchases)) {
        purchases.forEach(inv => {
          events.push({ type: 'purchase.invoice.create', ts, payload: inv });
        });
      }
    }
    const supplierPath = path.join(logDir, 'supplier-payments.json');
    if (fs.existsSync(supplierPath)) {
      const payments = JSON.parse(fs.readFileSync(supplierPath, 'utf8'));
      if (Array.isArray(payments)) {
        payments.forEach(pay => {
          events.push({ type: 'supplier.payment.add', ts, payload: pay });
        });
      }
    }
  } catch (e) {
    console.error('Failed to read purchase/supplier logs for full sync:', e);
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
      const offer = offers[String(item.productId)];
      if (offer && offer.isOffer && offer.offerUnderlyingProductId && offer.offerUnderlyingProductQuantity > 0) {
        await tx.product.update({
          where: { id: Number(offer.offerUnderlyingProductId) },
          data: { stock: { increment: Number(offer.offerUnderlyingProductQuantity) * Number(item.quantity) } }
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } }
        });
      }
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

      const offer = offers[String(item.productId)];
      if (offer && offer.isOffer && offer.offerUnderlyingProductId && offer.offerUnderlyingProductQuantity > 0) {
        await tx.product.update({
          where: { id: Number(offer.offerUnderlyingProductId) },
          data: { stock: { decrement: Number(offer.offerUnderlyingProductQuantity) * qty } }
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: qty } }
        });
      }
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

async function updatePurchaseInvoiceWithData(data) {
  const prisma = await getPrisma();
  const logDir = app.getPath('userData');
  const jsonPath = path.join(logDir, 'purchase-invoices.json');
  let history = [];
  if (fs.existsSync(jsonPath)) {
    history = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }

  const targetId = data.id;
  const targetNum = Number(targetId);
  const index = history.findIndex(r => {
    if (r.id === targetId) return true;
    const rNum = Number(r.id);
    if (!Number.isNaN(rNum) && !Number.isNaN(targetNum)) return rNum === targetNum;
    return String(r.id) === String(targetId);
  });
  if (index === -1) return { ok: false, error: "الفاتورة غير موجودة" };

  const oldItems = history[index].items || [];
  let updatedRecord = null;

  const result = await prisma.$transaction(async (tx) => {
    for (const item of oldItems) {
      if (!item.productId) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: Number(item.quantity) } }
      }).catch(() => {});
    }

    for (const item of data.items) {
      if (!item.productId) continue;
      const updateData = { stock: { increment: Number(item.quantity) } };
      if (item.cost) updateData.boxPurchasePrice = Number(item.cost);
      await tx.product.update({
        where: { id: item.productId },
        data: updateData
      });
    }

    history[index] = { ...history[index], ...data, itemsCount: data.items.length, items: data.items };
    updatedRecord = history[index];
    fs.writeFileSync(jsonPath, JSON.stringify(history, null, 2), 'utf8');
    return { ok: true };
  });

  return { result, updatedRecord };
}

async function applyPurchaseInvoiceUpdate(payload) {
  const data = { ...payload };
  if (!data.id) {
    const localId = normalizeLocalId(payload.localId ?? payload.invoiceId);
    if (localId) data.id = localId;
  }
  if (data.id !== undefined && data.id !== null && data.id !== '') {
    const idNum = Number(data.id);
    if (!Number.isNaN(idNum)) data.id = idNum;
  }
  if (!Array.isArray(data.items)) data.items = [];
  const { result, updatedRecord } = await updatePurchaseInvoiceWithData(data);
  if (result?.ok && updatedRecord) {
    enqueueSyncEvent('purchase.invoice.update', updatedRecord);
    void syncProductsByIds(data.items.map(item => item.productId));
  }
  return result;
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
  const logDir = app.getPath('userData');
  const jsonPath = path.join(logDir, 'supplier-payments.json');
  let payments = [];
  if (fs.existsSync(jsonPath)) {
    try { payments = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
  }
  const newPayment = {
    id: payload.id || Date.now(),
    ...payload,
    amount: Number(payload.amount),
    timestamp: payload.timestamp || new Date().toISOString()
  };
  payments.unshift(newPayment);
  fs.writeFileSync(jsonPath, JSON.stringify(payments, null, 2), 'utf8');
  enqueueSyncEvent('supplier.payment.add', newPayment);
  return { ok: true };
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
    case 'debt.payment.upsert':
      return applyDebtPaymentUpsert(payload);
    case 'debt.markPaid':
      return applyDebtMarkPaid(payload);
    case 'sale.update':
      return applySaleUpdate(payload);
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
  if (!syncState.enabled) return;
  if (!syncState.serverUrl || !syncState.storeId || !syncState.storeSecret) return;
  try {
    const res = await fetch(`${syncState.serverUrl.replace(/\/$/, '')}/api/sync/commands?limit=50`, {
      headers: {
        'Content-Type': 'application/json',
        'x-store-id': syncState.storeId,
        'x-store-secret': syncState.storeSecret
      }
    });
    if (!res.ok) return;
    const data = await res.json();
    const commands = Array.isArray(data?.commands) ? data.commands : [];
    if (!commands.length) return;

    const results = [];
    for (const cmd of commands) {
      const commandId = cmd.commandId;
      if (hasAppliedCommand(commandId)) continue;
      try {
        await applyRemoteCommand(cmd);
        rememberAppliedCommand(commandId);
        results.push({ commandId, status: 'applied' });
      } catch (e) {
        results.push({ commandId, status: 'failed', error: String(e?.message || e) });
      }
    }

    if (results.length) {
      await fetch(`${syncState.serverUrl.replace(/\/$/, '')}/api/sync/commands/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': syncState.storeId,
          'x-store-secret': syncState.storeSecret
        },
        body: JSON.stringify({ results })
      });
    }
  } catch (e) {
    // ignore transient errors
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
async function getPrisma() {
  if (prismaInstance) return prismaInstance;
  if (!prismaInitPromise) {
    prismaInitPromise = (async () => {
      const { PrismaClient } = await import('@prisma/client');
      const client = new PrismaClient({
        datasources: {
          db: {
            url: `file:${dbPath}`,
          },
        },
      });
      try {
        await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        await client.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
        await client.$queryRawUnsafe('PRAGMA busy_timeout = 15000;');
      } catch (e) {
        console.error('Failed to set SQLite pragmas:', e);
      }
      prismaInstance = client;
      return client;
    })();
  }
  return prismaInitPromise;
}

function isSqliteBusy(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('sqlite_busy') || msg.includes('database is locked');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createWindow() {
  // محاولة جلب اسم المركز من قاعدة البيانات لتعيينه كعنوان للنافذة
  let appTitle = "مركز الجمجمة";
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
    icon: path.join(__dirname, "icons", "chicken.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
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
  const backupsDir = path.resolve(__dirname, '..', 'backups');
  console.log(`Backups directory: ${backupsDir}`);

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
    await fixDebtReasonEncoding();
  } catch (e) {
    console.error('Failed to run debt reason fix:', e);
  }

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
      if (!fs.existsSync(dbPath)) {
        // محاولة العثور على قاعدة البيانات المجهزة (التي تم إنشاؤها بواسطة prebuild)
        const bundledDbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
        const resourcesDbPath = path.join(process.resourcesPath, 'prisma', 'dev.db');

        if (fs.existsSync(bundledDbPath)) {
          console.log(`Initializing DB: Copying from bundled path ${bundledDbPath}`);
          fs.copyFileSync(bundledDbPath, dbPath);
        } else if (fs.existsSync(resourcesDbPath)) {
          console.log(`Initializing DB: Copying from resources path ${resourcesDbPath}`);
          fs.copyFileSync(resourcesDbPath, dbPath);
        } else {
          console.warn("Warning: Bundled database not found. App will start with empty DB (tables might be missing).");
        }
      }
    } catch (err) {
      console.error("Error initializing database:", err);
    }
  }
  // ---------------------------------------------------

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
  createWindow();

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
  const prisma = await getPrisma();
  try {
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
      offerUnderlyingProductQuantity: offers[String(p.id)]?.offerUnderlyingProductQuantity || null
    }));
});

ipcMain.handle('upsert-product', async (event, product) => {
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
      // --- تسجيل التعديلات اليدوية للمخزون (Tracking) ---
      try {
        const oldProduct = await prisma.product.findUnique({ where: { id: product.id } });
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
        offers[String(updated.id)] = {
          isOffer: true,
          offerUnderlyingProductId: product.offerUnderlyingProductId ? Number(product.offerUnderlyingProductId) : null,
          offerUnderlyingProductQuantity: product.offerUnderlyingProductQuantity ? Number(product.offerUnderlyingProductQuantity) : null
        };
      } else {
        if (offers[String(updated.id)]) delete offers[String(updated.id)];
      }
      fs.writeFileSync(offersPath, JSON.stringify(offers, null, 2));
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
        
        offers[String(created.id)] = {
          isOffer: true,
          offerUnderlyingProductId: product.offerUnderlyingProductId ? Number(product.offerUnderlyingProductId) : null,
          offerUnderlyingProductQuantity: product.offerUnderlyingProductQuantity ? Number(product.offerUnderlyingProductQuantity) : null
        };
        fs.writeFileSync(offersPath, JSON.stringify(offers, null, 2));
      }
      return created;
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

  // حذف الروابط القديمة للمنتج الحالي
  const oldAlt = alternatives[pId];
  if (oldAlt) {
    delete alternatives[oldAlt]; // حذف الرابط العكسي
  }
  
  if (aId) {
    // حذف الروابط القديمة للمنتج البديل (إذا كان مرتبطاً بمنتج آخر)
    const oldAltForNew = alternatives[aId];
    if (oldAltForNew) delete alternatives[oldAltForNew];

    alternatives[pId] = aId;
    alternatives[aId] = pId; // ربط ثنائي الاتجاه (طازج <-> مجمد)
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

    // 3. المشتريات (من ملف JSON)
    const purchasePath = path.join(logDir, 'purchase-invoices.json');
    if (fs.existsSync(purchasePath)) {
      try {
        const purchases = JSON.parse(fs.readFileSync(purchasePath, 'utf8'));
        purchases.forEach(inv => {
          const item = inv.items.find(i => Number(i.productId) === pId);
          if (item) {
            history.push({ type: 'purchase', date: new Date(inv.date || inv.timestamp), quantity: Number(item.quantity), price: Number(item.cost || 0), ref: inv.invoiceNumber, note: `فاتورة شراء #${inv.invoiceNumber}` });
          }
        });
      } catch (e) {}
    }

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
  const prisma = await getPrisma();
  const updated = await prisma.client.update({
    where: { id: data.id },
    data: {
      name: data.clientName,
      phone: data.phone
    }
  });
  enqueueSyncEvent('client.upsert', updated);
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
        const total = subTotal - (data.discount || 0);
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
          const offer = offers[String(item.productId)];
          if (offer && offer.isOffer && offer.offerUnderlyingProductId && offer.offerUnderlyingProductQuantity > 0) {
            await tx.product.update({
              where: { id: Number(offer.offerUnderlyingProductId) },
              data: { stock: { decrement: Number(offer.offerUnderlyingProductQuantity) * Number(item.quantity) } }
            });
          } else {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } }
            });
          }
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
      console.error('create-sale failed:', err);
      throw err;
    }
  }
  if (Date.now() - startTime > 3000) {
    console.warn(`create-sale slow: ${Date.now() - startTime}ms`);
  }
  if (!sale) throw new Error('Sale creation failed');
  if (createdClient) enqueueSyncEvent('client.upsert', createdClient);
  if (createdDebt) enqueueSyncEvent('debt.upsert', createdDebt);
  enqueueSyncEvent('sale.create', sale);
  if (sale?.items?.length) {
    void syncProductsByIds(sale.items.map(item => item.productId));
  }
  return sale;
});

ipcMain.handle('list-sales', async (event, options = {}) => {
  const prisma = await getPrisma();
    const queryOptions = {
      include: {
        items: { include: { product: true } },
        cashier: true,
        returns: { include: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    };

    // إذا تم تمرير limit، استخدمه. وإلا استخدم 500 كقيمة افتراضية (للحفاظ على أداء القوائم العادية)
    // إذا تم تمرير limit بقيمة كبيرة (مثل 0 أو -1 أو رقم كبير) سيتم جلب الكل أو العدد المحدد
    if (options.limit !== undefined && options.limit !== null) {
       if (options.limit > 0) queryOptions.take = options.limit;
    } else {
       queryOptions.take = 500;
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
        debtRemaining,
        amountReceived
      };
    });
});

ipcMain.handle('update-sale', async (event, data) => {
  const prisma = await getPrisma();
    // تحميل بيانات العروض من الملف
    const logDir = app.getPath('userData');
    const offersPath = path.join(logDir, 'product-offers.json');
    let offers = {};
    if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }

    const updatedSale = await prisma.$transaction(async (tx) => {
      const { saleId, items, discount, date, time, paymentMethod, clientId, clientName } = data;

      // 1. جلب الفاتورة الحالية لإعادة المخزون
      const currentSale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: { include: { product: true } } }
      });

      if (!currentSale) throw new Error("Sale not found");

      // 2. إعادة الكميات القديمة للمخزون
      for (const item of currentSale.items) {
        const offer = offers[String(item.productId)];
        if (offer && offer.isOffer && offer.offerUnderlyingProductId && offer.offerUnderlyingProductQuantity > 0) {
          // إذا كان الصنف المباع عرضاً، أعد الكمية للمنتج الأساسي (من الملف)
          await tx.product.update({
            where: { id: Number(offer.offerUnderlyingProductId) },
            data: { stock: { increment: Number(offer.offerUnderlyingProductQuantity) * Number(item.quantity) } }
          });
        } else {
          // منتج عادي، أعد الكمية لنفسه
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
          });
        }
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

        const offer = offers[String(item.productId)];
        if (offer && offer.isOffer && offer.offerUnderlyingProductId && offer.offerUnderlyingProductQuantity > 0) {
          // خصم من المنتج الأساسي للعرض (من الملف)
          await tx.product.update({
            where: { id: Number(offer.offerUnderlyingProductId) },
            data: { stock: { decrement: Number(offer.offerUnderlyingProductQuantity) * qty } }
          });
        } else {
          // خصم من المنتج العادي
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: qty } }
          });
        }
      }

      // 5. تحديث رأس الفاتورة (الإجمالي والخصم)
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

      // معالجة إنشاء الدين إذا تم التحويل إلى آجل
      if (paymentMethod === 'debt' && clientId) {
        // التحقق مما إذا كان هناك دين مسجل لهذه الفاتورة مسبقاً
        const existingDebt = await tx.debt.findFirst({
          where: { reason: `فاتورة مبيعات #${saleId}` }
        });

        if (existingDebt) {
          // تحديث الدين الموجود
          await tx.debt.update({
            where: { id: existingDebt.id },
            data: { amount: updatedSale.total, clientId: Number(clientId) }
          });
        } else {
          // إنشاء دين جديد
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
    if (data.paymentMethod === 'debt' && data.clientId) {
      try {
        const debt = await prisma.debt.findFirst({
          where: { reason: `فاتورة مبيعات #${data.saleId}` }
        });
        if (debt) enqueueSyncEvent('debt.upsert', debt);
      } catch (e) {}
    }
    return updatedSale;
});

ipcMain.handle('create-return', async (event, data) => {
  const prisma = await getPrisma();
    // تحميل بيانات العروض من الملف
    const logDir = app.getPath('userData');
    const offersPath = path.join(logDir, 'product-offers.json');
    let offers = {};
    if (fs.existsSync(offersPath)) { try { offers = JSON.parse(fs.readFileSync(offersPath, 'utf8')); } catch(e) {} }

    // Transaction لإنشاء المرتجع وإعادة الكميات للمخزون
    const ret = await prisma.$transaction(async (tx) => {
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
        const offer = offers[String(item.productId)];
        if (offer && offer.isOffer && offer.offerUnderlyingProductId && offer.offerUnderlyingProductQuantity > 0) {
          // إذا كان الصنف المرتجع عرضاً، أعد الكمية للمنتج الأساسي (من الملف)
          await tx.product.update({
            where: { id: Number(offer.offerUnderlyingProductId) },
            data: { stock: { increment: Number(offer.offerUnderlyingProductQuantity) * Number(item.quantity) } }
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
          });
        }
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
    });
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
  const prisma = await getPrisma();
    if (action === 'logout') {
      activeUserId = null;
    }
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

// --- Factory Reset ---
ipcMain.handle('factory-reset', async () => {
  const prisma = await getPrisma();
  try {
    console.log('Factory reset requested. Clearing data...');

    // استخدام Transaction لضمان حذف البيانات بالترتيب الصحيح (لتجنب أخطاء العلاقات)
    await prisma.$transaction([
      // 1. حذف الجداول الفرعية (التي تعتمد على غيرها)
      prisma.saleItem.deleteMany(),
      prisma.returnItem.deleteMany(),
      prisma.debtPayment.deleteMany(),
      prisma.chickenLegLog.deleteMany(),
      prisma.userActivityLog.deleteMany(),
      
      // 2. حذف الجداول الرئيسية
      prisma.sale.deleteMany(),
      prisma.return.deleteMany(),
      prisma.debt.deleteMany(),
      prisma.dailyNote.deleteMany(),
      prisma.chickenLegDay.deleteMany(),
      prisma.appSetting.deleteMany(), // حذف الإعدادات (اسم المركز، إلخ)
      
      // 3. حذف التعريفات (المنتجات، الأصناف، العملاء)
      prisma.product.deleteMany(),
      prisma.category.deleteMany(),
      prisma.client.deleteMany(),
      
      // 4. حذف المستخدمين مع استثناء المدير "admin"
      prisma.user.deleteMany({
        where: {
          username: { not: 'admin' }
        }
      })
    ]);

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

// --- Backups: simple file-based backups and exports for dev use ---
ipcMain.handle('backup-all', async (event, payload) => {
  try {
    const src = isDev ? path.join(__dirname, '..', 'prisma', 'dev.db') : path.join(app.getPath('userData'), 'dev.db');
    if (!fs.existsSync(src)) return { ok: false, error: 'Source DB not found' };

    // Check database integrity before backup using the singleton
    const prisma = await getPrisma();
    try {
      await prisma.$queryRaw`PRAGMA integrity_check;`;
    } catch (dbError) {
      return { ok: false, error: 'Database is corrupted, cannot create backup' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultName = `backup-${timestamp}.db`;

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'حفظ نسخة احتياطية من قاعدة البيانات',
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      buttonLabel: 'حفظ'
    });
    if (canceled || !filePath) return { ok: false, error: 'User cancelled' };

    fs.copyFileSync(src, filePath);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('backup-products', async (event, payload) => {
  const prisma = await getPrisma();
    const products = await prisma.product.findMany();
    const defaultName = `products-${Date.now()}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'تصدير المنتجات إلى JSON',
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      buttonLabel: 'تصدير'
    });
    if (canceled || !filePath) return { ok: false, error: 'User cancelled' };
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
    return { ok: true, path: filePath };
});

ipcMain.handle('backup-restore', async (event, { filePath }) => {
  try {
    let chosenPath = filePath;
    if (!chosenPath) {
      // Try to open the 'backups' folder by default
      const backupsDir = path.join(__dirname, '..', 'backups');
      const defaultPath = fs.existsSync(backupsDir) ? backupsDir : app.getPath('desktop');

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'اختر ملف النسخة الاحتياطية للاسترجاع',
        defaultPath: defaultPath,
        properties: ['openFile'],
        filters: [
          { name: 'Backup Files', extensions: ['db', 'json'] },
          { name: 'Database', extensions: ['db'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (canceled || !filePaths || filePaths.length === 0) return { ok: false, error: 'User cancelled' };
      chosenPath = filePaths[0];
    }
    if (!fs.existsSync(chosenPath)) return { ok: false, error: 'File not found' };

    // Handle JSON restore (Products)
    if (chosenPath.endsWith('.json')) {
      const content = fs.readFileSync(chosenPath, 'utf8');
      let data;
      try {
        data = JSON.parse(content);
      } catch (e) {
        return { ok: false, error: 'Invalid JSON file' };
      }

      if (Array.isArray(data)) {
        const prisma = await getPrisma();
        try {
          // التحقق من وجود الفئات لتجنب أخطاء الربط
          const existingCategories = await prisma.category.findMany({ select: { id: true } });
          const existingCatIds = new Set(existingCategories.map(c => c.id));

          await prisma.$transaction(async (tx) => {
            for (const p of data) {
              // إذا كان المنتج مرتبطاً بفئة غير موجودة، نلغي الربط
              let catId = p.categoryId;
              if (catId && !existingCatIds.has(catId)) {
                catId = null;
              }

              const productData = {
                name: p.name,
                price: Number(p.price),
                stock: Number(p.stock),
                barcode: p.barcode,
                categoryId: catId,
                unitsPerBox: p.unitsPerBox ? Number(p.unitsPerBox) : 1,
                boxPurchasePrice: p.boxPurchasePrice ? Number(p.boxPurchasePrice) : 0,
                boxSalePrice: p.boxSalePrice ? Number(p.boxSalePrice) : 0,
              };

              if (p.id) {
                const existing = await tx.product.findUnique({ where: { id: p.id } });
                if (existing) {
                  await tx.product.update({ where: { id: p.id }, data: productData });
                } else {
                  await tx.product.create({ data: { ...productData, id: p.id } });
                }
              } else {
                await tx.product.create({ data: productData });
              }
            }
          });

          // تحديث الواجهة
          BrowserWindow.getAllWindows().forEach(w => w.reload());
          return { ok: true, message: `تم استرجاع ${data.length} منتج بنجاح.` };
        } catch (e) {
          console.error("Restore products error:", e);
          return { ok: false, error: "فشل استرجاع المنتجات: " + e.message };
        }
      } else {
        return { ok: false, error: 'ملف JSON لا يحتوي على قائمة منتجات صالحة.' };
      }
    }

    // Check backup file integrity before restore
    const { PrismaClient } = await import('@prisma/client');
    const backupPrisma = new PrismaClient({
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
    fs.copyFileSync(chosenPath, dest);
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: String(e) };
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
  const logDir = app.getPath('userData');
  const jsonPath = path.join(logDir, 'purchase-invoices.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const data = fs.readFileSync(jsonPath, 'utf8');
      const history = JSON.parse(data);
      if (limit) return history.slice(0, limit);
      return history;
    } catch (e) {
      return [];
    }
  }
  return [];
});

ipcMain.handle('process-purchase-invoice', async (event, data) => {
  const prisma = await getPrisma();
    const cashierName = data.cashierName || "??? ?????";
    const newRecord = {
      id: Date.now(),
      invoiceNumber: data.invoiceNumber,
      date: data.date,
      timestamp: new Date().toISOString(),
      supplierName: data.supplierName || "???? ??? ????",
      cashier: cashierName,
      itemsCount: data.items.length,
      totalAmount: Number(data.totalAmount || 0),
      items: data.items
    };

    const result = await prisma.$transaction(async (tx) => {
      if (!data.skipStock) {
        for (const item of data.items) {
          if (!item.productId) continue; // ?????: ???? ??????? ???? ??? ??? ???? ???? (??? ???????? ????????)
          // ????? ??????? ???? ?????? ??? ?? ??????
          const updateData = {
              stock: { increment: Number(item.quantity) }
          };
          if (item.cost !== undefined && item.cost !== null && item.cost !== "") {
              updateData.boxPurchasePrice = Number(item.cost);
          }

          await tx.product.update({
            where: { id: item.productId },
            data: updateData
          });
        }
      }
      
      // ????? ??????? ?? ??? ???????? (JSON)
      try {
        const logDir = app.getPath('userData');
        const jsonPath = path.join(logDir, 'purchase-invoices.json');
        
        let history = [];
        if (fs.existsSync(jsonPath)) {
          try {
            history = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          } catch (e) {}
        }

        // ????? ????? ?????? ?? ???????
        history.unshift(newRecord);
        fs.writeFileSync(jsonPath, JSON.stringify(history, null, 2), 'utf8');
      } catch (e) {
        console.error("Failed to log purchase:", e);
      }

      return { ok: true };
    });

    if (result?.ok) {
      enqueueSyncEvent('purchase.invoice.create', newRecord);
      void syncProductsByIds(data.items.map(item => item.productId));
    }
    return result;
});

ipcMain.handle('update-purchase-invoice', async (event, data) => {
  const prisma = await getPrisma();
    const logDir = app.getPath('userData');
    const jsonPath = path.join(logDir, 'purchase-invoices.json');
    let history = [];
    if (fs.existsSync(jsonPath)) {
      history = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }

    const index = history.findIndex(r => r.id === data.id);
    if (index === -1) return { ok: false, error: "???????? ??? ??????" };

    const oldItems = history[index].items || [];
    let updatedRecord = null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. ??????? ?? ??????? ??????? (??? ????)
      for (const item of oldItems) {
        if (!item.productId) continue;
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: Number(item.quantity) } }
        }).catch(() => {}); // ????? ??????? ??? ?????? ?????
      }

      // 2. ????? ??????? ???????
      for (const item of data.items) {
        if (!item.productId) continue;
        const updateData = { stock: { increment: Number(item.quantity) } };
        if (item.cost) updateData.boxPurchasePrice = Number(item.cost);
        
        await tx.product.update({
          where: { id: item.productId },
          data: updateData
        });
      }

      // 3. ????? ????? ?? ?????
      history[index] = { ...history[index], ...data, itemsCount: data.items.length, items: data.items };
      updatedRecord = history[index];
      fs.writeFileSync(jsonPath, JSON.stringify(history, null, 2), 'utf8');

      return { ok: true };
    });

    if (result?.ok && updatedRecord) {
      enqueueSyncEvent('purchase.invoice.update', updatedRecord);
      void syncProductsByIds(data.items.map(item => item.productId));
    }
    return result;
});

ipcMain.handle('add-supplier-payment', async (event, data) => {
  const logDir = app.getPath('userData');
  const jsonPath = path.join(logDir, 'supplier-payments.json');
  let payments = [];
  if (fs.existsSync(jsonPath)) {
    try { payments = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
  }
  const newPayment = { 
    id: Date.now(), 
    ...data, 
    amount: Number(data.amount),
    timestamp: new Date().toISOString() 
  };
  payments.unshift(newPayment);
  fs.writeFileSync(jsonPath, JSON.stringify(payments, null, 2), 'utf8');
  enqueueSyncEvent('supplier.payment.add', newPayment);
  return { ok: true };
});

ipcMain.handle('list-supplier-payments', async () => {
  const logDir = app.getPath('userData');
  const jsonPath = path.join(logDir, 'supplier-payments.json');
  if (fs.existsSync(jsonPath)) {
    try { return JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { return []; }
  }
  return [];
});

ipcMain.handle('reset-suppliers', async () => {
  const logDir = app.getPath('userData');
  const paymentsPath = path.join(logDir, 'supplier-payments.json');
  const invoicesPath = path.join(logDir, 'purchase-invoices.json');
  try {
    fs.writeFileSync(paymentsPath, '[]', 'utf8');
    fs.writeFileSync(invoicesPath, '[]', 'utf8');
    enqueueSyncEvent('supplier.reset', { at: new Date().toISOString() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
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
          where: { key: { in: ['storeName', 'storeAddress', 'storePhone'] } }
        });
        
        const storeName = settings.find(s => s.key === 'storeName')?.value;
        const storeAddress = settings.find(s => s.key === 'storeAddress')?.value;
        const storePhone = settings.find(s => s.key === 'storePhone')?.value;

        if (!payload.store) payload.store = {};
        // تعديل: استخدام البيانات من قاعدة البيانات فقط إذا لم تكن موجودة في البايلود
        // هذا يسمح للواجهة بإرسال الاسم المزخرف (رمضان) دون أن يتم استبداله
        if (!payload.store.name && storeName) payload.store.name = storeName;
        if (!payload.store.address && storeAddress) payload.store.address = storeAddress;
        if (!payload.store.phone && storePhone) payload.store.phone = storePhone;
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
    if (payload.qrImage) {
      try {
        const candidates = [
          path.join(__dirname, 'icons', payload.qrImage), // المسار الذي حددته (electron/icons/qr.png)
          path.join(__dirname, '..', 'public', payload.qrImage),
          path.join(__dirname, '..', payload.qrImage),
          path.join(process.resourcesPath, 'public', payload.qrImage),
          path.join(process.resourcesPath, payload.qrImage),
          path.join(app.getPath('userData'), payload.qrImage)
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
          body { font-family: 'Segoe UI', 'Tahoma', sans-serif; margin: 0; padding: 0; width: 100%; background-color: #fff; direction: rtl; color: #000; font-size: 12px; font-weight: 600; }
          .content {
              width: 100%;
              max-width: 100%;
              margin: 0;
              padding: 2px;
            }

          
          .header { text-align: center; margin-bottom: 10px; border: 2px solid #000; padding: 5px; border-radius: 5px; }
          .logo-container { margin-bottom: 8px; display: flex; justify-content: center; }
          .store-name { font-size: 18px; font-weight: 900; margin-bottom: 4px; letter-spacing: -0.5px; }
          .company-name { font-size: 14px; font-weight: 900; color: #000; margin-bottom: 4px; }
          .phone-number { font-size: 14px; font-weight: bold; margin-top: 4px; font-family: monospace; }
          
          /* Info Box */
          .meta-box { border: 2px solid #000; padding: 5px; margin-bottom: 10px; border-radius: 4px; width: 100%; }
          .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          
          /* Table */
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
          th, td { border: 1px solid #000; padding: 4px; text-align: center; }
          th { background-color: #f2f2f2; font-weight: bold; }
          td.item-name { text-align: center; font-weight: bold; }
          
          .totals { margin-top: 5px; border: 2px solid #000; padding: 5px; border-radius: 5px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 10px; }
          .bold { font-weight: bold; }
          .final-total { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 5px; margin-top: 5px; }
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
