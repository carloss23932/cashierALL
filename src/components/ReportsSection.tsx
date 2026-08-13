import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Calendar, DollarSign, FileText, Package, ShoppingCart, TrendingUp, CreditCard, Download, Users, Loader2, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";

// دالة لتحويل التاريخ إلى توقيت بغداد (UTC+3) والحصول على التاريخ بصيغة YYYY-MM-DD
const toBaghdadDateString = (dateInput: string | Date): string => {
  const date = new Date(dateInput);
  // تعديل: اليوم الجديد يبدأ الساعة 1 صباحاً بتوقيت العراق (UTC+3)
  // لذا نضيف 2 ساعة فقط لـ UTC بدلاً من 3، بحيث تظل الفترة من 00:00 إلى 01:00 محسوبة على اليوم السابق
  date.setUTCHours(date.getUTCHours() + 2);
  return date.toISOString().slice(0, 10);
};

const normalizeLookupText = (value: any) => String(value || "").trim().toLowerCase();

const resolveUnitsPerBox = (...values: any[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1;
};

const resolveCapitalUnitCost = (product: any, purchaseStats?: { totalUnits: number; totalCost: number }) => {
  const fallbackUnits = resolveUnitsPerBox(product?.unitsPerBox, 1);
  const fallbackBoxCost = Number(product?.boxPurchasePrice || 0);
  const fallbackUnitCost = fallbackBoxCost > 0 ? fallbackBoxCost / fallbackUnits : 0;

  if (purchaseStats && purchaseStats.totalUnits > 0 && purchaseStats.totalCost > 0) {
    return purchaseStats.totalCost / purchaseStats.totalUnits;
  }

  return fallbackUnitCost;
};

const ReportsSection = ({ currentUser }: { currentUser?: any }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedReport, setSelectedReport] = useState("sales");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportTrigger, setReportTrigger] = useState(0);
  const [coverageDays, setCoverageDays] = useState(15); // عدد الأيام المراد تغطيتها بالشراء
  const [shortageCategoryFilter, setShortageCategoryFilter] = useState("all");

  const [salesData, setSalesData] = useState<any[]>([]);
  const [productsData, setProductsData] = useState<any[]>([]);
  const [categoriesData, setCategoriesData] = useState<any[]>([]);
  const [purchaseInvoicesData, setPurchaseInvoicesData] = useState<any[]>([]);
  const [debtsData, setDebtsData] = useState<any[]>([]);
  const [returnsData, setReturnsData] = useState<any[]>([]);
  const [dailyNotesData, setDailyNotesData] = useState<any[]>([]);
  const [cashboxEntriesData, setCashboxEntriesData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sales, products, categories, purchaseInvoices, debts, returns, dailyNotes, cashboxEntries] = await Promise.all([
        window.api.listSales({ limit: 100000 }), // جلب كافة الفواتير للتقارير لضمان دقة الحسابات
        window.api.listProducts(),
        window.api.listCategories ? window.api.listCategories() : Promise.resolve([]),
        window.api.listPurchaseInvoices ? window.api.listPurchaseInvoices({ limit: 100000 }) : Promise.resolve([]),
        typeof window.api.listDebts === 'function' ? window.api.listDebts({ limit: 100000 }) : Promise.resolve([]),
        window.api.listReturns ? window.api.listReturns({ limit: 100000 }) : Promise.resolve([]),
        window.api.listDailyNotes ? window.api.listDailyNotes({ limit: 100000 }) : Promise.resolve([]),
        window.api.listCenterCashboxEntries ? window.api.listCenterCashboxEntries({ limit: 100000 }) : Promise.resolve([]),
      ]);

      const normalizedSales = (sales || []).map((s) => ({
        ...s,
        createdAt: s.createdAt ? String(s.createdAt) : new Date().toISOString(),
      }));
      setSalesData(normalizedSales);
      setProductsData(products || []);
      setCategoriesData(categories || []);
      setPurchaseInvoicesData(purchaseInvoices || []);
      setDebtsData(
        (debts || []).map((d: any) => ({
          ...d,
          paidAt: d?.paidAt ? String(d.paidAt) : null,
        }))
      );
      setReturnsData(
        (returns || []).map((r: any) => ({
          ...r,
          createdAt: r?.createdAt ? String(r.createdAt) : null,
        }))
      );
      setDailyNotesData(
        (dailyNotes || []).map((n: any) => ({
          ...n,
          noteDate: n?.noteDate ? String(n.noteDate) : null,
        }))
      );
      setCashboxEntriesData(
        (cashboxEntries || []).map((entry: any) => ({
          ...entry,
          createdAt: entry?.createdAt ? String(entry.createdAt) : null,
        }))
      );
    } catch (e) {
      console.error("Failed to load reports data", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [reportTrigger]); // إعادة جلب البيانات عند الضغط على زر التحديث

  const filteredSales = useMemo(() => {
    if (!salesData) return [];
    return salesData.filter((s) => {
      // تم إزالة استبعاد الديون لضمان ظهورها في تقارير الأرباح والمبيعات الكلية
      const baghdadDate = toBaghdadDateString(s.createdAt);
      if (dateFrom && baghdadDate < dateFrom) return false;
      if (dateTo && baghdadDate > dateTo) return false;
      return true;
    });
  }, [salesData, dateFrom, dateTo, reportTrigger]);

  const paidDebtsByDate = useMemo(() => {
    const map = new Map<string, number>();
    (debtsData || []).forEach((d) => {
      // المرور على كل دفعة جزئية ضمن الدين
      (d.payments || []).forEach((payment) => {
        if (!payment?.createdAt) return;
        const dateKey = toBaghdadDateString(payment.createdAt);
        if (dateFrom && dateKey < dateFrom) return;
        if (dateTo && dateKey > dateTo) return;
        map.set(dateKey, (map.get(dateKey) || 0) + Number(payment.amount || 0));
      });
    });
    return map;
  }, [debtsData, dateFrom, dateTo, reportTrigger]);

  const returnsByDate = useMemo(() => {
    const map = new Map<string, number>();
    (returnsData || []).forEach((r) => {
      if (!r?.createdAt) return;
      // استبعاد مرتجعات الديون والبطاقة من حسابات الصندوق النقدي
      if (r.sale?.paymentMethod === 'debt' || r.sale?.paymentMethod === 'mastercard') return;
      const dateKey = toBaghdadDateString(r.createdAt);
      if (dateFrom && dateKey < dateFrom) return;
      if (dateTo && dateKey > dateTo) return;
      const subtotal = (r.items || []).reduce(
        (acc: number, it: any) => acc + Number(it.price || 0) * Number(it.quantity || 0),
        0
      );
      map.set(dateKey, (map.get(dateKey) || 0) + subtotal);
    });
    return map;
  }, [returnsData, dateFrom, dateTo, reportTrigger]);

  const dailyNotesByDate = useMemo(() => {
    const map = new Map<string, number>();
    (dailyNotesData || []).forEach((n) => {
      if (!n?.noteDate) return;
      const dateKey = toBaghdadDateString(n.noteDate);
      if (dateFrom && dateKey < dateFrom) return;
      if (dateTo && dateKey > dateTo) return;
      const sign = String(n.type) === "decrease" ? -1 : 1;
      map.set(dateKey, (map.get(dateKey) || 0) + sign * Number(n.amount || 0));
    });
    return map;
  }, [dailyNotesData, dateFrom, dateTo, reportTrigger]);

  const filteredCashboxEntries = useMemo(() => {
    return (cashboxEntriesData || []).filter((entry) => {
      if (!entry?.createdAt) return false;
      const dateKey = toBaghdadDateString(entry.createdAt);
      if (dateFrom && dateKey < dateFrom) return false;
      if (dateTo && dateKey > dateTo) return false;
      return true;
    });
  }, [cashboxEntriesData, dateFrom, dateTo, reportTrigger]);

  const cashboxByDate = useMemo(() => {
    const map = new Map<string, { deposits: number; withdrawals: number; drawerEffect: number }>();
    (filteredCashboxEntries || []).forEach((entry) => {
      const dateKey = toBaghdadDateString(entry.createdAt);
      const row = map.get(dateKey) || { deposits: 0, withdrawals: 0, drawerEffect: 0 };
      const amount = Number(entry.amount || 0);
      if (!(amount > 0)) return;
      if (entry.type === "withdrawal") {
        row.withdrawals += amount;
        row.drawerEffect += amount;
      } else {
        row.deposits += amount;
        row.drawerEffect -= amount;
      }
      map.set(dateKey, row);
    });
    return map;
  }, [filteredCashboxEntries, reportTrigger]);

  const cashboxSummary = useMemo(() => {
    return (filteredCashboxEntries || []).reduce((acc: any, entry: any) => {
      const amount = Number(entry.amount || 0);
      if (!(amount > 0)) return acc;
      if (entry.type === "withdrawal") {
        acc.withdrawals += amount;
        acc.balance -= amount;
        acc.drawerEffect += amount;
      } else {
        acc.deposits += amount;
        acc.balance += amount;
        acc.drawerEffect -= amount;
      }
      return acc;
    }, { deposits: 0, withdrawals: 0, balance: 0, drawerEffect: 0 });
  }, [filteredCashboxEntries, reportTrigger]);

  const cashboxCurrentBalance = useMemo(() => {
    return (cashboxEntriesData || []).reduce((acc: number, entry: any) => {
      const amount = Number(entry.amount || 0);
      if (!(amount > 0)) return acc;
      return entry.type === "withdrawal" ? acc - amount : acc + amount;
    }, 0);
  }, [cashboxEntriesData, reportTrigger]);

  const salesReportData = useMemo(() => {
    const map = new Map<string, any>();
    const getRow = (dateKey: string) => map.get(dateKey) || {
      date: dateKey,
      invoices: 0,
      totalSales: 0,
      cashReceived: 0,
      mastercardSales: 0,
      debtSales: 0,
      debtPayments: 0,
      returns: 0,
      dailyNotes: 0,
      received: 0,
      remaining: 0
    };

    for (const s of filteredSales) {
      const dateKey = toBaghdadDateString(s.createdAt);
      const row = getRow(dateKey);
      const total = Number(s.total || 0);
      const remaining = Number(s.debtRemaining || 0);
      const originalDebt = Number((s as any).debtOriginalAmount || 0);
      const saleInitialReceived = originalDebt > 0 ? Math.max(0, total - originalDebt) : total;
      const cashReceived = s.paymentMethod === "mastercard" ? 0 : saleInitialReceived;
      row.invoices += 1;
      row.totalSales += total;
      row.received += saleInitialReceived;
      row.cashReceived += cashReceived;
      row.remaining += remaining;
      if (s.paymentMethod === 'mastercard') {
        row.mastercardSales += total;
      }
      if (originalDebt > 0) {
        row.debtSales += originalDebt;
      } else if (s.paymentMethod === 'debt') {
        row.debtSales += total;
      }
      map.set(dateKey, row);
    }
    for (const [dateKey, paidSum] of paidDebtsByDate.entries()) {
      const row = getRow(dateKey);
      row.debtPayments += Number(paidSum || 0);
      map.set(dateKey, row);
    }
    for (const [dateKey, retSum] of returnsByDate.entries()) {
      const row = getRow(dateKey);
      row.returns += Number(retSum || 0);
      map.set(dateKey, row);
    }
    for (const [dateKey, dnSum] of dailyNotesByDate.entries()) {
      const row = getRow(dateKey);
      row.dailyNotes += Number(dnSum || 0);
      map.set(dateKey, row);
    }
    for (const [dateKey, cashboxRow] of cashboxByDate.entries()) {
      const row = getRow(dateKey);
      row.cashboxDeposits = Number(cashboxRow.deposits || 0);
      row.cashboxWithdrawals = Number(cashboxRow.withdrawals || 0);
      row.cashboxEffect = Number(cashboxRow.drawerEffect || 0);
      map.set(dateKey, row);
    }
    return Array.from(map.values())
      .map((row: any) => ({
        ...row,
        total: Number(row.cashReceived || 0) + Number(row.debtPayments || 0) + Number(row.dailyNotes || 0) + Number(row.cashboxEffect || 0) - Number(row.returns || 0),
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [filteredSales, paidDebtsByDate, returnsByDate, dailyNotesByDate, cashboxByDate, reportTrigger]);

  const mastercardReport = useMemo(() => {
    if (!filteredSales) return { total: 0, commission: 0, count: 0 };
    return filteredSales.reduce(
      (acc, sale) => {
        if (sale.paymentMethod === 'mastercard') {
          acc.total += sale.total; // الإجمالي بعد الخصم
          acc.commission += sale.commission;
          acc.count += 1;
        }
        return acc;
      }, { total: 0, commission: 0, count: 0 });
  }, [filteredSales, reportTrigger]);

  const receivedReport = useMemo(() => {
    return (filteredSales || []).reduce(
      (acc, sale) => {
        const total = Number(sale.total || 0);
        const originalDebt = Number((sale as any).debtOriginalAmount || 0);
        const remaining = Number(sale.debtRemaining || 0);
        const received = originalDebt > 0 ? Math.max(0, total - originalDebt) : total;
        acc.received += received;
        acc.remaining += remaining;
        return acc;
      },
      { received: 0, remaining: 0 }
    );
  }, [filteredSales, reportTrigger]);

  const topSellingProducts = useMemo(() => {
    const agg = new Map();
    for (const s of filteredSales) {
      const items = s.items || [];
      for (const it of items) {
        const pid = String(it.productId || it.product?.id || it.productId);
        const existing = agg.get(pid) || { productId: pid, quantity: 0, revenue: 0 };
        existing.quantity += Number(it.quantity || 0);
        existing.revenue += Number(it.price || 0) * Number(it.quantity || 0);
        agg.set(pid, existing);
      }
    }
    return Array.from(agg.values())
      .map((a: any) => {
        const p = productsData.find((x: any) => String(x.id) === String(a.productId));
        return { productId: a.productId, name: p ? p.name : `#${a.productId}`, quantity: a.quantity, revenue: a.revenue };
      })
      .sort((a: any, b: any) => b.quantity - a.quantity)
      .slice(0, 20);
  }, [filteredSales, productsData, reportTrigger]);

  const filteredPurchaseInvoices = useMemo(() => {
    return (purchaseInvoicesData || []).filter((invoice: any) => {
      const rawDate = invoice?.date || invoice?.timestamp || invoice?.createdAt;
      if (!rawDate) return false;
      const dateKey = toBaghdadDateString(rawDate);
      if (dateFrom && dateKey < dateFrom) return false;
      if (dateTo && dateKey > dateTo) return false;
      return true;
    });
  }, [purchaseInvoicesData, dateFrom, dateTo, reportTrigger]);

  const purchaseReportData = useMemo(() => {
    const map = new Map<string, any>();
    for (const invoice of filteredPurchaseInvoices) {
      const dateKey = toBaghdadDateString(invoice.date || invoice.timestamp || invoice.createdAt);
      const row = map.get(dateKey) || { date: dateKey, invoices: 0, items: 0, total: 0 };
      const items = invoice.items || [];
      row.invoices += 1;
      row.items += Number(invoice.itemsCount ?? items.length ?? 0);
      row.total += Number(invoice.totalAmount || 0);
      map.set(dateKey, row);
    }
    return Array.from(map.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [filteredPurchaseInvoices, reportTrigger]);

  const purchasedItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; cost: number }>();
    for (const invoice of filteredPurchaseInvoices) {
      for (const item of invoice.items || []) {
        const productId = item.productId !== undefined && item.productId !== null ? String(item.productId) : "";
        const key = productId || normalizeLookupText(item.productName || item.name);
        if (!key) continue;
        const product = productId ? productsData.find((p: any) => String(p.id) === productId) : null;
        const name = product?.name || item.productName || item.name || `#${productId}`;
        const quantity = Number(item.quantity || 0);
        const cost = Number(item.cost || 0) * quantity;
        const current = map.get(key) || { name, quantity: 0, cost: 0 };
        current.quantity += quantity;
        current.cost += cost;
        map.set(key, current);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost).slice(0, 100);
  }, [filteredPurchaseInvoices, productsData, reportTrigger]);

  const purchaseCostStatsMap = useMemo(() => {
    const productsById = new Map((productsData || []).map((product: any) => [String(product.id), product]));
    const productsByName = new Map(
      (productsData || []).map((product: any) => [normalizeLookupText(product.name), product])
    );
    const statsMap = new Map<string, { totalUnits: number; totalCost: number }>();

    (purchaseInvoicesData || []).forEach((invoice: any) => {
      (invoice?.items || []).forEach((item: any) => {
        const quantity = Number(item?.quantity ?? item?.qty ?? item?.count ?? 0);
        if (!(quantity > 0)) return;

        let product = null;
        if (item?.productId !== undefined && item?.productId !== null && item?.productId !== "") {
          product = productsById.get(String(item.productId)) || null;
        }
        if (!product) {
          const lookupName = normalizeLookupText(item?.name ?? item?.productName ?? item?.product?.name);
          if (lookupName) product = productsByName.get(lookupName) || null;
        }
        if (!product) return;

        const unitsPerBox = resolveUnitsPerBox(item?.unitsPerBox, product?.unitsPerBox, 1);
        const boxCost = Number(item?.cost ?? item?.purchasePrice ?? item?.price ?? item?.newCost ?? 0);
        if (!(boxCost > 0)) return;

        const unitCost = boxCost / unitsPerBox;
        const key = String(product.id);
        const current = statsMap.get(key) || { totalUnits: 0, totalCost: 0 };
        current.totalUnits += quantity;
        current.totalCost += unitCost * quantity;
        statsMap.set(key, current);
      });
    });

    return statsMap;
  }, [productsData, purchaseInvoicesData, reportTrigger]);

  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    (productsData || []).forEach((p: any) => {
      const unitCost = resolveCapitalUnitCost(p, purchaseCostStatsMap.get(String(p.id)));
      map.set(String(p.id), unitCost);
    });
    return map;
  }, [productsData, purchaseCostStatsMap, reportTrigger]);

  const soldItems = useMemo(() => {
    return topSellingProducts.map((p: any) => {
      const prod = productsData.find((x: any) => x.name === p.name || String(x.id) === String(p.productId));
      const remaining = prod ? Math.max(0, (prod.stock || 0) - (p.quantity || 0)) : 0;
      return { name: p.name, quantity: p.quantity, remaining };
    });
  }, [topSellingProducts, productsData, reportTrigger]);

  const profitReportData = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; cost: number }>();
    for (const s of filteredSales) {
      const dateKey = toBaghdadDateString(s.createdAt);
      const row = map.get(dateKey) || { date: dateKey, revenue: 0, cost: 0 };
      const items = s.items || [];
      const saleDiscount = Number((s as any).discount || 0);
      for (const it of items) {
        const qty = Number(it.quantity || 0);
        const price = Number(it.price || 0);
        const pid = String(it.productId || it.product?.id || "");
        const unitCost = productCostMap.get(pid) || 0;
        row.revenue += qty * price;
        row.cost += qty * unitCost;
      }
      row.revenue = Math.max(0, row.revenue - saleDiscount);
      map.set(dateKey, row);
    }
    for (const r of returnsData || []) {
      if (!r?.createdAt) continue;
      const dateKey = toBaghdadDateString(r.createdAt);
      if (dateFrom && dateKey < dateFrom) continue;
      if (dateTo && dateKey > dateTo) continue;
      const row = map.get(dateKey) || { date: dateKey, revenue: 0, cost: 0 };
      for (const it of r.items || []) {
        const qty = Number(it.quantity || 0);
        const price = Number(it.price || 0);
        const pid = String(it.productId || it.product?.id || "");
        const unitCost = productCostMap.get(pid) || 0;
        row.revenue -= qty * price;
        row.cost -= qty * unitCost;
      }
      map.set(dateKey, row);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, profit: r.revenue - r.cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSales, returnsData, productCostMap, dateFrom, dateTo, reportTrigger]);

  const topDebtors = useMemo(() => {
    const map = new Map<string, number>();
    (debtsData || []).forEach((d: any) => {
      const clientName = d.client?.name || d.clientName || "زبون غير مسجل";
      const total = Number(d.amount || 0);
      const paid = (d.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const remaining = total - paid;
      if (remaining > 1) { // تصفية المبالغ الصغيرة جداً
        map.set(clientName, (map.get(clientName) || 0) + remaining);
      }
    });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 50);
  }, [debtsData, reportTrigger]);

  const inventoryReportData = useMemo(() => {
    let totalCapital = 0;
    let totalSalesValue = 0;
    let totalItems = 0;

    const details = productsData.map((p: any) => {
      const stock = Number(p.stock || 0);
      // تعديل: إظهار المنتجات ذات المخزون السالب لتنبيه المستخدم، مع تجاهل المنتجات ذات المخزون الصفري
      if (stock === 0) return null;

      const units = resolveUnitsPerBox(p.unitsPerBox, 1);
      const unitCost = resolveCapitalUnitCost(p, purchaseCostStatsMap.get(String(p.id)));
      const unitPrice = Number(p.price || 0);

      const itemCapital = stock * unitCost;
      const itemSaleValue = stock * unitPrice;

      // تحسين: جمع القيم الموجبة فقط للإجماليات لتعكس قيمة البضاعة الموجودة فعلياً (الأصول)
      // المخزون السالب يعتبر خطأ جردي ولا يجب أن ينقص من قيمة رأس المال الموجود
      if (stock > 0) {
        totalCapital += itemCapital;
        totalSalesValue += itemSaleValue;
        totalItems += stock;
      }

      return {
        id: p.id,
        name: p.name,
        stock,
        unitsPerBox: units,
        unitCost,
        unitPrice,
        totalCapital: itemCapital,
        totalSaleValue: itemSaleValue,
        profit: itemSaleValue - itemCapital
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      totalCapital,
      totalSalesValue,
      totalProfit: totalSalesValue - totalCapital,
      totalItems,
      details
    };
  }, [productsData, purchaseCostStatsMap, reportTrigger]);

  const shortageCategoryOptions = useMemo(() => {
    const fromProducts = (productsData || [])
      .filter((p: any) => p?.categoryName || p?.categoryId)
      .map((p: any) => ({
        id: p.categoryId !== undefined && p.categoryId !== null ? String(p.categoryId) : "",
        name: String(p.categoryName || "غير مصنف"),
      }));

    const fromCategories = (categoriesData || []).map((c: any) => ({
      id: String(c?.id ?? ""),
      name: String(c?.name || ""),
    }));

    const merged = [...fromCategories, ...fromProducts]
      .filter((c) => c.id && c.name)
      .reduce((acc: Map<string, string>, cur) => {
        if (!acc.has(cur.id)) acc.set(cur.id, cur.name);
        return acc;
      }, new Map<string, string>());

    return Array.from(merged.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [productsData, categoriesData, reportTrigger]);

  const selectedShortageCategoryName = useMemo(() => {
    if (shortageCategoryFilter === "all") return "كل الفئات";
    return shortageCategoryOptions.find((c) => c.id === shortageCategoryFilter)?.name || "فئة محددة";
  }, [shortageCategoryFilter, shortageCategoryOptions]);

  // --- خوارزمية حساب النواقص الذكية ---
  const shortageReportData = useMemo(() => {
    // 1. تحديد فترة التحليل (إذا لم يحدد المستخدم تاريخ، نأخذ آخر 30 يوم افتراضياً لتحليل السحب)
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(new Date().setDate(endDate.getDate() - 30));
    const selectedCategoryId = shortageCategoryFilter === "all" ? null : String(shortageCategoryFilter);
    
    // حساب عدد أيام فترة التحليل بدقة
    const timeDiff = Math.abs(endDate.getTime() - startDate.getTime());
    const analysisDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) || 1;

    // 2. حساب مجموع المبيعات لكل منتج خلال فترة التحليل
    const salesMap = new Map<string, number>();
    
    // نستخدم salesData الخام بدلاً من filteredSales لنضمن أننا نحلل الفترة المحددة بدقة
    salesData.forEach((sale) => {
      const saleDate = new Date(sale.createdAt);
      if (saleDate >= startDate && saleDate <= endDate) {
        (sale.items || []).forEach((item: any) => {
          const pid = String(item.productId || item.product?.id || "");
          salesMap.set(pid, (salesMap.get(pid) || 0) + Number(item.quantity || 0));
        });
      }
    });

    // 3. حساب الاحتياج
    const report = productsData.map((p: any) => {
      // استبعاد المنتجات ذات المخزون السالب من تقرير النواقص
      if ((p.stock || 0) < 0) return null;
      const productCategoryId =
        p.categoryId !== undefined && p.categoryId !== null && p.categoryId !== ""
          ? String(p.categoryId)
          : "";
      if (selectedCategoryId !== null && productCategoryId !== selectedCategoryId) return null;

      const soldQty = salesMap.get(String(p.id)) || 0;
      const avgDailySales = soldQty / analysisDays; // معدل السحب اليومي
      
      // الكمية المطلوبة لتغطية الفترة القادمة (coverageDays)
      const requiredStock = avgDailySales * coverageDays;
      
      // الكمية التي يجب شراؤها = المطلوب - الموجود حالياً
      const toBuyQty = requiredStock - (p.stock || 0);

      if (toBuyQty <= 0) return null; // لا نحتاج شراء هذا المنتج

      const unitsPerBox = Number(p.unitsPerBox || 1);
      const boxesToBuy = Math.ceil(toBuyQty / unitsPerBox);

      return {
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.categoryName || "غير مصنف",
        currentStock: p.stock,
        avgDailySales: avgDailySales.toFixed(2),
        soldInPeriod: soldQty,
        unitsPerBox,
        toBuyQty: Math.ceil(toBuyQty), // تقريب للأعلى
        boxesToBuy,
        costEstimate: boxesToBuy * (p.boxPurchasePrice || 0)
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    // ترتيب حسب الأكثر احتياجاً (عدد الكراتين)
    return report.sort((a, b) => b.boxesToBuy - a.boxesToBuy);

  }, [salesData, productsData, dateFrom, dateTo, coverageDays, shortageCategoryFilter, reportTrigger]);

  const shortageSummary = useMemo(() => {
    return shortageReportData.reduce(
      (acc, item: any) => {
        acc.itemsCount += 1;
        acc.totalUnits += Number(item.toBuyQty || 0);
        acc.totalBoxes += Number(item.boxesToBuy || 0);
        acc.totalCost += Number(item.costEstimate || 0);
        return acc;
      },
      { itemsCount: 0, totalUnits: 0, totalBoxes: 0, totalCost: 0 }
    );
  }, [shortageReportData]);

  const handleSendShortagesToProducts = () => {
    if (!shortageReportData.length) {
      toast({
        title: "لا توجد نواقص",
        description: "لا توجد عناصر لنقلها إلى صفحة المنتجات حالياً.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      createdAt: new Date().toISOString(),
      coverageDays,
      categoryId: shortageCategoryFilter === "all" ? null : shortageCategoryFilter,
      categoryName: selectedShortageCategoryName,
      items: shortageReportData.map((item: any) => ({
        id: item.id,
        name: item.name,
        toBuyQty: Number(item.toBuyQty || 0),
        boxesToBuy: Number(item.boxesToBuy || 0),
      })),
    };

    localStorage.setItem("smartShortageDraft", JSON.stringify(payload));
    navigate("/products?smartShortages=1");
    toast({
      title: "تم نقل القائمة",
      description: `تم تجهيز ${shortageReportData.length} صنف لصفحة المنتجات.`,
    });
  };


  const handleExportCSV = () => {
    let content = "";
    let filename = `report-${selectedReport}-${new Date().toISOString().slice(0,10)}.csv`;
    const bom = "\uFEFF"; // UTF-8 BOM for Excel support

    if (selectedReport === "sales") {
        content = "التاريخ,عدد الفواتير,الواصل,الباقي,مبيعات البطاقة,المبيعات النقدية,تحصيل ديون,مرتجعات,ملاحظات,الصافي\n";
        content += salesReportData.map((r: any) =>
            `${r.date},${r.invoices},${r.received},${r.remaining},${r.mastercardSales},${r.cashReceived},${r.debtPayments},${r.returns},${r.dailyNotes},${r.total}`
        ).join("\n");
    } else if (selectedReport === "profits") {
        content = "التاريخ,الإيراد,التكلفة,الربح\n";
        content += profitReportData.map((r: any) => 
            `${r.date},${r.revenue},${r.cost},${r.profit}`
        ).join("\n");
    } else if (selectedReport === "top-selling") {
        content = "الصنف,الكمية المباعة,الإيراد\n";
        content += topSellingProducts.map((r: any) => 
            `${r.name},${r.quantity},${r.revenue}`
        ).join("\n");
    } else if (selectedReport === "top-debtors") {
        content = "العميل,المبلغ المتبقي\n";
        content += topDebtors.map((r: any) => 
            `${r.name},${r.amount}`
        ).join("\n");
    } else if (selectedReport === "inventory-value") {
        content = "المنتج,الكمية,تكلفة الوحدة,سعر البيع,رأس المال,قيمة المحل (بيع),الربح المتوقع\n";
        content += inventoryReportData.details.map((r: any) => 
            `${r.name},${r.stock},${r.unitCost},${r.unitPrice},${r.totalCapital},${r.totalSaleValue},${r.profit}`
        ).join("\n");
        content += `\nالإجمالي,${inventoryReportData.totalItems},,,${inventoryReportData.totalCapital},${inventoryReportData.totalSalesValue},${inventoryReportData.totalProfit}`;
    } else if (selectedReport === "shortages") {
        content = "المنتج,المخزون الحالي,معدل السحب اليومي,الكراتين المطلوبة,القطع المطلوبة,التكلفة التقديرية\n";
        content += shortageReportData.map((r: any) => 
            `${r.name},${r.currentStock},${r.avgDailySales},${r.boxesToBuy},${r.toBuyQty},${r.costEstimate}`
        ).join("\n");
    }

    if (!content) return;

    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const handleExportInventoryPdf = async () => {
    if (selectedReport !== "inventory-value") {
      toast({ title: "تنبيه", description: "يرجى اختيار تقرير قيمة المخزون أولاً." });
      return;
    }

    const escapeHtml = (value: any) =>
      String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
      }[char] as string));

    const formatNumber = (value: any) => {
      const n = Number(value || 0);
      if (Number.isNaN(n)) return "0";
      return n.toLocaleString("ar-IQ");
    };

    try {
      const storeName = await window.api.getAppSetting("storeName");
      const generatedAt = new Date().toLocaleString("ar-IQ");
      const rows = inventoryReportData.details.map((item: any, index: number) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${formatNumber(item.stock)}</td>
          <td>${formatNumber(item.unitsPerBox)}</td>
          <td>${formatNumber(item.unitCost)}</td>
          <td>${formatNumber(item.unitPrice)}</td>
          <td>${formatNumber(item.totalCapital)}</td>
          <td>${formatNumber(item.totalSaleValue)}</td>
          <td>${formatNumber(item.profit)}</td>
        </tr>
      `).join("");

      const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير رأس المال</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
    th { background: #f8fafc; font-weight: 700; }
    tfoot td { background: #f1f5f9; font-weight: 700; }
    thead { display: table-header-group; }
    @page { size: A4; margin: 12mm; }
  </style>
</head>
<body>
  <h1>تقرير رأس المال (المخزون)</h1>
  <div class="meta">المركز: ${escapeHtml(storeName || "المركز")} | التاريخ: ${escapeHtml(generatedAt)}</div>
  <div class="meta">\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0627\u062d\u062a\u0633\u0627\u0628: \u0645\u062a\u0648\u0633\u0637 \u062a\u0643\u0644\u0641\u0629 \u0627\u0644\u0634\u0631\u0627\u0621 \u0627\u0644\u0641\u0639\u0644\u064a \u0639\u0646\u062f \u062a\u0648\u0641\u0631 \u0641\u0648\u0627\u062a\u064a\u0631 \u0634\u0631\u0627\u0621\u060c \u0648\u0625\u0644\u0627 \u0622\u062e\u0631 \u062a\u0643\u0644\u0641\u0629 \u0634\u0631\u0627\u0621 \u0645\u062d\u0641\u0648\u0638\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0646\u062a\u062c.</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>المنتج</th>
        <th>الكمية</th>
        <th>وحدة/كرتون</th>
        <th>تكلفة الوحدة</th>
        <th>سعر البيع</th>
        <th>رأس المال</th>
        <th>قيمة البيع</th>
        <th>الربح</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="9">لا توجد بيانات</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">الإجمالي</td>
        <td>${formatNumber(inventoryReportData.totalItems)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${formatNumber(inventoryReportData.totalCapital)}</td>
        <td>${formatNumber(inventoryReportData.totalSalesValue)}</td>
        <td>${formatNumber(inventoryReportData.totalProfit)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

      const fileName = `capital-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      const res = await window.api.exportReportPdf({ html, fileName });
      if (res?.ok) {
        toast({ title: "تم التصدير", description: "تم حفظ التقرير بصيغة PDF." });
      } else if (!res?.canceled) {
        toast({ title: "فشل التصدير", description: res?.error || "تعذر إنشاء ملف PDF.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل التصدير", description: e?.message || "تعذر إنشاء ملف PDF.", variant: "destructive" });
    }
  };

  const handlePrintShortages = async () => {
    const isRamadan = localStorage.getItem("ramadanMode") === "true";
    try {
      await window.api.printThermalReceipt({
        type: 'inventory', // نستخدم قالب الجرد لأنه مناسب للقوائم
        title: `قائمة النواقص (تكفي ${coverageDays} يوم)`,
        items: shortageReportData.map((item: any) => ({
          name: item.name,
          qty: item.boxesToBuy, // نعرض عدد الكراتين في خانة الكمية
          price: item.toBuyQty // نعرض عدد القطع في خانة السعر (كحقل إضافي)
        })),
        totalStock: shortageReportData.reduce((acc: number, item: any) => acc + item.boxesToBuy, 0), // إجمالي الكراتين
        totalValue: shortageReportData.reduce((acc: number, item: any) => acc + item.costEstimate, 0), // التكلفة التقديرية
        footer: isRamadan ? "🌙 رمضان كريم 🌙" : undefined,
        qr: "https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL"
      });
    } catch (e) {
      console.error(e);
    }
  };

  const renderReportContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-blue-600">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <p className="text-lg font-medium">جاري حساب التقارير...</p>
        </div>
      );
    }

    switch (selectedReport) {
      case "sales":
        return (
          <div className="space-y-6">
            <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <TrendingUp className="w-5 h-5" />
                  المبيعات اليومية
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className={`mb-6 grid grid-cols-1 gap-4 ${currentUser?.role === "admin" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">مبيعات البطاقة</CardTitle>
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(mastercardReport.total)} د.ع</div>
                      <p className="text-xs text-muted-foreground">من {mastercardReport.count} فاتورة</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">إجمالي الواصل</CardTitle>
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-emerald-700">{formatCurrency(receivedReport.received)} د.ع</div>
                      <p className="text-xs text-muted-foreground">حسب الفترة المختارة</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">إجمالي الباقي</CardTitle>
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{formatCurrency(receivedReport.remaining)} د.ع</div>
                      <p className="text-xs text-muted-foreground">ديون متبقية</p>
                    </CardContent>
                  </Card>
                  {currentUser?.role === "admin" && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">رصيد قاصة المركز</CardTitle>
                        <Wallet className="w-4 h-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-amber-700">{formatCurrency(cashboxCurrentBalance)} د.ع</div>
                        <p className="text-xs text-muted-foreground">الأثر على الصندوق خلال الفترة: {formatCurrency(cashboxSummary.drawerEffect)} د.ع</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">عدد الفواتير</TableHead>
                          <TableHead className="text-right">الواصل</TableHead>
                          <TableHead className="text-right">الباقي</TableHead>
                          <TableHead className="text-right">مبيعات البطاقة</TableHead>
                          <TableHead className="text-right">نقد البيع</TableHead>
                          <TableHead className="text-right">تحصيل ديون</TableHead>
                          <TableHead className="text-right">مرتجعات</TableHead>
                          <TableHead className="text-right">القاصة</TableHead>
                          <TableHead className="text-right">الصافي النقدي (في الصندوق)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesReportData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.date}</TableCell>
                            <TableCell>{item.invoices}</TableCell>
                            <TableCell className="text-emerald-600">{item.received > 0 ? `${formatCurrency(item.received)} د.ع` : "-"}</TableCell>
                            <TableCell className="text-red-600">{item.remaining > 0 ? `${formatCurrency(item.remaining)} د.ع` : "-"}</TableCell>
                            <TableCell className="text-green-600">{item.mastercardSales > 0 ? `${formatCurrency(item.mastercardSales)} د.ع` : "-"}</TableCell>
                            <TableCell className="text-emerald-700">{item.cashReceived > 0 ? `${formatCurrency(item.cashReceived)} د.ع` : "-"}</TableCell>
                            <TableCell className="text-blue-600">{item.debtPayments > 0 ? `${formatCurrency(item.debtPayments)} د.ع` : "-"}</TableCell>
                            <TableCell className="text-red-600">{item.returns > 0 ? `${formatCurrency(item.returns)} د.ع` : "-"}</TableCell>
                            <TableCell className={Number(item.cashboxEffect || 0) < 0 ? "text-red-600" : "text-emerald-600"}>
                              {Number(item.cashboxEffect || 0) !== 0 ? `${formatCurrency(item.cashboxEffect)} د.ع` : "-"}
                            </TableCell>
                            <TableCell className="font-semibold text-blue-600">
                              {formatCurrency(item.total)} د.ع
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={salesReportData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} د.ع`, "الإجمالي"]} />
                        <Bar dataKey="total" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "purchases":
        return (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <ShoppingCart className="w-5 h-5" />
                المشتريات اليومية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">عدد الفواتير</TableHead>
                    <TableHead className="text-right">عدد الأصناف</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseReportData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.date}</TableCell>
                      <TableCell>{item.invoices}</TableCell>
                      <TableCell>{item.items}</TableCell>
                      <TableCell className="font-semibold text-green-600">{formatCurrency(item.total)} د.ع</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );

      case "profits":
        return (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <DollarSign className="w-5 h-5" />
                الأرباح (يومي)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitReportData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} د.ع`]} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="الإيراد" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" name="الربح الصافي" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإيراد</TableHead>
                    <TableHead className="text-right">التكلفة</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profitReportData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.date}</TableCell>
                      <TableCell className="text-blue-600">{formatCurrency(item.revenue)} د.ع</TableCell>
                      <TableCell className="text-red-600">{formatCurrency(item.cost)} د.ع</TableCell>
                      <TableCell className="font-semibold text-green-600">{formatCurrency(item.profit)} د.ع</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );

      case "top-selling":
        return (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <TrendingUp className="w-5 h-5" />
                أكثر الأصناف مبيعاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">الكمية المباعة</TableHead>
                    <TableHead className="text-right">الإيراد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSellingProducts.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell className="font-semibold text-blue-600">
                        {formatCurrency(item.revenue)} د.ع
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );

      case "purchased-items":
        return (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Package className="w-5 h-5" />
                الأصناف المشتراة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">التكلفة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchasedItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell className="font-semibold text-green-600">{formatCurrency(item.cost)} د.ع</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );

      case "sold-items":
        return (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Package className="w-5 h-5" />
                الأصناف المباعة (مع المتبقي)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">الكمية المباعة</TableHead>
                    <TableHead className="text-right">المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soldItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-blue-600">{item.quantity}</TableCell>
                      <TableCell className="font-semibold text-orange-600">{item.remaining}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );

      case "top-debtors":
        return (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Users className="w-5 h-5" />
                أعلى المدينين (الديون المتبقية)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">المبلغ المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDebtors.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="font-bold text-red-600">
                        {formatCurrency(item.amount)} د.ع
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );

      case "inventory-value":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-blue-50 border-blue-100">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-blue-100 rounded-full mb-3"><DollarSign className="w-6 h-6 text-blue-600" /></div>
                  <div className="text-sm text-blue-600 font-medium">رأس المال (التكلفة)</div>
                  <div className="text-2xl font-bold text-blue-800 mt-1">{formatCurrency(inventoryReportData.totalCapital)} د.ع</div>
                  <div className="text-xs text-blue-400 mt-2">قيمة شراء البضاعة الموجودة</div>
                </CardContent>
              </Card>

              <Card className="bg-emerald-50 border-emerald-100">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-emerald-100 rounded-full mb-3"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
                  <div className="text-sm text-emerald-600 font-medium">الربح المتوقع</div>
                  <div className="text-2xl font-bold text-emerald-800 mt-1">{formatCurrency(inventoryReportData.totalProfit)} د.ع</div>
                  <div className="text-xs text-emerald-500 mt-2">عند بيع كامل الكمية</div>
                </CardContent>
              </Card>

              <Card className="bg-purple-50 border-purple-100">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-purple-100 rounded-full mb-3"><Package className="w-6 h-6 text-purple-600" /></div>
                  <div className="text-sm text-purple-600 font-medium">قيمة المحل (سعر البيع)</div>
                  <div className="text-2xl font-bold text-purple-800 mt-1">{formatCurrency(inventoryReportData.totalSalesValue)} د.ع</div>
                  <div className="text-xs text-purple-400 mt-2">عدد الأصناف: {inventoryReportData.details.length}</div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
              طريقة الاحتساب: يتم اعتماد متوسط تكلفة الشراء الفعلي من فواتير الشراء عند توفرها، وإلا يتم استخدام آخر تكلفة شراء محفوظة على المنتج.
            </div>

            <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Package className="w-5 h-5" />
                  تفاصيل قيمة المخزون
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المنتج</TableHead>
                      <TableHead className="text-center">الكمية</TableHead>
                      <TableHead className="text-center">تكلفة الوحدة</TableHead>
                      <TableHead className="text-center">سعر البيع</TableHead>
                      <TableHead className="text-center">رأس المال</TableHead>
                      <TableHead className="text-center">قيمة المحل (بيع)</TableHead>
                      <TableHead className="text-center">الربح المتوقع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryReportData.details.map((item: any) => (
                      <TableRow key={item.id} className={item.stock < 0 ? "bg-red-100 hover:bg-red-200/50" : ""}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className={`text-center font-bold ${item.stock < 0 ? "text-red-600" : ""}`}>
                          {item.stock}
                        </TableCell>
                        <TableCell className="text-center text-slate-500">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-center text-slate-500">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className={`text-center font-bold ${item.totalCapital < 0 ? "text-red-600" : "text-blue-600"}`}>{formatCurrency(item.totalCapital)}</TableCell>
                        <TableCell className="text-center font-bold text-purple-600">{formatCurrency(item.totalSaleValue)}</TableCell>
                        <TableCell className={`text-center font-bold ${item.profit < 0 ? "text-red-600" : "text-emerald-600"}`}>{formatCurrency(item.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case "shortages":
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col md:flex-row gap-4 items-end justify-between">
              <div className="space-y-2 w-full md:w-auto">
                <Label className="text-blue-800">كم يوم تريد أن تكفيك البضاعة؟ (فترة التغطية)</Label>
                <Input 
                  type="number" 
                  value={coverageDays} 
                  onChange={(e) => setCoverageDays(Number(e.target.value))}
                  className="bg-white w-32 font-bold text-center"
                  min={1}
                />
              </div>
              <div className="space-y-2 w-full md:w-56">
                <Label className="text-blue-800">فلترة حسب الفئة</Label>
                <Select value={shortageCategoryFilter} onValueChange={setShortageCategoryFilter}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="كل الفئات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفئات</SelectItem>
                    {shortageCategoryOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-slate-500">
                * يتم حساب الاحتياج بناءً على معدل السحب في الفترة المحددة في الفلتر أعلاه (أو آخر 30 يوم).
              </div>
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <Button onClick={handleSendShortagesToProducts} className="bg-blue-600 hover:bg-blue-700 text-white gap-2" disabled={shortageReportData.length === 0}>
                  <ShoppingCart className="w-4 h-4" /> نقل إلى صفحة المنتجات
                </Button>
                <Button onClick={handlePrintShortages} className="bg-slate-800 text-white gap-2">
                  <FileText className="w-4 h-4" /> طباعة قائمة الشراء
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card className="border-blue-100 bg-blue-50">
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-blue-700">عدد الأصناف الناقصة</div>
                  <div className="text-2xl font-bold text-blue-900">{shortageSummary.itemsCount}</div>
                </CardContent>
              </Card>
              <Card className="border-amber-100 bg-amber-50">
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-amber-700">الكراتين المطلوبة</div>
                  <div className="text-2xl font-bold text-amber-900">{shortageSummary.totalBoxes}</div>
                </CardContent>
              </Card>
              <Card className="border-purple-100 bg-purple-50">
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-purple-700">القطع المطلوبة</div>
                  <div className="text-2xl font-bold text-purple-900">{shortageSummary.totalUnits}</div>
                </CardContent>
              </Card>
              <Card className="border-emerald-100 bg-emerald-50">
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-emerald-700">تقدير تكلفة الشراء</div>
                  <div className="text-xl font-bold text-emerald-900">{formatCurrency(shortageSummary.totalCost)} د.ع</div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <ShoppingCart className="w-5 h-5" />
                  قائمة الشراء المقترحة (النواقص)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المنتج</TableHead>
                      <TableHead className="text-right">الفئة</TableHead>
                      <TableHead className="text-center">المخزون الحالي</TableHead>
                      <TableHead className="text-center">معدل السحب اليومي</TableHead>
                      <TableHead className="text-center bg-blue-50 text-blue-800 font-bold">الكراتين المطلوبة</TableHead>
                      <TableHead className="text-center">القطع المطلوبة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shortageReportData.map((item: any) => (
                      <TableRow 
                        key={item.id}
                        className={item.currentStock < 0 ? "bg-red-100 hover:bg-red-200/50" : ""}
                      >
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.categoryName || "غير مصنف"}</TableCell>
                        <TableCell className={`text-center font-bold ${item.currentStock < 0 ? "text-red-600" : "text-slate-500"}`}>
                          {item.currentStock}
                        </TableCell>
                        <TableCell className="text-center text-slate-500">{item.avgDailySales}</TableCell>
                        <TableCell className={`text-center font-black text-lg ${item.currentStock < 0 ? "bg-red-200 text-red-700" : "bg-blue-50 text-blue-600"}`}>{item.boxesToBuy}</TableCell>
                        <TableCell className="text-center font-bold">{item.toBuyQty}</TableCell>
                      </TableRow>
                    ))}
                    {shortageReportData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                          ممتاز! لا توجد نواقص ضمن ({selectedShortageCategoryName}) لفترة {coverageDays} يوم.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  const generateReport = () => {
    // هذا السطر يجبر جلب البيانات من جديد
    setReportTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-blue-800">التقارير والمؤشرات</h2>
      </div>

      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <FileText className="w-6 h-6" />
            إعدادات التقرير
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>نوع التقرير</Label>
              <Select value={selectedReport} onValueChange={setSelectedReport}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">المبيعات اليومية</SelectItem>
                  <SelectItem value="purchases">المشتريات</SelectItem>
                  {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
                    <SelectItem value="profits">الأرباح</SelectItem>
                  )}
                  {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
                    <SelectItem value="inventory-value">قيمة المخزون (رأس المال)</SelectItem>
                  )}
                  <SelectItem value="shortages">النواقص (قائمة الشراء الذكية)</SelectItem>
                  <SelectItem value="top-selling">الأكثر مبيعاً</SelectItem>
                  <SelectItem value="purchased-items">الأصناف المشتراة</SelectItem>
                  <SelectItem value="sold-items">الأصناف المباعة</SelectItem>
                  <SelectItem value="top-debtors">أعلى المدينين</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="invisible">تطبيق</Label>
              <Button onClick={generateReport} className="w-full bg-gradient-to-r from-blue-500 to-purple-500">
                <Calendar className="w-4 h-4 ml-2" />
                تحديث التقرير
              </Button>
              <Button onClick={handleExportCSV} variant="outline" className="w-full mt-2 border-green-200 text-green-700 hover:bg-green-50">
                <Download className="w-4 h-4 ml-2" />
                تصدير Excel
              </Button>
              <Button
                onClick={handleExportInventoryPdf}
                variant="outline"
                className="w-full mt-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                disabled={selectedReport !== "inventory-value"}
              >
                <FileText className="w-4 h-4 ml-2" />
                تصدير PDF (رأس المال)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {renderReportContent()}
    </div>
  );
};

export default ReportsSection;
