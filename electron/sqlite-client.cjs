const path = require("path");
const sqlite = require("sqlite-electron");

const MODEL_META = {
  category: {
    table: "Category",
    pk: "id",
    booleanFields: [],
    dateFields: [],
  },
  product: {
    table: "Product",
    pk: "id",
    booleanFields: [],
    dateFields: [],
  },
  sale: {
    table: "Sale",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  saleItem: {
    table: "SaleItem",
    pk: "id",
    booleanFields: [],
    dateFields: [],
  },
  return: {
    table: "Return",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  returnItem: {
    table: "ReturnItem",
    pk: "id",
    booleanFields: [],
    dateFields: [],
  },
  user: {
    table: "User",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  client: {
    table: "Client",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt", "updatedAt"],
  },
  debt: {
    table: "Debt",
    pk: "id",
    booleanFields: ["paid"],
    dateFields: ["dueDate", "paidAt", "createdAt"],
  },
  debtPayment: {
    table: "DebtPayment",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  dailyNote: {
    table: "DailyNote",
    pk: "id",
    booleanFields: [],
    dateFields: ["noteDate", "createdAt"],
  },
  chickenLegDay: {
    table: "ChickenLegDay",
    pk: "id",
    booleanFields: [],
    dateFields: ["date", "createdAt"],
  },
  chickenLegLog: {
    table: "ChickenLegLog",
    pk: "id",
    booleanFields: [],
    dateFields: ["logDate", "createdAt"],
  },
  userActivityLog: {
    table: "UserActivityLog",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  purchaseInvoice: {
    table: "PurchaseInvoice",
    pk: "id",
    booleanFields: [],
    dateFields: ["date", "timestamp", "createdAt", "updatedAt"],
  },
  purchaseInvoiceItem: {
    table: "PurchaseInvoiceItem",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  supplierPayment: {
    table: "SupplierPayment",
    pk: "id",
    booleanFields: [],
    dateFields: ["timestamp", "createdAt", "updatedAt"],
  },
  invoiceChangeLog: {
    table: "InvoiceChangeLog",
    pk: "id",
    booleanFields: [],
    dateFields: ["createdAt"],
  },
  appSetting: {
    table: "AppSetting",
    pk: "id",
    booleanFields: [],
    dateFields: ["updatedAt"],
  },
  telegramBotSetting: {
    table: "TelegramBotSetting",
    pk: "id",
    booleanFields: ["enabled"],
    dateFields: ["createdAt", "updatedAt"],
  },
};

const RELATIONS = {
  category: {
    products: { kind: "many", model: "product", foreignKey: "categoryId" },
  },
  product: {
    category: { kind: "one", model: "category", localKey: "categoryId" },
    saleItems: { kind: "many", model: "saleItem", foreignKey: "productId" },
    returnItems: { kind: "many", model: "returnItem", foreignKey: "productId" },
  },
  sale: {
    items: { kind: "many", model: "saleItem", foreignKey: "saleId" },
    cashier: { kind: "one", model: "user", localKey: "cashierId" },
    returns: { kind: "many", model: "return", foreignKey: "saleId" },
  },
  saleItem: {
    sale: { kind: "one", model: "sale", localKey: "saleId" },
    product: { kind: "one", model: "product", localKey: "productId" },
  },
  return: {
    sale: { kind: "one", model: "sale", localKey: "saleId" },
    cashier: { kind: "one", model: "user", localKey: "cashierId" },
    items: { kind: "many", model: "returnItem", foreignKey: "returnId" },
  },
  returnItem: {
    return: { kind: "one", model: "return", localKey: "returnId" },
    product: { kind: "one", model: "product", localKey: "productId" },
  },
  user: {
    sales: { kind: "many", model: "sale", foreignKey: "cashierId" },
    returns: { kind: "many", model: "return", foreignKey: "cashierId" },
    debtsCreated: { kind: "many", model: "debt", foreignKey: "createdById" },
    debtPayments: { kind: "many", model: "debtPayment", foreignKey: "userId" },
    activityLogs: { kind: "many", model: "userActivityLog", foreignKey: "userId" },
    telegramBotSetting: { kind: "one", model: "telegramBotSetting", localKey: "id", targetKey: "userId" },
    telegramCashierCopies: { kind: "many", model: "telegramBotSetting", foreignKey: "cashierUserId" },
  },
  client: {
    debts: { kind: "many", model: "debt", foreignKey: "clientId" },
  },
  debt: {
    client: { kind: "one", model: "client", localKey: "clientId" },
    createdBy: { kind: "one", model: "user", localKey: "createdById" },
    payments: { kind: "many", model: "debtPayment", foreignKey: "debtId" },
  },
  debtPayment: {
    debt: { kind: "one", model: "debt", localKey: "debtId" },
    user: { kind: "one", model: "user", localKey: "userId" },
  },
  chickenLegDay: {
    logs: { kind: "many", model: "chickenLegLog", foreignKey: "dayId" },
  },
  chickenLegLog: {
    day: { kind: "one", model: "chickenLegDay", localKey: "dayId" },
  },
  purchaseInvoice: {
    items: { kind: "many", model: "purchaseInvoiceItem", foreignKey: "invoiceId" },
  },
  purchaseInvoiceItem: {
    invoice: { kind: "one", model: "purchaseInvoice", localKey: "invoiceId" },
    product: { kind: "one", model: "product", localKey: "productId" },
  },
  telegramBotSetting: {
    user: { kind: "one", model: "user", localKey: "userId" },
    cashierUser: { kind: "one", model: "user", localKey: "cashierUserId" },
  },
  invoiceChangeLog: {},
  supplierPayment: {},
  appSetting: {},
  dailyNote: {},
};

function toTableName(model) {
  const meta = MODEL_META[model];
  if (meta) return meta.table;
  return model.charAt(0).toUpperCase() + model.slice(1);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizeDate(value) {
  if (value == null || value === "") return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toJsValue(model, field, value) {
  if (value == null) return value;
  const meta = MODEL_META[model];
  if (!meta) return value;
  if (meta.booleanFields.includes(field)) return Boolean(value);
  if (meta.dateFields.includes(field)) return new Date(value);
  return value;
}

function fromJsValue(model, field, value) {
  if (value == null) return value;
  const meta = MODEL_META[model];
  if (!meta) return value;
  if (meta.booleanFields.includes(field)) return value ? 1 : 0;
  if (meta.dateFields.includes(field)) return normalizeDate(value);
  return value;
}

function splitSelect(select) {
  if (!select) return null;
  if (Array.isArray(select)) return select;
  return Object.keys(select).filter((key) => select[key]);
}

function uniq(arr) {
  return [...new Set(arr)];
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function buildWhere(where, params) {
  if (!where || Object.keys(where).length === 0) return "";
  const clauses = [];
  for (const [field, raw] of Object.entries(where)) {
    if (raw == null) {
      clauses.push(`${quoteIdent(field)} IS NULL`);
      continue;
    }
    if (!isPlainObject(raw) || raw instanceof Date) {
      clauses.push(`${quoteIdent(field)} = ?`);
      params.push(normalizeDate(raw));
      continue;
    }
    if (Array.isArray(raw.in)) {
      if (!raw.in.length) {
        clauses.push("1 = 0");
      } else {
        clauses.push(`${quoteIdent(field)} IN (${raw.in.map(() => "?").join(", ")})`);
        params.push(...raw.in.map(normalizeDate));
      }
      continue;
    }
    if (Array.isArray(raw.notIn)) {
      if (!raw.notIn.length) continue;
      clauses.push(`${quoteIdent(field)} NOT IN (${raw.notIn.map(() => "?").join(", ")})`);
      params.push(...raw.notIn.map(normalizeDate));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "contains")) {
      clauses.push(`${quoteIdent(field)} LIKE ?`);
      params.push(`%${String(raw.contains).replace(/[%_]/g, "\\$&")}%`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "startsWith")) {
      clauses.push(`${quoteIdent(field)} LIKE ?`);
      params.push(`${String(raw.startsWith).replace(/[%_]/g, "\\$&")}%`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "endsWith")) {
      clauses.push(`${quoteIdent(field)} LIKE ?`);
      params.push(`%${String(raw.endsWith).replace(/[%_]/g, "\\$&")}`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "equals")) {
      clauses.push(`${quoteIdent(field)} = ?`);
      params.push(normalizeDate(raw.equals));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "gt")) {
      clauses.push(`${quoteIdent(field)} > ?`);
      params.push(normalizeDate(raw.gt));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "gte")) {
      clauses.push(`${quoteIdent(field)} >= ?`);
      params.push(normalizeDate(raw.gte));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "lt")) {
      clauses.push(`${quoteIdent(field)} < ?`);
      params.push(normalizeDate(raw.lt));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "lte")) {
      clauses.push(`${quoteIdent(field)} <= ?`);
      params.push(normalizeDate(raw.lte));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "not")) {
      const notValue = raw.not;
      if (notValue == null) {
        clauses.push(`${quoteIdent(field)} IS NOT NULL`);
      } else {
        clauses.push(`${quoteIdent(field)} <> ?`);
        params.push(normalizeDate(notValue));
      }
      continue;
    }
    throw new Error(`Unsupported filter for ${field}`);
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildOrderBy(orderBy) {
  if (!orderBy) return "";
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts = [];
  for (const item of items) {
    for (const [field, dir] of Object.entries(item)) {
      if (isPlainObject(dir)) {
        for (const [nestedField, nestedDir] of Object.entries(dir)) {
          parts.push(`${quoteIdent(nestedField)} ${String(nestedDir).toUpperCase() === "DESC" ? "DESC" : "ASC"}`);
        }
      } else {
        parts.push(`${quoteIdent(field)} ${String(dir).toUpperCase() === "DESC" ? "DESC" : "ASC"}`);
      }
    }
  }
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

function applySelect(row, select, relationKeys = []) {
  if (!select) return row;
  const out = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (!enabled) continue;
    if (key in row) out[key] = row[key];
  }
  for (const key of relationKeys) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

class LitePrismaLikeClient {
  constructor(options = {}) {
    const dbUrl = options?.datasources?.db?.url || options?.datasourceUrl || process.env.DATABASE_URL;
    this.dbPath = this._resolveDbPath(dbUrl);
    this._ready = this._init();
    this._columns = new Map();
    this._txDepth = 0;
    this._delegateCache = new Map();
  }

  _resolveDbPath(dbUrl) {
    if (!dbUrl) throw new Error("DATABASE_URL is required");
    if (dbUrl.startsWith("file:")) return dbUrl.slice("file:".length);
    return dbUrl;
  }

  async _init() {
    await sqlite.setdbPath(this.dbPath);
    for (const [model, meta] of Object.entries(MODEL_META)) {
      const rows = await sqlite.fetchAll(`PRAGMA table_info(${quoteIdent(meta.table)});`);
      this._columns.set(model, rows.map((row) => row.name));
    }
  }

  async _ensureReady() {
    await this._ready;
  }

  $use() {
    return undefined;
  }

  async $disconnect() {
    return true;
  }

  _getColumns(model) {
    const cols = this._columns.get(model);
    if (!cols || !cols.length) {
      throw new Error(`Unknown columns for model ${model}`);
    }
    return cols;
  }

  _primaryKey(model) {
    return MODEL_META[model]?.pk || "id";
  }

  _coerceData(model, data) {
    const cols = new Set(this._getColumns(model));
    const out = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (!cols.has(key)) continue;
      out[key] = fromJsValue(model, key, value);
    }
    return out;
  }

  _rowFromDb(model, row) {
    if (!row) return row;
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = toJsValue(model, key, value);
    }
    return out;
  }

  async _rawAll(sql, values = []) {
    await this._ensureReady();
    return sqlite.fetchAll(sql, values);
  }

  async _rawOne(sql, values = []) {
    await this._ensureReady();
    return sqlite.fetchOne(sql, values);
  }

  async _rawExec(sql, values = []) {
    await this._ensureReady();
    return sqlite.executeQuery(sql, values);
  }

  async $queryRaw(strings, ...values) {
    await this._ensureReady();
    if (typeof strings === "string") {
      return this._rawAll(strings, values);
    }
    const sql = strings.reduce((acc, chunk, index) => `${acc}${chunk}${index < values.length ? "?" : ""}`, "");
    return this._rawAll(sql, values.map(normalizeDate));
  }

  async $executeRaw(strings, ...values) {
    await this._ensureReady();
    if (typeof strings === "string") {
      return this._rawExec(strings, values);
    }
    const sql = strings.reduce((acc, chunk, index) => `${acc}${chunk}${index < values.length ? "?" : ""}`, "");
    return this._rawExec(sql, values.map(normalizeDate));
  }

  async $queryRawUnsafe(sql) {
    const trimmed = String(sql || "").trim().toUpperCase();
    if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA") || trimmed.startsWith("WITH")) {
      return this._rawAll(sql);
    }
    return this._rawExec(sql);
  }

  async $executeRawUnsafe(sql) {
    return this._rawExec(sql);
  }

  async $transaction(arg) {
    await this._ensureReady();
    if (Array.isArray(arg)) {
      const results = [];
      for (const op of arg) {
        results.push(await op);
      }
      return results;
    }

    if (typeof arg !== "function") {
      throw new Error("$transaction expects a callback");
    }

    if (this._txDepth > 0) {
      const savepoint = `sp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      await this._rawExec(`SAVEPOINT ${savepoint}`);
      this._txDepth += 1;
      try {
        const result = await arg(this._createTxProxy());
        await this._rawExec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await this._rawExec(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => {});
        await this._rawExec(`RELEASE SAVEPOINT ${savepoint}`).catch(() => {});
        throw error;
      } finally {
        this._txDepth -= 1;
      }
    }

    await this._rawExec("BEGIN IMMEDIATE TRANSACTION");
    this._txDepth += 1;
    try {
      const result = await arg(this._createTxProxy());
      await this._rawExec("COMMIT");
      return result;
    } catch (error) {
      await this._rawExec("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      this._txDepth -= 1;
    }
  }

  _createTxProxy() {
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === "then") return undefined;
        const value = target[prop];
        if (typeof prop === "string" && prop in MODEL_META) {
          return target._delegate(prop);
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  _delegate(model) {
    if (this._delegateCache.has(model)) return this._delegateCache.get(model);
    const delegate = {
      findUnique: (args) => this._findOne(model, args, true),
      findFirst: (args) => this._findOne(model, args, false),
      findMany: (args) => this._findMany(model, args),
      create: (args) => this._create(model, args),
      update: (args) => this._update(model, args),
      delete: (args) => this._delete(model, args),
      upsert: (args) => this._upsert(model, args),
      deleteMany: (args) => this._deleteMany(model, args),
      updateMany: (args) => this._updateMany(model, args),
      count: (args) => this._count(model, args),
    };
    this._delegateCache.set(model, delegate);
    return delegate;
  }

  get product() { return this._delegate("product"); }
  get category() { return this._delegate("category"); }
  get sale() { return this._delegate("sale"); }
  get saleItem() { return this._delegate("saleItem"); }
  get return() { return this._delegate("return"); }
  get returnItem() { return this._delegate("returnItem"); }
  get user() { return this._delegate("user"); }
  get client() { return this._delegate("client"); }
  get debt() { return this._delegate("debt"); }
  get debtPayment() { return this._delegate("debtPayment"); }
  get dailyNote() { return this._delegate("dailyNote"); }
  get chickenLegDay() { return this._delegate("chickenLegDay"); }
  get chickenLegLog() { return this._delegate("chickenLegLog"); }
  get userActivityLog() { return this._delegate("userActivityLog"); }
  get purchaseInvoice() { return this._delegate("purchaseInvoice"); }
  get purchaseInvoiceItem() { return this._delegate("purchaseInvoiceItem"); }
  get supplierPayment() { return this._delegate("supplierPayment"); }
  get invoiceChangeLog() { return this._delegate("invoiceChangeLog"); }
  get appSetting() { return this._delegate("appSetting"); }
  get telegramBotSetting() { return this._delegate("telegramBotSetting"); }

  async _findOne(model, args = {}, unique = false) {
    const rows = await this._findMany(model, { ...args, take: 1 });
    return rows[0] || null;
  }

  async _findMany(model, args = {}) {
    await this._ensureReady();
    const meta = MODEL_META[model];
    const cols = this._getColumns(model);
    const select = splitSelect(args.select);
    const relationKeys = args.include ? Object.keys(args.include) : [];
    const selectedCols = select && select.length ? uniq([...select, ...relationKeys.filter((k) => false)]) : cols;
    const params = [];
    const whereSql = buildWhere(args.where, params);
    const orderSql = buildOrderBy(args.orderBy);
    let sql = `SELECT ${selectedCols.map(quoteIdent).join(", ")} FROM ${quoteIdent(meta.table)} ${whereSql} ${orderSql}`.trim();
    if (args.take != null) sql += ` LIMIT ${Number(args.take)}`;
    if (args.skip != null) sql += ` OFFSET ${Number(args.skip)}`;
    const rows = await this._rawAll(sql, params);
    let mapped = rows.map((row) => this._rowFromDb(model, row));
    if (args.include) mapped = await this._applyIncludes(model, mapped, args.include);
    if (select) mapped = mapped.map((row) => applySelect(row, args.select, relationKeys));
    return mapped;
  }

  async _count(model, args = {}) {
    await this._ensureReady();
    const meta = MODEL_META[model];
    const params = [];
    const whereSql = buildWhere(args.where, params);
    const row = await this._rawOne(`SELECT COUNT(*) AS count FROM ${quoteIdent(meta.table)} ${whereSql}`, params);
    return Number(row?.count || 0);
  }

  async _create(model, args = {}) {
    const meta = MODEL_META[model];
    const data = this._coerceData(model, args.data || {});
    const cols = Object.keys(data);
    if (!cols.length) {
      await this._rawExec(`INSERT INTO ${quoteIdent(meta.table)} DEFAULT VALUES`);
    } else {
      const params = cols.map((key) => data[key]);
      const sql = `INSERT INTO ${quoteIdent(meta.table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      await this._rawExec(sql, params);
    }
    const pk = this._primaryKey(model);
    let created = null;
    if (Object.prototype.hasOwnProperty.call(data, pk)) {
      created = await this._findOne(model, { where: { [pk]: data[pk] }, include: args.include, select: args.select });
    } else {
      const last = await this._rawOne("SELECT last_insert_rowid() AS id");
      created = await this._findOne(model, { where: { [pk]: last?.id }, include: args.include, select: args.select });
    }
    return created;
  }

  async _update(model, args = {}) {
    const meta = MODEL_META[model];
    const pk = this._primaryKey(model);
    const where = args.where || {};
    const key = Object.keys(where)[0] || pk;
    const value = where[key];
    const data = this._coerceData(model, args.data || {});
    const cols = Object.keys(data);
    if (!cols.length) return this._findOne(model, { where, include: args.include, select: args.select });
    const sql = `UPDATE ${quoteIdent(meta.table)} SET ${cols.map((col) => `${quoteIdent(col)} = ?`).join(", ")} WHERE ${quoteIdent(key)} = ?`;
    await this._rawExec(sql, [...cols.map((col) => data[col]), normalizeDate(value)]);
    return this._findOne(model, { where, include: args.include, select: args.select });
  }

  async _delete(model, args = {}) {
    const meta = MODEL_META[model];
    const where = args.where || {};
    const key = Object.keys(where)[0];
    const value = where[key];
    const existing = await this._findOne(model, { where, select: { [this._primaryKey(model)]: true } });
    if (!existing) return null;
    await this._rawExec(`DELETE FROM ${quoteIdent(meta.table)} WHERE ${quoteIdent(key)} = ?`, [normalizeDate(value)]);
    return existing;
  }

  async _deleteMany(model, args = {}) {
    const meta = MODEL_META[model];
    const params = [];
    const whereSql = buildWhere(args.where, params);
    const rows = await this._rawAll(`SELECT ${quoteIdent(this._primaryKey(model))} FROM ${quoteIdent(meta.table)} ${whereSql}`, params);
    if (!rows.length) return { count: 0 };
    const ids = rows.map((row) => row[this._primaryKey(model)]);
    await this._rawExec(`DELETE FROM ${quoteIdent(meta.table)} WHERE ${quoteIdent(this._primaryKey(model))} IN (${ids.map(() => "?").join(", ")})`, ids);
    return { count: ids.length };
  }

  async _updateMany(model, args = {}) {
    const meta = MODEL_META[model];
    const data = this._coerceData(model, args.data || {});
    const cols = Object.keys(data);
    if (!cols.length) return { count: 0 };
    const params = [];
    const whereSql = buildWhere(args.where, params);
    const rows = await this._rawAll(`SELECT ${quoteIdent(this._primaryKey(model))} FROM ${quoteIdent(meta.table)} ${whereSql}`, params);
    if (!rows.length) return { count: 0 };
    const ids = rows.map((row) => row[this._primaryKey(model)]);
    const sql = `UPDATE ${quoteIdent(meta.table)} SET ${cols.map((col) => `${quoteIdent(col)} = ?`).join(", ")} WHERE ${quoteIdent(this._primaryKey(model))} IN (${ids.map(() => "?").join(", ")})`;
    await this._rawExec(sql, [...cols.map((col) => data[col]), ...ids]);
    return { count: ids.length };
  }

  async _upsert(model, args = {}) {
    const where = args.where || {};
    const found = await this._findOne(model, { where });
    if (found) return this._update(model, { where, data: args.update || {}, include: args.include, select: args.select });
    return this._create(model, { data: args.create || {}, include: args.include, select: args.select });
  }

  async _applyIncludes(model, rows, include) {
    const relationDefs = RELATIONS[model] || {};
    let out = rows.map((row) => ({ ...row }));
    for (const [relationName, relationSpec] of Object.entries(include || {})) {
      const relation = relationDefs[relationName];
      if (!relation) continue;
      const nested = relationSpec === true ? {} : relationSpec || {};
      if (relation.kind === "many") {
        const parentKey = relation.localKey || this._primaryKey(model);
        const parentValues = uniq(out.map((row) => row[parentKey]).filter((value) => value != null));
        if (!parentValues.length) {
          for (const row of out) row[relationName] = [];
          continue;
        }
        const children = await this._findMany(relation.model, {
          where: { [relation.foreignKey]: { in: parentValues } },
          select: nested.select,
          include: nested.include,
          orderBy: nested.orderBy,
        });
        const grouped = new Map();
        for (const child of children) {
          const key = child[relation.foreignKey];
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(child);
        }
        for (const row of out) row[relationName] = grouped.get(row[parentKey]) || [];
      } else {
        const localKey = relation.localKey || `${relationName}Id`;
        const targetKey = relation.targetKey || this._primaryKey(relation.model);
        const values = uniq(out.map((row) => row[localKey]).filter((value) => value != null));
        if (!values.length) {
          for (const row of out) row[relationName] = null;
          continue;
        }
        const related = await this._findMany(relation.model, {
          where: { [targetKey]: { in: values } },
          select: nested.select,
          include: nested.include,
          orderBy: nested.orderBy,
        });
        const byId = new Map(related.map((item) => [item[targetKey], item]));
        for (const row of out) row[relationName] = byId.get(row[localKey]) || null;
      }
    }
    return out;
  }
}

module.exports = {
  LitePrismaLikeClient,
};
