import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Calendar, DollarSign, FileText, Package, ShoppingCart, TrendingUp, CreditCard, Download, Users, Loader2 } from "lucide-react";

// دالة لتحويل التاريخ إلى توقيت بغداد (UTC+3) والحصول على التاريخ بصيغة YYYY-MM-DD
const toBaghdadDateString = (dateInput: string | Date): string => {
  const date = new Date(dateInput);
  // تعديل: اليوم الجديد يبدأ الساعة 1 صباحاً بتوقيت العراق (UTC+3)
  // لذا نضيف 2 ساعة فقط لـ UTC بدلاً من 3، بحيث تظل الفترة من 00:00 إلى 01:00 محسوبة على اليوم السابق
  date.setUTCHours(date.getUTCHours() + 2);
  return date.toISOString().slice(0, 10);
};

const ReportsSection = ({ currentUser }: { currentUser?: any }) => {
  const [selectedReport, setSelectedReport] = useState("sales");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportTrigger, setReportTrigger] = useState(0);
  const [coverageDays, setCoverageDays] = useState(15); // عدد الأيام المراد تغطيتها بالشراء

  const [salesData, setSalesData] = useState<any[]>([]);
  const [productsData, setProductsData] = useState<any[]>([]);
  const [debtsData, setDebtsData] = useState<any[]>([]);
  const [returnsData, setReturnsData] = useState<any[]>([]);
  const [dailyNotesData, setDailyNotesData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sales, products, debts, returns, dailyNotes] = await Promise.all([
        window.api.listSales({ limit: 100000 }), // جلب كافة الفواتير للتقارير لضمان دقة الحسابات
        window.api.listProducts(),
        typeof window.api.listDebts === 'function' ? window.api.listDebts({ limit: 100000 }) : Promise.resolve([]),
        window.api.listReturns ? window.api.listReturns({ limit: 100000 }) : Promise.resolve([]),
        window.api.listDailyNotes ? window.api.listDailyNotes({ limit: 100000 }) : Promise.resolve([]),
      ]);

      const normalizedSales = (sales || []).map((s) => ({
        ...s,
        createdAt: s.createdAt ? String(s.createdAt) : new Date().toISOString(),
      }));
      setSalesData(normalizedSales);
      setProductsData(products || []);
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

  const salesReportData = useMemo(() => {
    const map = new Map<string, any>();
    const getRow = (dateKey: string) => map.get(dateKey) || {
      date: dateKey,
      invoices: 0,
      totalSales: 0,
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
      const received = s.amountReceived !== undefined && s.amountReceived !== null
        ? Number(s.amountReceived)
        : Math.max(0, total - remaining);
      row.invoices += 1;
      row.totalSales += total;
      row.received += received;
      row.remaining += remaining;
      if (s.paymentMethod === 'mastercard') {
        row.mastercardSales += total;
      }
      if (remaining > 0) {
        row.debtSales += remaining;
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
    return Array.from(map.values())
      .map((row: any) => ({
        ...row,
        // تحسين: حساب الصافي النقدي الفعلي (استبعاد مبيعات البطاقة والديون من النقد في الصندوق)
        total: (Number(row.totalSales || 0) - Number(row.mastercardSales || 0) - Number(row.debtSales || 0)) + Number(row.debtPayments || 0) + Number(row.dailyNotes || 0),
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [filteredSales, paidDebtsByDate, returnsByDate, dailyNotesByDate, reportTrigger]);

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
        const remaining = Number(sale.debtRemaining || 0);
        const received = sale.amountReceived !== undefined && sale.amountReceived !== null
          ? Number(sale.amountReceived)
          : Math.max(0, total - remaining);
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

  const purchaseReportData = useMemo(() => {
    return salesReportData.map((r: any) => ({ date: r.date, invoices: r.invoices, items: 0, total: 0 }));
  }, [salesReportData, reportTrigger]);

  const purchasedItems = useMemo(() => {
    return topSellingProducts.map((p: any) => ({ name: p.name, quantity: 0, cost: 0 }));
  }, [topSellingProducts, reportTrigger]);

  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    (productsData || []).forEach((p: any) => {
      const units = Number(p.unitsPerBox || 1) > 0 ? Number(p.unitsPerBox) : 1;
      const boxCost = Number(p.boxPurchasePrice || 0);
      const unitCost = boxCost > 0 ? boxCost / units : 0;
      map.set(String(p.id), unitCost);
    });
    return map;
  }, [productsData, reportTrigger]);

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
    return Array.from(map.values())
      .map((r) => ({ ...r, profit: r.revenue - r.cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSales, productCostMap, reportTrigger]);

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

      const units = Number(p.unitsPerBox || 1) || 1;
      const boxCost = Number(p.boxPurchasePrice || 0);
      const unitCost = boxCost > 0 ? boxCost / units : 0;
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
  }, [productsData, reportTrigger]);

  // --- خوارزمية حساب النواقص الذكية ---
  const shortageReportData = useMemo(() => {
    // 1. تحديد فترة التحليل (إذا لم يحدد المستخدم تاريخ، نأخذ آخر 30 يوم افتراضياً لتحليل السحب)
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(new Date().setDate(endDate.getDate() - 30));
    
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

  }, [salesData, productsData, dateFrom, dateTo, coverageDays, reportTrigger]);


  const handleExportCSV = () => {
    let content = "";
    let filename = `report-${selectedReport}-${new Date().toISOString().slice(0,10)}.csv`;
    const bom = "\uFEFF"; // UTF-8 BOM for Excel support

    if (selectedReport === "sales") {
        content = "التاريخ,عدد الفواتير,الواصل,الباقي,مبيعات البطاقة,المبيعات النقدية,تحصيل ديون,مرتجعات,ملاحظات,الصافي\n";
        content += salesReportData.map((r: any) =>
            `${r.date},${r.invoices},${r.received},${r.remaining},${r.mastercardSales},${r.totalSales - r.mastercardSales - r.debtSales},${r.debtPayments},${r.returns},${r.dailyNotes},${r.total}`
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
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                المشتريات (غير مفعلة حالياً)
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
                الأصناف المشتراة (عرض تجريبي)
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
              <div className="text-sm text-slate-500">
                * يتم حساب الاحتياج بناءً على معدل السحب في الفترة المحددة في الفلتر أعلاه (أو آخر 30 يوم).
              </div>
              <Button onClick={handlePrintShortages} className="bg-slate-800 text-white gap-2">
                <FileText className="w-4 h-4" /> طباعة قائمة الشراء
              </Button>
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
                        <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                          ممتاز! المخزون كافٍ لتغطية {coverageDays} يوم بناءً على معدل السحب الحالي.
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
                  {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
                    <SelectItem value="shortages">النواقص (قائمة الشراء الذكية)</SelectItem>
                  )}
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
            </div>
          </div>
        </CardContent>
      </Card>

      {renderReportContent()}
    </div>
  );
};

export default ReportsSection;
