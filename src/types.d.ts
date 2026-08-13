declare global {
  interface Window {
    api: {
      // Printing
      printThermalReceipt: (payload: any, isMock?: boolean) => Promise<any>;
      decodeReceipt: (payload: any) => Promise<any>;
      exportReportPdf: (payload: any) => Promise<any>;

      // Auth / Users
      authenticateUser: (payload: any) => Promise<any>;
      listUsers: () => Promise<any[]>;
      createUser: (payload: any) => Promise<any>;
      updateUser: (payload: any) => Promise<any>;
      deleteUser: (id: number) => Promise<any>;
      createUserActivityLog: (payload: any) => Promise<any>;
      listUserActivityLogs: (payload?: any) => Promise<any[]>;

      // Categories / Products
      listCategories: () => Promise<any[]>;
      listProducts: () => Promise<any[]>;
      upsertProduct: (product: any) => Promise<any>;
      deleteProduct: (id: number) => Promise<any>;
      getProductHistory: (id: number) => Promise<any>;
      freezeProduct: (payload: any) => Promise<any>;
      setProductAlternative: (payload: any) => Promise<any>;
      upsertCategory: (category: any) => Promise<any>;
      deleteCategory: (id: number) => Promise<any>;

      // Clients / Debts
      listClients: () => Promise<any[]>;
      createClient: (payload: any) => Promise<any>;
      updateClient: (payload: any) => Promise<any>;
      deleteClient: (payload: any) => Promise<any>;
      listDebts: (opts?: any) => Promise<any[]>;
      createDebt: (payload: any) => Promise<any>;
      updateDebt: (payload: any) => Promise<any>;
      addDebtPayment: (payload: any) => Promise<any>;
      updateDebtPayment: (payload: any) => Promise<any>;
      assignDebtPaymentUser: (payload: { paymentId: number; userId: number | null }) => Promise<any>;
      markDebtPaid: (payload: { id: number; userId?: number | null }) => Promise<any>;

      // Sales
      createSale: (payload: any) => Promise<any>;
      listSales: (opts?: any) => Promise<any[]>;
      updateSale: (payload: any) => Promise<any>;
      getLastSale: () => Promise<any>;
      getSaleById: (saleIdentifier: string | number) => Promise<any>;
      listReturns: (opts?: any) => Promise<any[]>;
      createReturn: (payload: any) => Promise<any>;

      // Chicken
      listChickenLogs: (payload?: any) => Promise<{ startingStock: number; logs: any[] }>;
      setChickenDay: (payload: any) => Promise<any>;
      createChickenLog: (payload: any) => Promise<any>;

      // Daily notes
      listDailyNotes: (payload?: any) => Promise<any[]>;
      createDailyNote: (payload: any) => Promise<any>;
      updateDailyNote: (payload: any) => Promise<any>;
      deleteDailyNote: (id: number) => Promise<any>;

      // Suppliers / Purchases
      processPurchaseInvoice: (payload: any) => Promise<any>;
      listPurchaseInvoices: (opts?: any) => Promise<any[]>;
      updatePurchaseInvoice: (payload: any) => Promise<any>;
      addSupplierPayment: (payload: any) => Promise<any>;
      updateSupplierPayment: (payload: any) => Promise<any>;
      listSupplierPayments: () => Promise<any[]>;
      resetSuppliers: () => Promise<any>;
      listInvoiceChanges: (payload?: any) => Promise<any[]>;
      getInvoiceChangesById: (payload: any) => Promise<any[]>;

      // Reports / Archives / Import
      importLegacyDBF: () => Promise<any>;
      listArchives: () => Promise<any[]>;
      readArchive: (payload: any) => Promise<any>;
      runArchiveNow: () => Promise<any>;

      // Backups
      backupCreate: (payload: any) => Promise<any>;
      backupList: () => Promise<any>;
      backupRestoreManaged: (payload: any) => Promise<any>;
      backupAll: (payload: any) => Promise<any>;
      backupProducts: (payload: any) => Promise<any>;
      backupDebts: (payload: any) => Promise<any>;
      restoreDebts: (payload: any) => Promise<any>;
      backupRestore: (payload: any) => Promise<any>;

      // Admin / Pricing / Cashbox
      listPricingLogs: (payload?: any) => Promise<any[]>;
      listCenterCashboxEntries: (payload?: any) => Promise<any[]>;
      createCenterCashboxEntry: (payload: any) => Promise<any>;
      updateCenterCashboxEntry: (payload: any) => Promise<any>;
      deleteCenterCashboxEntry: (payload: any) => Promise<any>;
      exportCenterCashboxCsv: (payload?: any) => Promise<any>;
      aiChat: (payload: { message: string; userRole?: string }) => Promise<any>;
      zeroNegativeStock: () => Promise<any>;
      zeroAllStock: () => Promise<any>;
      chooseReceiptBarcodeImage: () => Promise<any>;
      runAutoPricing: () => Promise<any>;
      captureAutoPricingProfiles: () => Promise<any>;
      factoryReset: () => Promise<any>;

      // App settings & cloud sync
      getAppSetting: (key: string) => Promise<any>;
      setAppSetting: (payload: any) => Promise<any>;
      cloudSyncStatus: () => Promise<any>;
      cloudSyncNow: () => Promise<any>;
      cloudSyncFull: () => Promise<any>;
      getTelegramBotSettings: () => Promise<any>;
      setTelegramBotSettings: (payload: any) => Promise<any>;
      testTelegramBot: (payload: any) => Promise<any>;
      // App updates
      getUpdateStatus: () => Promise<any>;
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      installUpdate: () => Promise<any>;
      onUpdateStatus: (callback: (status: any) => void) => () => void;

      // Legacy optional (kept for compatibility with older code paths)
      deleteDebtPayment?: (id: number) => Promise<any>;
      getChickenDay?: (payload?: any) => Promise<any>;
      printReceipt?: (html: string) => Promise<boolean>;
    };
  }
}

export {};
