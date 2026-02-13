import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Calendar, FileText, Printer, Receipt, RefreshCw, Undo, User, TrendingUp, DollarSign, Package, QrCode, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  id: string;
  productId?: number;
  name: string;
  price: number;
  quantity: number;
  barcode?: string;
}

interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  time: string;
  discount?: number;
  items: CartItem[];
  total: number;
  amountReceived?: number;
  remaining?: number;
  cashier: string;
  paymentMethod?: string;
  clientName?: string;
  clientId?: number;
  returns?: {
    id: number;
    createdAt?: string;
    items?: { productId: number; quantity: number; price: number }[];
  }[];
}

const SalesInvoices = ({ currentUser }: { currentUser?: any }) => {
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editItems, setEditItems] = useState<CartItem[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<string>("");
  const [invoiceTime, setInvoiceTime] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("cash");
  const [editClientId, setEditClientId] = useState<string>("");
  const [editClientName, setEditClientName] = useState<string>("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustFrom, setAdjustFrom] = useState<string>("");
  const [adjustTo, setAdjustTo] = useState<string>("");
  const [showProfitDialog, setShowProfitDialog] = useState(false);
  const [reportMonth, setReportMonth] = useState<string>(String(new Date().getMonth()));
  const [reportYear, setReportYear] = useState<string>(String(new Date().getFullYear()));
  const [storeSettings, setStoreSettings] = useState({ name: "", address: "", phone: "" });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sales = [], isLoading: isLoadingSales } = useQuery<any[]>({
    queryKey: ["sales"],
    queryFn: () => window.api.listSales({ limit: 2000 }), // زيادة الحد لضمان ظهور الفواتير عند البحث
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => window.api.listClients(),
  });

  // جلب إعدادات المتجر لعرضها في الفاتورة
  useQuery({
    queryKey: ["appSettings"],
    queryFn: async () => {
      const name = await window.api.getAppSetting('storeName');
      const address = await window.api.getAppSetting('storeAddress');
      const phone = await window.api.getAppSetting('storePhone');
      const settings = { name: name || "مركز الجمجمة", address: address || "", phone: phone || "" };
      setStoreSettings(settings);
      return settings;
    }
  });

  // دالة مساعدة لحساب تاريخ الفاتورة بناءً على توقيت العمل (1 صباحاً)
  const getBusinessDate = (d: string | number | Date) => {
    const date = new Date(d);
    date.setUTCHours(date.getUTCHours() + 2);
    return date.toISOString().slice(0, 10);
  };

  const mockSalesInvoices: SaleInvoice[] = sales.map((s: any) => {
    const remaining = Number(s.debtRemaining || 0);
    const amountReceived = s.amountReceived !== undefined && s.amountReceived !== null
      ? Number(s.amountReceived)
      : Math.max(0, Number(s.total || 0) - remaining);
    return {
    id: String(s.id),
    invoiceNumber: `INV-${String(s.id).padStart(6, "0")}`,
    date: getBusinessDate(s.createdAt || s.created_at || Date.now()),
    time: new Date(s.createdAt || s.created_at || Date.now()).toLocaleTimeString(),
    discount: Number(s.discount || 0),
    items: (s.items || []).map((it: any) => ({
      id: String(it.id),
      productId: it.productId,
      name: it.product?.name || it.productName || (it.productId ? `صنف ${it.productId}` : ""),
      price: it.price,
      quantity: it.quantity,
    })),
    total: Number(s.total || 0),
    amountReceived,
    remaining,
    cashier: s.cashier ? (s.cashier.name || s.cashier.username || "") : "",
    paymentMethod: s.paymentMethod,
    clientName: s.clientName || (s.client ? s.client.name : ""), // الأولوية للاسم اليدوي ثم المسجل
    clientId: s.client ? s.client.id : undefined,
    returns: s.returns || [],
    };
  });

  const filteredInvoices = mockSalesInvoices.filter((inv) =>
    inv.invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  const adjustedInvoices = mockSalesInvoices.filter((inv) => {
    const hasAdjust = Number(inv.discount || 0) > 0 || (inv.returns || []).length > 0 || inv.paymentMethod === 'debt' || Number(inv.remaining || 0) > 0;
    if (!hasAdjust) return false;
    const invDate = new Date(inv.date);
    if (adjustFrom) {
      const from = new Date(adjustFrom);
      if (invDate < from) return false;
    }
    if (adjustTo) {
      const to = new Date(adjustTo);
      to.setHours(23, 59, 59, 999);
      if (invDate > to) return false;
    }
    return true;
  });

  const returnsTotal = (inv: SaleInvoice) =>
    (inv.returns || []).reduce(
      (acc, r) =>
        acc +
        (r.items || []).reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0), 0),
      0
    );

  const updateSaleMutation = useMutation({
    mutationFn: (payload: any) => window.api.updateSale(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setIsEditing(false);
    },
    onError: (err: any) => alert(err?.message || "فشل تحديث الفاتورة"),
  });

  const createReturnMutation = useMutation({
    mutationFn: (payload: any) => window.api.createReturn(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      setReturnQuantities({});
      setIsInvoiceDialogOpen(false); // إغلاق النافذة لتحديث البيانات ومنع التعديل على بيانات قديمة
      toast({ title: "تم", description: "تم إنشاء المرتجع بنجاح." });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err?.message || "فشل إنشاء المرتجع", variant: "destructive" }),
  });

  const totalReturnAmount = useMemo(() => {
    if (!selectedInvoice) return 0;
    return selectedInvoice.items.reduce((acc, it) => {
      const rq = Number(returnQuantities[it.id] || 0);
      if (!rq || rq < 0) return acc;
      return acc + rq * Number(it.price || 0);
    }, 0);
  }, [returnQuantities, selectedInvoice]);

  // حساب المجموع الفرعي (قبل الخصم) بناءً على العناصر الحالية (سواء في وضع العرض أو التعديل)
  const currentSubTotal = useMemo(() => {
    if (!selectedInvoice) return 0;
    const items = isEditing ? editItems : selectedInvoice.items;
    return items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
  }, [selectedInvoice, isEditing, editItems]);

  const computedTotal = useMemo(() => {
    return Math.max(0, currentSubTotal - Number(invoiceDiscount || 0));
  }, [currentSubTotal, invoiceDiscount]);

  const finalAfterReturns = useMemo(() => {
    return Math.max(0, computedTotal - Number(totalReturnAmount || 0));
  }, [computedTotal, totalReturnAmount]);

  const alreadyReturned = (productId?: number, itemId?: string) => {
    if (!selectedInvoice || !productId) return 0;
    return (selectedInvoice.returns || []).reduce((acc, r) => {
      const subtotal = (r.items || []).filter((it) => it.productId === productId).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
      return acc + subtotal;
    }, 0);
  };

  const handleEditSave = () => {
    if (!selectedInvoice) return;
    const itemsPayload = editItems
      .filter((it) => Number(it.quantity) > 0)
      .map((it) => ({
        productId: Number(it.productId),
        quantity: Number(it.quantity),
        price: Number(it.price),
      }));
    if (itemsPayload.length === 0) return alert("يجب أن تحتوي الفاتورة على عنصر واحد على الأقل.");
    updateSaleMutation.mutate({
      saleId: Number(selectedInvoice.id),
      items: itemsPayload,
      discount: Number(invoiceDiscount || 0),
      date: invoiceDate || selectedInvoice.date,
      time: invoiceTime || selectedInvoice.time,
      paymentMethod: editPaymentMethod,
      clientId: editClientId ? Number(editClientId) : null,
      clientName: editClientName
    });
  };

  const handleReturn = () => {
    if (!selectedInvoice) return;
    
    const itemsPayload: any[] = [];
    
    // التحقق من الكميات قبل الإرسال
    for (const item of selectedInvoice.items) {
        const qtyToReturn = Number(returnQuantities[item.id] || 0);
        if (qtyToReturn > 0) {
            const returnedPreviously = alreadyReturned(item.productId, item.id);
            const maxAvailable = item.quantity - returnedPreviously;
            
            if (qtyToReturn > maxAvailable) {
                toast({ title: "خطأ في الكمية", description: `الكمية المرجعة للصنف "${item.name}" (${qtyToReturn}) تتجاوز الكمية المتاحة (${maxAvailable}).`, variant: "destructive" });
                return;
            }
            
            itemsPayload.push({ productId: Number(item.productId), quantity: qtyToReturn, price: Number(item.price) });
        }
    }

    if (itemsPayload.length === 0) {
        toast({ title: "تنبيه", description: "يرجى تحديد كمية واحدة على الأقل للإرجاع.", variant: "destructive" });
        return;
    }
    
    createReturnMutation.mutate({ saleId: Number(selectedInvoice.id), items: itemsPayload });
  };

  const openInvoice = (invoice: SaleInvoice) => {
    setSelectedInvoice(invoice);
    setEditItems(invoice.items);
    setReturnQuantities({});
    setIsEditing(false);
    setInvoiceDiscount(Number(invoice.discount || 0));
    setInvoiceDate(invoice.date);
    setInvoiceTime(invoice.time);
    setEditPaymentMethod(invoice.paymentMethod || "cash");
    setEditClientId(invoice.clientId ? String(invoice.clientId) : "");
    setEditClientName(invoice.clientName || "");
    setIsInvoiceDialogOpen(true);
  };

  const handlePrint = async () => {
  if (!selectedInvoice) return;
  
  const storeName = storeSettings.name || "مركز الجمجمة";
  const storeAddress = storeSettings.address || "";
  const storePhone = storeSettings.phone || "";

  const isRamadan = localStorage.getItem("ramadanMode") === "true";

  try {
    const receiptPayload = {
      store: {
        name: isRamadan ? ` ${storeName} ` : storeName, // تغيير شكل اسم المتجر في الوصل
        address: storeAddress,
        phone: storePhone,
      },
      invoice: {
        number: selectedInvoice.invoiceNumber,
        date: selectedInvoice.date,
        time: selectedInvoice.time,
        cashier: selectedInvoice.cashier,
        client: selectedInvoice.clientName,
        items: selectedInvoice.items.map((it) => ({
          name: it.name,
          qty: it.quantity,
          price: it.price,
          total: it.price * it.quantity,
        })),
        subtotal: currentSubTotal,
        discount: selectedInvoice.discount,
        total: selectedInvoice.total,
        received: selectedInvoice.amountReceived ?? Math.max(0, selectedInvoice.total - Number(selectedInvoice.remaining || 0)),
        remaining: selectedInvoice.remaining || 0,
      },
      footer: isRamadan ? "🌙 رمضان مبارك 🌙 - تقبل الله طاعاتكم - شكراً لزيارتكم! 🌹" : "شكراً لزيارتكم! 🌹",
      qr: "https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL",
      qrImage: "qr.png", // إرسال اسم الصورة للطباعة
    };

    await window.api.printThermalReceipt(receiptPayload);

    toast({
      title: "نجاح",
      description: "تم إرسال وصل الاستلام إلى الطابعة بنجاح",
    });
  } catch (err: any) {
    console.error(err);
    toast({
      title: "خطأ في الطباعة",
      description:
        err?.message ||
        "فشل الاتصال بالطابعة. تأكد من تشغيلها وربطها.",
      variant: "destructive",
    });
  }
};

  // حساب الأرباح الشهرية
  const monthlyStats = useMemo(() => {
    if (!showProfitDialog) return { revenue: 0, cost: 0, profit: 0, count: 0 };

    const start = new Date(Number(reportYear), Number(reportMonth), 1);
    const end = new Date(Number(reportYear), Number(reportMonth) + 1, 0, 23, 59, 59);

    const monthlySales = sales.filter((s: any) => {
      const d = new Date(s.createdAt || s.created_at);
      return d >= start && d <= end;
    });

    let revenue = 0;
    let cost = 0;

    monthlySales.forEach((s: any) => {
      // الإيراد الصافي (بعد الخصم)
      revenue += Number(s.total || 0);

      // حساب التكلفة التقديرية بناءً على سعر الشراء الحالي للمنتج
      if (s.items && Array.isArray(s.items)) {
        s.items.forEach((item: any) => {
          if (item.product) {
            const purchasePrice = Number(item.product.boxPurchasePrice || 0);
            const units = Number(item.product.unitsPerBox || 1);
            // تكلفة القطعة الواحدة
            const unitCost = units > 0 ? purchasePrice / units : 0;
            cost += unitCost * Number(item.quantity || 0);
          }
        });
      }
    });

    // خصم المرتجعات من الأرباح (تقريبي)
    // المرتجعات تقلل المبيعات وتعيد البضاعة للمخزن (تقلل التكلفة المباعة)، لكن هنا سنحسب الصافي ببساطة
    // للحصول على دقة أعلى يجب معالجة المرتجعات بشكل منفصل، لكن هذا تقريب جيد
    return { revenue, cost, profit: revenue - cost, count: monthlySales.length };
  }, [sales, reportMonth, reportYear, showProfitDialog]);

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <FileText className="w-6 h-6" />
            فواتير المبيعات (وصولات الاستلام)
          </CardTitle>
          <p className="text-sm text-gray-600">عدد الفواتير: {mockSalesInvoices.length}</p>
        </CardHeader>
      </Card>

      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Receipt className="w-5 h-5" />
            قائمة الفواتير ({filteredInvoices.length}/{mockSalesInvoices.length})
          </CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Input
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة..."
              className="w-48"
            />
            <Button variant="outline" onClick={() => setShowAdjustDialog(true)}>
              فواتير (خصم / مرتجع / دين)
            </Button>
            {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
              <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowProfitDialog(true)}>
                <TrendingUp className="w-4 h-4 ml-2" /> تقرير الأرباح
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSales ? (
            <div className="flex flex-col items-center justify-center py-12 text-blue-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="text-lg font-medium">جاري تحميل الفواتير...</p>
            </div>
          ) : mockSalesInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Receipt className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>لا توجد فواتير مسجلة حالياً.</p>
              <p className="text-sm mt-2">عند إنشاء فواتير جديدة ستظهر هنا.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {filteredInvoices.map((invoice) => (
                <Card
                  key={invoice.id}
                  className="border-blue-200 hover:shadow-md transition-all duration-200 cursor-pointer"
                  onClick={() => openInvoice(invoice)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-blue-600 border-blue-300">
                            {invoice.invoiceNumber}
                          </Badge>
                          {(invoice.paymentMethod === 'debt' || Number(invoice.remaining || 0) > 0) && (
                            <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                              آجل (دين) {invoice.clientName ? ` - ${invoice.clientName}` : ''}
                            </Badge>
                          )}
                          <span className="text-sm text-gray-600">{invoice.items.length} صنف</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {invoice.date} - {invoice.time}
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {invoice.cashier}
                            {invoice.clientName && <span className="text-xs text-gray-500 mr-1">| العميل: {invoice.clientName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-lg font-bold text-blue-600">{formatCurrency(invoice.total)} د.ع</div>
                        <div className="text-xs text-slate-600">الواصل: {formatCurrency(invoice.amountReceived ?? invoice.total)} د.ع</div>
                        <div className={`text-xs ${Number(invoice.remaining || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          الباقي: {formatCurrency(invoice.remaining || 0)} د.ع
                        </div>
                        <Button variant="ghost" size="sm" className="mt-1">
                          عرض / طباعة
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              عرض وصل الاستلام {selectedInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6">
              {/* Receipt preview */}
              <div className="flex justify-center">
                <div className="w-full md:w-[480px] bg-white border border-dashed border-slate-300 shadow-sm rounded-lg p-4 space-y-3">
                  <div className="text-center space-y-1">
                    <div className="text-xl font-bold text-blue-700">وصل استلام</div>
                    <div className="text-sm font-semibold text-slate-700">{storeSettings.name}</div>
                    <div className="text-sm text-slate-600">رقم الفاتورة: {selectedInvoice.invoiceNumber}</div>
                  {((isEditing ? editPaymentMethod === 'debt' : selectedInvoice.paymentMethod === 'debt') || Number(selectedInvoice?.remaining || 0) > 0) && (
                    <div className="text-sm font-bold text-red-600 border border-red-200 bg-red-50 inline-block px-2 rounded mt-1">فاتورة آجلة (دين)</div>
                  )}
                  {(isEditing ? editClientId : selectedInvoice.clientName) && <div className="text-sm text-slate-800 mt-1">العميل: {isEditing ? clients.find((c:any) => String(c.id) === editClientId)?.name : selectedInvoice.clientName}</div>}
                  
                  {/* عرض اسم العميل */}
                  {isEditing ? (
                    <div className="mt-2">
                      <label className="text-xs text-slate-500 block mb-1">اسم العميل (يدوي)</label>
                      <Input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className="h-8 text-center" placeholder="اسم العميل" />
                    </div>
                  ) : (
                    selectedInvoice.clientName && <div className="text-sm text-slate-800 mt-1">العميل: {selectedInvoice.clientName}</div>
                  )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">التاريخ</span>
                  {isEditing ? (
                    <Input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="h-8"
                    />
                  ) : (
                    <span>{invoiceDate || selectedInvoice.date}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الوقت</span>
                  {isEditing ? (
                    <Input
                      type="time"
                      value={invoiceTime}
                      onChange={(e) => setInvoiceTime(e.target.value)}
                      className="h-8"
                    />
                  ) : (
                    <span>{invoiceTime || selectedInvoice.time}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الكاشير</span>
                  <span>{selectedInvoice.cashier || "-"}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500">طريقة الدفع</span>
                  {isEditing ? (
                    <div className="flex gap-2">
                        <select 
                            className="h-8 border rounded px-2 text-sm bg-white"
                            value={editPaymentMethod}
                            onChange={(e) => setEditPaymentMethod(e.target.value)}
                        >
                            <option value="cash">نقد (كاش)</option>
                            <option value="mastercard">ماستر كارد</option>
                            <option value="debt">آجل (دين)</option>
                        </select>
                    </div>
                  ) : (
                    <span>{selectedInvoice.paymentMethod === 'debt' ? 'آجل (دين)' : selectedInvoice.paymentMethod === 'mastercard' ? 'ماستر كارد' : 'نقد (كاش)'}</span>
                  )}
                </div>

                {(isEditing && editPaymentMethod === 'debt') && (
                    <div className="flex justify-between items-center col-span-2 bg-red-50 p-1 rounded border border-red-100">
                    <span className="text-red-600 font-bold ml-2">اختر العميل:</span>
                        <Select value={editClientId} onValueChange={setEditClientId}>
                        <SelectTrigger className="w-[180px] h-8 bg-white">
                            <SelectValue placeholder="اختر عميل" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                            {clients.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    </div>
                )}

                    <div className="flex justify-between">
                      <span className="text-slate-500">عدد الأصناف</span>
                      <span>{selectedInvoice.items.length}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">الصنف</TableHead>
                          <TableHead className="text-right">السعر</TableHead>
                          <TableHead className="text-right">الكمية</TableHead>
                          <TableHead className="text-right">الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(isEditing ? editItems : selectedInvoice.items).map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={item.price}
                                  onChange={(e) => {
                                    const next = [...editItems];
                                    next[index] = { ...next[index], price: Number(e.target.value) };
                                    setEditItems(next);
                                  }}
                                  className="h-8"
                                />
                              ) : (
                                `${formatCurrency(item.price)} د.ع`
                              )}
                            </TableCell>
                            <TableCell>
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const next = [...editItems];
                                    next[index] = { ...next[index], quantity: Number(e.target.value) };
                                    setEditItems(next);
                                  }}
                                  className="h-8"
                                />
                              ) : (
                                item.quantity
                              )}
                            </TableCell>
                            <TableCell className="font-semibold text-blue-700">
                              {formatCurrency(item.price * item.quantity)} د.ع
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="border-t pt-3 space-y-1 text-sm">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>المجموع</span>
                      <span className="text-blue-700">{formatCurrency(currentSubTotal)} د.ع</span>
                    </div>
                    <div className="flex justify-between">
                      <span>خصم الفاتورة</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={invoiceDiscount}
                          onChange={(e) => setInvoiceDiscount(Number(e.target.value || 0))}
                          className="h-8 w-28"
                        />
                      ) : (
                        <span>{formatCurrency(invoiceDiscount)} د.ع</span>
                      )}
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>الإجمالي النهائي</span>
                      <span>{formatCurrency(computedTotal)} د.ع</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الواصل</span>
                      <span>{formatCurrency(selectedInvoice?.amountReceived ?? Math.max(0, computedTotal - Number(selectedInvoice?.remaining || 0)))} د.ع</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الباقي</span>
                      <span className={Number(selectedInvoice?.remaining || 0) > 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                        {formatCurrency(selectedInvoice?.remaining || 0)} د.ع
                      </span>
                    </div>
                    {totalReturnAmount > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>خصم المرتجعات</span>
                        <span>{formatCurrency(totalReturnAmount)} د.ع</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold">
                      <span>الصافي للزبون</span>
                      <span>{formatCurrency(finalAfterReturns)} د.ع</span>
                    </div>
                  </div>

                  <div className="text-center text-xs text-slate-500 pt-2">شكراً لثقتكم</div>
                  <div className="flex items-center justify-center gap-3 pt-4 border-t border-dashed border-slate-200 mt-4">
                    <p className="text-[10px] text-slate-500 font-bold text-left leading-tight">
                      تابعونا على الفيسبوك<br/>لمعرفة اخر عروضنا
                    </p>
                    <div className="relative w-16 h-16 bg-white p-1 rounded-lg border border-slate-100 shadow-sm">
                      <img 
                        src="/qr.png" 
                        alt="QR Code" 
                        className="w-full h-full object-contain" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 flex-wrap">
                <Button className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500" onClick={handlePrint}>
                  <Printer className="w-4 h-4 ml-2" />
                  طباعة وصل للزبون
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setIsEditing((v) => !v)}>
                  <RefreshCw className="w-4 h-4 ml-2" />
                  {isEditing ? "إلغاء التعديل" : "تعديل الأصناف"}
                </Button>
                {isEditing && (
                  <Button
                    variant="default"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                    onClick={handleEditSave}
                    disabled={updateSaleMutation.isPending}
                  >
                    حفظ التعديل
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={handleReturn} disabled={createReturnMutation.isPending}>
                  <Undo className="w-4 h-4 ml-2" />
                  إنشاء مرتجع
                </Button>
                <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>
                  إغلاق
                </Button>
              </div>

              {/* Return selection */}
              <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                <h4 className="font-semibold text-slate-800">تحديد الكميات المرتجعة</h4>
                <div className="grid gap-3">
                  {selectedInvoice.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-slate-600">
                          الكمية المباعة: {item.quantity} | سبق إرجاع: {alreadyReturned(item.productId, item.id)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={Math.max(0, item.quantity - alreadyReturned(item.productId, item.id))}
                          value={returnQuantities[item.id] ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value || 0);
                            const max = Math.max(0, item.quantity - alreadyReturned(item.productId, item.id));
                            if (val > max) {
                                toast({ title: "تنبيه", description: "لا يمكن تجاوز الكمية المتاحة للإرجاع", variant: "destructive" });
                                setReturnQuantities((prev) => ({ ...prev, [item.id]: max }));
                            } else {
                                setReturnQuantities((prev) => ({ ...prev, [item.id]: val }));
                            }
                          }}
                          className="w-28"
                        />
                        <span className="text-xs text-slate-500">المتاح للإرجاع: {Math.max(0, item.quantity - alreadyReturned(item.productId, item.id))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: فواتير فيها خصم أو مرتجع */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>فواتير خاصة (خصم / مرتجع / دين)</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">من تاريخ</span>
              <Input type="date" value={adjustFrom} onChange={(e) => setAdjustFrom(e.target.value)} className="h-9" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">إلى تاريخ</span>
              <Input type="date" value={adjustTo} onChange={(e) => setAdjustTo(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" onClick={() => { setAdjustFrom(""); setAdjustTo(""); }}>
              مسح الفلتر
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الكاشير</TableHead>
                <TableHead className="text-right">النوع/العميل</TableHead>
                <TableHead className="text-right">الخصم</TableHead>
                <TableHead className="text-right">قيمة المرتجع</TableHead>
                <TableHead className="text-right">الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustedInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500">
                    لا توجد فواتير مطابقة في هذا النطاق.
                  </TableCell>
                </TableRow>
              )}
              {adjustedInvoices.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer hover:bg-blue-50"
                  onClick={() => {
                    openInvoice(inv);
                    setShowAdjustDialog(false);
                  }}
                >
                  <TableCell>{inv.invoiceNumber}</TableCell>
                  <TableCell>{inv.date}</TableCell>
                  <TableCell>{inv.cashier}</TableCell>
                  <TableCell>
                    {inv.paymentMethod === 'debt' ? <span className="text-red-600 font-bold text-xs">دين</span> : <span className="text-green-600 text-xs">نقدي</span>}
                    {inv.clientName && <div className="text-xs text-gray-500">{inv.clientName}</div>}
                  </TableCell>
                  <TableCell className="text-blue-600">{formatCurrency(inv.discount || 0)} د.ع</TableCell>
                  <TableCell className="text-red-600">{formatCurrency(returnsTotal(inv))} د.ع</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(inv.total)} د.ع</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Dialog: تقرير الأرباح */}
      <Dialog open={showProfitDialog} onOpenChange={setShowProfitDialog}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              تقرير الأرباح الشهرية
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex gap-4 mb-6 bg-gray-50 p-4 rounded-lg">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">الشهر</label>
              <Select value={reportMonth} onValueChange={setReportMonth}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {new Date(0, i).toLocaleString('ar-IQ', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">السنة</label>
              <Select value={reportYear} onValueChange={setReportYear}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50 border-blue-100">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-blue-100 rounded-full mb-3"><DollarSign className="w-6 h-6 text-blue-600" /></div>
                <div className="text-sm text-blue-600 font-medium">إجمالي المبيعات</div>
                <div className="text-2xl font-bold text-blue-800 mt-1">{formatCurrency(monthlyStats.revenue)}</div>
                <div className="text-xs text-blue-400 mt-2">{monthlyStats.count} فاتورة</div>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 border-orange-100">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-orange-100 rounded-full mb-3"><Package className="w-6 h-6 text-orange-600" /></div>
                <div className="text-sm text-orange-600 font-medium">تكلفة البضاعة المباعة</div>
                <div className="text-2xl font-bold text-orange-800 mt-1">{formatCurrency(monthlyStats.cost)}</div>
                <div className="text-xs text-orange-400 mt-2">تقديري بناءً على سعر الشراء الحالي</div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                <div className="p-3 bg-emerald-100 rounded-full mb-3"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
                <div className="text-sm text-emerald-600 font-medium">صافي الأرباح</div>
                <div className="text-2xl font-bold text-emerald-800 mt-1">{formatCurrency(monthlyStats.profit)}</div>
                <div className="text-xs text-emerald-500 mt-2">المبيعات - التكلفة</div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesInvoices;
