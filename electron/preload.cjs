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
  // --- App Updates ---
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  // --- Receipt preview / decode ---
  decodeReceipt: (payload) => ipcRenderer.invoke('decode-receipt', payload),

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
  listSupplierPayments: () => ipcRenderer.invoke('list-supplier-payments'),
  resetSuppliers: () => ipcRenderer.invoke('reset-suppliers'),
  // --- Archives ---
  listArchives: () => ipcRenderer.invoke('list-archives'),
  readArchive: (payload) => ipcRenderer.invoke('read-archive', payload),
  runArchiveNow: () => ipcRenderer.invoke('run-archive-now'),
  // --- Backups (renderer calls these; handlers may be added in main later) ---
  backupAll: (payload) => ipcRenderer.invoke('backup-all', payload),
  backupProducts: (payload) => ipcRenderer.invoke('backup-products', payload),
  backupDebts: (payload) => ipcRenderer.invoke('backup-debts', payload),
  restoreDebts: (payload) => ipcRenderer.invoke('restore-debts', payload),
  backupRestore: (payload) => ipcRenderer.invoke('backup-restore', payload),
  // --- User Activity Logs ---
  listUserActivityLogs: (payload) => ipcRenderer.invoke('list-user-activity-logs', payload),
  // --- System ---
  factoryReset: () => ipcRenderer.invoke('factory-reset'),
});
