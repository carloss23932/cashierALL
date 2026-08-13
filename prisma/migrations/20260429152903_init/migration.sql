-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT
);

-- CreateTable
CREATE TABLE "Product" (
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
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" REAL NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "commission" REAL NOT NULL DEFAULT 0,
    "clientName" TEXT,
    "cashierId" INTEGER,
    CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "saleId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Return" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "saleId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashierId" INTEGER,
    CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Return_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT DEFAULT 'cashier',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Debt" (
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
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "amount" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "debtId" INTEGER NOT NULL,
    "userId" INTEGER,
    CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DebtPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChickenLegDay" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "startingStock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChickenLegLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "logDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayId" INTEGER NOT NULL,
    CONSTRAINT "ChickenLegLog_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ChickenLegDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT,
    "date" DATETIME,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierName" TEXT,
    "cashier" TEXT,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "productId" INTEGER,
    "productName" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "note" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InvoiceChangeLog" (
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

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ChickenLegDay_date_key" ON "ChickenLegDay"("date");

-- CreateIndex
CREATE INDEX "UserActivityLog_userId_idx" ON "UserActivityLog"("userId");

-- CreateIndex
CREATE INDEX "UserActivityLog_createdAt_idx" ON "UserActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "UserActivityLog_userId_createdAt_idx" ON "UserActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_timestamp_idx" ON "PurchaseInvoice"("timestamp");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_date_idx" ON "PurchaseInvoice"("date");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierName_idx" ON "PurchaseInvoice"("supplierName");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceItem_invoiceId_idx" ON "PurchaseInvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceItem_productId_idx" ON "PurchaseInvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierName_idx" ON "SupplierPayment"("supplierName");

-- CreateIndex
CREATE INDEX "SupplierPayment_timestamp_idx" ON "SupplierPayment"("timestamp");

-- CreateIndex
CREATE INDEX "InvoiceChangeLog_invoiceType_idx" ON "InvoiceChangeLog"("invoiceType");

-- CreateIndex
CREATE INDEX "InvoiceChangeLog_invoiceId_idx" ON "InvoiceChangeLog"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceChangeLog_userId_idx" ON "InvoiceChangeLog"("userId");

-- CreateIndex
CREATE INDEX "InvoiceChangeLog_createdAt_idx" ON "InvoiceChangeLog"("createdAt");

-- CreateIndex
CREATE INDEX "InvoiceChangeLog_invoiceType_invoiceId_idx" ON "InvoiceChangeLog"("invoiceType", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");
