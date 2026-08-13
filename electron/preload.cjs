const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  // --- Thermal Printer ---
  printThermalReceipt: (payload, isMock = false) => ipcRenderer.invoke("thermal:print-receipt", payload, isMock),

  // --- Authentication ---
  authenticateUser: (creds) => ipcRenderer.invoke("authenticate-user", creds),

  listCategories: () => ipcRenderer.invoke('list-categories'),
  listProducts: () => ipcRenderer.invoke('list-products'),
  upsertProduct: (product) => ipcRenderer.invoke('upsert-product', product),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  getProductHistory: (id) => ipcRenderer.invoke('get-product-history', id),
  freezeProduct: (payload) => ipcRenderer.invoke('freeze-product', payload),
  setProductAlternative: (payload) => ipcRenderer.invoke('set-product-alternative', payload),
  upsertCategory: (category) => ipcRenderer.invoke('upsert-category', category),
  deleteCategory: (id) => ipcRenderer.invoke('delete-category', id),
  createUserActivityLog: (log) => ipcRenderer.invoke('create-user-activity-log', log),

  // --- Users ---
  listUsers: () => ipcRenderer.invoke('list-users'),
  createUser: (user) => ipcRenderer.invoke('create-user', user),
  updateUser: (user) => ipcRenderer.invoke('update-user', user),
  deleteUser: (id) => ipcRenderer.invoke('delete-user', id),

  // --- Clients ---
  listClients: () => ipcRenderer.invoke('list-clients'),
  createClient: (client) => ipcRenderer.invoke('create-client', client),
  updateClient: (client) => ipcRenderer.invoke('update-client', client),
  deleteClient: (payload) => ipcRenderer.invoke('delete-client', payload),

  // --- Debts ---
  listDebts: () => ipcRenderer.invoke('list-debts'),
  createDebt: (debt) => ipcRenderer.invoke('create-debt', debt),
  updateDebt: (debt) => ipcRenderer.invoke('update-debt', debt),
  addDebtPayment: (payment) => ipcRenderer.invoke('add-debt-payment', payment),
  updateDebtPayment: (payment) => ipcRenderer.invoke('update-debt-payment', payment),
  assignDebtPaymentUser: ({ paymentId, userId }) => ipcRenderer.invoke('assign-debt-payment-user', { paymentId, userId }),
  markDebtPaid: (payload) => ipcRenderer.invoke('mark-debt-paid', payload),

  // --- Sales ---
  createSale: (sale) => ipcRenderer.invoke('create-sale', sale),
  listSales: (opts) => ipcRenderer.invoke('list-sales', opts),
  updateSale: (sale) => ipcRenderer.invoke('update-sale', sale),
  getLastSale: () => ipcRenderer.invoke('get-last-sale'),
  getSaleById: (saleIdentifier) => ipcRenderer.invoke('get-sale-by-id', saleIdentifier),
  createReturn: (ret) => ipcRenderer.invoke('create-return', ret),
  listReturns: () => ipcRenderer.invoke('list-returns'),

  // --- Chicken ---
  listChickenLogs: (payload) => ipcRenderer.invoke('list-chicken-logs', payload),
  setChickenDay: (payload) => ipcRenderer.invoke('set-chicken-day', payload),
  createChickenLog: (log) => ipcRenderer.invoke('create-chicken-log', log),

  // --- App settings ---
  getAppSetting: (key) => ipcRenderer.invoke('get-app-setting', key),
  setAppSetting: (payload) => ipcRenderer.invoke('set-app-setting', payload),
  cloudSyncStatus: () => ipcRenderer.invoke('cloud-sync-status'),
  cloudSyncNow: () => ipcRenderer.invoke('cloud-sync-now'),
  cloudSyncFull: () => ipcRenderer.invoke('cloud-sync-full'),
  getTelegramBotSettings: () => ipcRenderer.invoke('get-telegram-bot-settings'),
  setTelegramBotSettings: (payload) => ipcRenderer.invoke('set-telegram-bot-settings', payload),
  testTelegramBot: (payload) => ipcRenderer.invoke('test-telegram-bot', payload),
  // --- App Updates ---
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  // --- Receipt preview / decode ---
  decodeReceipt: (payload) => ipcRenderer.invoke('decode-receipt', payload),
  exportReportPdf: (payload) => ipcRenderer.invoke('export-report-pdf', payload),

  // --- Reports / Misc ---
  listDailyNotes: (payload) => ipcRenderer.invoke('list-daily-notes', payload),
  createDailyNote: (payload) => ipcRenderer.invoke('create-daily-note', payload),
  updateDailyNote: (payload) => ipcRenderer.invoke('update-daily-note', payload),
  deleteDailyNote: (id) => ipcRenderer.invoke('delete-daily-note', id),
  importLegacyDBF: () => ipcRenderer.invoke('import-legacy-dbf'),
  processPurchaseInvoice: (payload) => ipcRenderer.invoke('process-purchase-invoice', payload),
  listPurchaseInvoices: (opts) => ipcRenderer.invoke('list-purchase-invoices', opts),
  updatePurchaseInvoice: (payload) => ipcRenderer.invoke('update-purchase-invoice', payload),
  addSupplierPayment: (data) => ipcRenderer.invoke('add-supplier-payment', data),
  updateSupplierPayment: (data) => ipcRenderer.invoke('update-supplier-payment', data),
  listSupplierPayments: () => ipcRenderer.invoke('list-supplier-payments'),
  resetSuppliers: () => ipcRenderer.invoke('reset-suppliers'),
  // --- Invoice Change Logs ---
  listInvoiceChanges: (opts) => ipcRenderer.invoke('list-invoice-changes', opts),
  getInvoiceChangesById: (payload) => ipcRenderer.invoke('get-invoice-changes-by-id', payload),
  // --- Archives ---
  listArchives: () => ipcRenderer.invoke('list-archives'),
  readArchive: (payload) => ipcRenderer.invoke('read-archive', payload),
  runArchiveNow: () => ipcRenderer.invoke('run-archive-now'),
  // --- Backups (renderer calls these; handlers may be added in main later) ---
  backupCreate: (payload) => ipcRenderer.invoke('backup-create', payload),
  backupList: () => ipcRenderer.invoke('backup-list'),
  backupRestoreManaged: (payload) => ipcRenderer.invoke('backup-restore-managed', payload),
  backupAll: (payload) => ipcRenderer.invoke('backup-all', payload),
  backupProducts: (payload) => ipcRenderer.invoke('backup-products', payload),
  backupDebts: (payload) => ipcRenderer.invoke('backup-debts', payload),
  restoreDebts: (payload) => ipcRenderer.invoke('restore-debts', payload),
  backupRestore: (payload) => ipcRenderer.invoke('backup-restore', payload),
  // --- User Activity Logs ---
  listUserActivityLogs: (payload) => ipcRenderer.invoke('list-user-activity-logs', payload),
  listPricingLogs: (payload) => ipcRenderer.invoke('list-pricing-logs', payload),
  // --- Center Cashbox ---
  listCenterCashboxEntries: (payload) => ipcRenderer.invoke('list-center-cashbox-entries', payload),
  createCenterCashboxEntry: (payload) => ipcRenderer.invoke('create-center-cashbox-entry', payload),
  updateCenterCashboxEntry: (payload) => ipcRenderer.invoke('update-center-cashbox-entry', payload),
  deleteCenterCashboxEntry: (payload) => ipcRenderer.invoke('delete-center-cashbox-entry', payload),
  exportCenterCashboxCsv: (payload) => ipcRenderer.invoke('export-center-cashbox-csv', payload),
  // --- AI ---
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  // --- System ---
  zeroNegativeStock: () => ipcRenderer.invoke('zero-negative-stock'),
  zeroAllStock: () => ipcRenderer.invoke('zero-all-stock'),
  chooseReceiptBarcodeImage: () => ipcRenderer.invoke('choose-receipt-barcode-image'),
  runAutoPricing: () => ipcRenderer.invoke('run-auto-pricing'),
  captureAutoPricingProfiles: () => ipcRenderer.invoke('capture-auto-pricing-profiles'),
  factoryReset: () => ipcRenderer.invoke('factory-reset'),
  // --- Network Status ---
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  onNetworkStatusChange: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('network-status-changed', handler);
    return () => ipcRenderer.removeListener('network-status-changed', handler);
  },
});
