declare global {
  interface Window {
    api: {
      listProducts: () => Promise<any[]>;
      upsertProduct: (product: any) => Promise<any>;
      deleteProduct: (id: number) => Promise<any>;
      createSale: (payload: any) => Promise<any>;
      listSales: () => Promise<any[]>;
      updateSale: (payload: any) => Promise<any>;
      // Category APIs added by preload
      listCategories: () => Promise<any[]>;
      upsertCategory: (category: any) => Promise<any>;
      deleteCategory: (id: number) => Promise<any>;
      // User / Cashier APIs
      listUsers: () => Promise<any[]>;
      createUser: (payload: any) => Promise<any>;
      updateUser: (payload: any) => Promise<any>;
      deleteUser: (id: number) => Promise<any>;
      authenticateUser: (payload: any) => Promise<any>;
      // User Activity Log
      createUserActivityLog: (payload: any) => Promise<any>;
      listUserActivityLogs: (payload?: any) => Promise<any[]>;
      // Clients & debts
      listClients: () => Promise<any[]>;
      createClient: (payload: any) => Promise<any>;
      updateClient: (payload: any) => Promise<any>;
      deleteClient: (payload: any) => Promise<any>;
      listDebts: () => Promise<any[]>;
      createDebt: (payload: any) => Promise<any>;
      addDebtPayment: (payload: any) => Promise<any>;
      markDebtPaid: (id: number) => Promise<any>;
      updateDebt: (payload: any) => Promise<any>;
      updateDebtPayment: (payload: any) => Promise<any>;
      deleteDebtPayment: (id: number) => Promise<any>;
      // Returns
      listReturns: () => Promise<any[]>;
      createReturn: (payload: any) => Promise<any>;
      // Daily notes
      listDailyNotes: (payload?: any) => Promise<any[]>;
      createDailyNote: (payload: any) => Promise<any>;
      // Chicken legs
      getChickenDay: (payload?: any) => Promise<any>;
      setChickenDay: (payload: any) => Promise<any>;
      listChickenLogs: (payload?: any) => Promise<any[]>;
      createChickenLog: (payload: any) => Promise<any>;
      // Printing
      printReceipt: (html: string) => Promise<boolean>;
      printThermalReceipt: (payload: any) => Promise<any>;
      // Backups
      backupAll: (payload: any) => Promise<any>;
      backupProducts: (payload: any) => Promise<any>;
      backupDebts: (payload: any) => Promise<any>;
      backupRestore: (payload: any) => Promise<any>;
      listArchives: () => Promise<any[]>;
      readArchive: (payload: any) => Promise<any>;
      runArchiveNow: () => Promise<any>;
      // App settings & cloud sync
      getAppSetting: (key: string) => Promise<any>;
      setAppSetting: (payload: any) => Promise<any>;
      cloudSyncStatus: () => Promise<any>;
      cloudSyncNow: () => Promise<any>;
      cloudSyncFull: () => Promise<any>;
      // App updates
      getUpdateStatus: () => Promise<any>;
      checkForUpdates: () => Promise<any>;
      onUpdateStatus: (callback: (status: any) => void) => () => void;
    };
  }
}

export {};
