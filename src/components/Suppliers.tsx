import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Truck, Search, DollarSign, ArrowUpRight, ArrowDownLeft, Plus, FilePlus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Suppliers = ({ currentUser }: { currentUser?: any }) => {
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierBalance, setNewSupplierBalance] = useState("");
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [isOpeningBalanceOpen, setIsOpeningBalanceOpen] = useState(false);
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState("");

  // Financial Invoice State
  const [isFinancialInvoiceOpen, setIsFinancialInvoiceOpen] = useState(false);
  const [financialMeta, setFinancialMeta] = useState({ number: "", date: new Date(Date.now() + 2 * 3600000).toISOString().split('T')[0] });
  const [financialItems, setFinancialItems] = useState<{name: string, quantity: number, cost: number}[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // جلب كافة الفواتير (بدون حد أقصى للحصول على حساب دقيق)
  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["allPurchaseInvoices"],
    queryFn: () => window.api.listPurchaseInvoices(),
  });

  const { data: payments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["supplierPayments"],
    queryFn: () => window.api.listSupplierPayments(),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => window.api.listProducts(),
  });

  const isLoading = isLoadingInvoices || isLoadingPayments;

  // تجميع البيانات حسب المورد
  const suppliersStats = useMemo(() => {
    const stats: Record<string, { totalPurchases: number; totalPaid: number; invoices: any[]; payments: any[] }> = {};

    // معالجة الفواتير
    invoices.forEach((inv: any) => {
      const name = inv.supplierName || "مورد غير محدد";
      if (!stats[name]) stats[name] = { totalPurchases: 0, totalPaid: 0, invoices: [], payments: [] };
      
      stats[name].totalPurchases += Number(inv.totalAmount || 0);
      stats[name].invoices.push(inv);
    });

    // معالجة الدفعات
    payments.forEach((pay: any) => {
      const name = pay.supplierName;
      if (name) {
        if (!stats[name]) stats[name] = { totalPurchases: 0, totalPaid: 0, invoices: [], payments: [] };
        stats[name].totalPaid += Number(pay.amount || 0);
        stats[name].payments.push(pay);
      }
    });

    return Object.entries(stats).map(([name, data]) => ({
      name,
      ...data,
      balance: data.totalPurchases - data.totalPaid
    })).sort((a, b) => b.balance - a.balance); // ترتيب حسب الرصيد المتبقي (الأعلى أولاً)
  }, [invoices, payments]);

  const filteredSuppliers = suppliersStats.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const addPaymentMutation = useMutation({
    mutationFn: (data: any) => window.api.addSupplierPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplierPayments"] });
      toast({ title: "تم التسجيل", description: "تم تسجيل الدفعة بنجاح." });
      setIsPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentNote("");
    },
    onError: () => toast({ title: "خطأ", description: "فشل تسجيل الدفعة.", variant: "destructive" })
  });

  const handleAddPayment = () => {
    if (!selectedSupplier || !paymentAmount) return;
    addPaymentMutation.mutate({
      supplierName: selectedSupplier,
      amount: paymentAmount,
      note: paymentNote,
      date: new Date().toISOString()
    });
  };

  const addSupplierMutation = useMutation({
    mutationFn: (data: any) => window.api.processPurchaseInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allPurchaseInvoices"] });
      toast({ title: "تم الإضافة", description: "تم إضافة المورد بنجاح." });
      setIsAddSupplierOpen(false);
      setNewSupplierName("");
      setNewSupplierBalance("");
    },
    onError: () => toast({ title: "خطأ", description: "فشل إضافة المورد.", variant: "destructive" })
  });

  // عملية خاصة للفواتير الخارجية لضمان عدم ضياع البيانات عند الخطأ
  const addFinancialInvoiceMutation = useMutation({
    mutationFn: (data: any) => window.api.processPurchaseInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allPurchaseInvoices"] });
      toast({ title: "تم الحفظ", description: "تم حفظ الفاتورة الخارجية بنجاح." });
      setIsFinancialInvoiceOpen(false);
      setFinancialItems([]);
      setFinancialMeta({ number: "", date: new Date(Date.now() + 2 * 3600000).toISOString().split('T')[0] });
    },
    onError: (err: any) => {
        toast({ title: "خطأ", description: "فشل حفظ الفاتورة. يرجى التأكد من إعادة تشغيل التطبيق لتفعيل الميزات الجديدة.", variant: "destructive" });
    }
  });

  const addOpeningBalanceMutation = useMutation({
    mutationFn: (data: any) => window.api.processPurchaseInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allPurchaseInvoices"] });
      toast({ title: "تم الحفظ", description: "تم إضافة الرصيد الافتتاحي بنجاح." });
      setIsOpeningBalanceOpen(false);
      setOpeningBalanceAmount("");
    },
    onError: () => toast({ title: "خطأ", description: "فشل إضافة الرصيد.", variant: "destructive" })
  });

  const handleAddOpeningBalance = () => {
    if (!openingBalanceAmount) return;
    addOpeningBalanceMutation.mutate({
      invoiceNumber: `OP-${Date.now()}`, // Opening Balance invoice
      date: new Date().toISOString(),
      cashierName: "النظام",
      supplierName: selectedSupplier,
      totalAmount: Number(openingBalanceAmount),
      items: [], // No items, just balance
      skipStock: true
    });
  };

  const resetSuppliersMutation = useMutation({
    mutationFn: () => window.api.resetSuppliers(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allPurchaseInvoices"] });
      queryClient.invalidateQueries({ queryKey: ["supplierPayments"] });
      toast({ title: "تم التصفير", description: "تم حذف جميع سجلات الموردين والفواتير بنجاح." });
      setSelectedSupplier(null);
    },
    onError: () => toast({ title: "خطأ", description: "فشل تصفير الموردين.", variant: "destructive" })
  });

  const handleResetSuppliers = () => {
    if (confirm("تحذير هام جداً!\n\nهل أنت متأكد من حذف كافة سجلات الموردين؟\nسيتم حذف جميع فواتير الشراء والدفعات المسجلة.\nلا يمكن التراجع عن هذه العملية.")) {
      if (confirm("تأكيد نهائي: هل أنت متأكد؟")) {
        resetSuppliersMutation.mutate();
      }
    }
  };

  const handleAddSupplier = () => {
    if (!newSupplierName) return;
    addSupplierMutation.mutate({
      invoiceNumber: `OP-${Date.now()}`, // Opening Balance invoice
      date: new Date().toISOString(),
      cashierName: "النظام",
      supplierName: newSupplierName,
      totalAmount: Number(newSupplierBalance || 0),
      items: [] // No items, just balance
    });
  };

  const handleAddFinancialItem = () => {
    if (!newItemName || !newItemCost) return;
    setFinancialItems([...financialItems, {
      name: newItemName,
      quantity: Number(newItemQty),
      cost: Number(newItemCost)
    }]);
    setNewItemName("");
    setNewItemCost("");
    setNewItemQty("1");
  };

  const handleRemoveFinancialItem = (index: number) => {
    setFinancialItems(financialItems.filter((_, i) => i !== index));
  };

  const handleFinancialSubmit = () => {
    if (!financialMeta.number) {
        toast({ title: "تنبيه", description: "يرجى إدخال رقم الفاتورة", variant: "destructive" });
        return;
    }
    if (financialItems.length === 0) {
        toast({ title: "تنبيه", description: "يجب إضافة مواد للفاتورة", variant: "destructive" });
        return;
    }
    const total = financialItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0);
    
    addFinancialInvoiceMutation.mutate({
      invoiceNumber: financialMeta.number,
      date: financialMeta.date,
      cashierName: "النظام",
      supplierName: selectedSupplier,
      totalAmount: total,
      items: financialItems,
      skipStock: true // Flag to skip stock update
    });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US').format(val);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
          <Truck className="w-6 h-6" />
          سجل الموردين
        </h2>

        {/* نافذة عرض تفاصيل الفاتورة */}
        <Dialog open={!!viewInvoice} onOpenChange={(open) => !open && setViewInvoice(null)}>
          <DialogContent className="max-w-3xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>تفاصيل الفاتورة #{viewInvoice?.invoiceNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
               <div className="flex justify-between text-sm text-slate-500 border-b pb-2">
                 <span>التاريخ: {viewInvoice && new Date(viewInvoice.date).toLocaleDateString('ar-IQ')}</span>
                 <span>المورد: {viewInvoice?.supplierName}</span>
                 <span>الكاشير: {viewInvoice?.cashier}</span>
               </div>
               
               <div className="max-h-[60vh] overflow-y-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead className="text-right">المادة</TableHead>
                       <TableHead className="text-center">الكمية</TableHead>
                       <TableHead className="text-center">السعر</TableHead>
                       <TableHead className="text-center">الإجمالي</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {viewInvoice?.items?.map((item: any, idx: number) => {
                       const product = products.find((p: any) => p.id === item.productId);
                       return (
                         <TableRow key={idx}>
                           <TableCell>{item.name || product?.name || "منتج غير معروف"}</TableCell>
                           <TableCell className="text-center">{item.quantity}</TableCell>
                           <TableCell className="text-center">{formatCurrency(item.cost || 0)}</TableCell>
                           <TableCell className="text-center font-bold">{formatCurrency((item.quantity || 0) * (item.cost || 0))}</TableCell>
                         </TableRow>
                       );
                     })}
                     {(!viewInvoice?.items || viewInvoice.items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-slate-500">
                            لا توجد مواد (رصيد افتتاحي أو فاتورة مالية فقط)
                          </TableCell>
                        </TableRow>
                     )}
                   </TableBody>
                 </Table>
               </div>

               <div className="flex justify-between items-center pt-2 border-t font-bold text-lg">
                 <span>الإجمالي النهائي:</span>
                 <span>{viewInvoice ? formatCurrency(viewInvoice.totalAmount) : 0}</span>
               </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* نافذة إضافة رصيد افتتاحي لمورد موجود */}
        <Dialog open={isOpeningBalanceOpen} onOpenChange={setIsOpeningBalanceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة رصيد افتتاحي / سابق</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>المبلغ المطلوب للمورد</Label>
                <Input 
                  type="number" 
                  value={openingBalanceAmount} 
                  onChange={e => setOpeningBalanceAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button onClick={handleAddOpeningBalance} className="w-full bg-orange-600 hover:bg-orange-700">حفظ الرصيد</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* نافذة إضافة فاتورة مالية (بدون مخزون) */}
        <Dialog open={isFinancialInvoiceOpen} onOpenChange={setIsFinancialInvoiceOpen}>
          <DialogContent className="max-w-3xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة فاتورة خارجية / خدمات (لا تؤثر بالمخزون)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label>رقم الفاتورة</Label>
                   <Input value={financialMeta.number} onChange={e => setFinancialMeta({...financialMeta, number: e.target.value})} />
                 </div>
                 <div>
                   <Label>التاريخ</Label>
                   <Input type="date" value={financialMeta.date} onChange={e => setFinancialMeta({...financialMeta, date: e.target.value})} />
                 </div>
               </div>

               <div className="border p-3 rounded-lg bg-slate-50">
                 <Label className="mb-2 block">إضافة بند</Label>
                 <div className="flex gap-2 items-end">
                   <div className="flex-1">
                     <Input placeholder="اسم المادة / الخدمة" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                   </div>
                   <div className="w-20">
                     <Input type="number" placeholder="العدد" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} />
                   </div>
                   <div className="w-28">
                     <Input type="number" placeholder="السعر" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} />
                   </div>
                   <Button onClick={handleAddFinancialItem} size="icon"><Plus className="w-4 h-4" /></Button>
                 </div>
               </div>

               <div className="max-h-[40vh] overflow-y-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead className="text-right">المادة</TableHead>
                       <TableHead className="text-center">العدد</TableHead>
                       <TableHead className="text-center">السعر</TableHead>
                       <TableHead className="text-center">الإجمالي</TableHead>
                       <TableHead></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {financialItems.map((item, idx) => (
                       <TableRow key={idx}>
                         <TableCell>{item.name}</TableCell>
                         <TableCell className="text-center">{item.quantity}</TableCell>
                         <TableCell className="text-center">{formatCurrency(item.cost)}</TableCell>
                         <TableCell className="text-center font-bold">{formatCurrency(item.quantity * item.cost)}</TableCell>
                         <TableCell><Button variant="ghost" size="sm" onClick={() => handleRemoveFinancialItem(idx)}><Trash2 className="w-4 h-4 text-red-500" /></Button></TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
               <Button onClick={handleFinancialSubmit} className="w-full bg-blue-600 hover:bg-blue-700">حفظ الفاتورة</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex gap-2">
          {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
            <Button variant="destructive" className="gap-2" onClick={handleResetSuppliers}>
              <Trash2 className="w-4 h-4" />
              تصفير الكل
            </Button>
          )}

          <Dialog open={isAddSupplierOpen} onOpenChange={setIsAddSupplierOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                إضافة مورد جديد
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة مورد جديد / رصيد افتتاحي</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>اسم المورد</Label>
                <Input 
                  value={newSupplierName} 
                  onChange={e => setNewSupplierName(e.target.value)}
                  placeholder="اسم الشركة أو الشخص"
                />
              </div>
              <div className="space-y-2">
                <Label>الرصيد الافتتاحي (المبلغ المطلوب له)</Label>
                <Input 
                  type="number" 
                  value={newSupplierBalance} 
                  onChange={e => setNewSupplierBalance(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-slate-500">اتركه 0 إذا لم يكن هناك رصيد سابق.</p>
              </div>
              <Button onClick={handleAddSupplier} className="w-full">حفظ</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* القائمة الجانبية للموردين */}
        <Card className="lg:col-span-1 bg-white/80 backdrop-blur-sm border-blue-100 h-[calc(100vh-150px)] flex flex-col">
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="بحث عن مورد..." 
                className="pr-9" 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 space-y-2 relative">
            {isLoading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            )}
            {filteredSuppliers.map(supplier => (
              <div 
                key={supplier.name}
                onClick={() => setSelectedSupplier(supplier.name)}
                className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                  selectedSupplier === supplier.name 
                    ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200" 
                    : "bg-white border-slate-100 hover:bg-slate-50"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-slate-800">{supplier.name}</span>
                  {supplier.balance > 0 && (
                    <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100">
                      مطلوب: {formatCurrency(supplier.balance)}
                    </Badge>
                  )}
                  {supplier.balance <= 0 && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      خالص
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-2">
                  <span>مشتريات: {formatCurrency(supplier.totalPurchases)}</span>
                  <span>مدفوع: {formatCurrency(supplier.totalPaid)}</span>
                </div>
              </div>
            ))}
            {!isLoading && filteredSuppliers.length === 0 && (
              <div className="text-center py-8 text-slate-400">لا يوجد موردين</div>
            )}
          </CardContent>
        </Card>

        {/* تفاصيل المورد المحدد */}
        <Card className="lg:col-span-2 bg-white shadow-lg border-0 h-[calc(100vh-150px)] flex flex-col">
          {selectedSupplier ? (
            <>
              <CardHeader className="border-b bg-slate-50/50 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl text-slate-800">{selectedSupplier}</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">كشف حساب تفصيلي</p>
                  </div>
                  <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                        <DollarSign className="w-4 h-4" />
                        تسجيل دفعة للمورد
                      </Button>
                    </DialogTrigger>
                    <Button variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setIsFinancialInvoiceOpen(true)}>
                        <FilePlus className="w-4 h-4" />
                        إضافة فاتورة خارجية
                    </Button>
                    <Button variant="outline" className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50" onClick={() => setIsOpeningBalanceOpen(true)}>
                        <DollarSign className="w-4 h-4" />
                        رصيد افتتاحي
                    </Button>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>تسجيل دفعة لـ {selectedSupplier}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>المبلغ المدفوع</Label>
                          <Input 
                            type="number" 
                            value={paymentAmount} 
                            onChange={e => setPaymentAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>ملاحظات</Label>
                          <Input 
                            value={paymentNote} 
                            onChange={e => setPaymentNote(e.target.value)}
                            placeholder="رقم وصل، طريقة الدفع..."
                          />
                        </div>
                        <Button onClick={handleAddPayment} className="w-full">حفظ الدفعة</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                    <div className="text-xs text-blue-600 font-bold mb-1">إجمالي المشتريات</div>
                    <div className="text-lg font-black text-blue-800">
                      {formatCurrency(suppliersStats.find(s => s.name === selectedSupplier)?.totalPurchases || 0)}
                    </div>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center">
                    <div className="text-xs text-emerald-600 font-bold mb-1">إجمالي المدفوع</div>
                    <div className="text-lg font-black text-emerald-800">
                      {formatCurrency(suppliersStats.find(s => s.name === selectedSupplier)?.totalPaid || 0)}
                    </div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                    <div className="text-xs text-red-600 font-bold mb-1">الرصيد المتبقي</div>
                    <div className="text-lg font-black text-red-800">
                      {formatCurrency(suppliersStats.find(s => s.name === selectedSupplier)?.balance || 0)}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-0">
                <Table>
                  <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">التفاصيل</TableHead>
                      <TableHead className="text-center">مدين (لنا)</TableHead>
                      <TableHead className="text-center">دائن (له)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* دمج الفواتير والدفعات وترتيبها زمنياً */}
                    {[
                      ...(suppliersStats.find(s => s.name === selectedSupplier)?.invoices.map(i => ({...i, type: 'invoice'})) || []),
                      ...(suppliersStats.find(s => s.name === selectedSupplier)?.payments.map(p => ({...p, type: 'payment'})) || [])
                    ].sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime())
                     .map((item, idx) => (
                      <TableRow 
                        key={idx} 
                        className={item.type === 'payment' ? 'bg-emerald-50/30' : 'cursor-pointer hover:bg-blue-50 transition-colors'}
                        onClick={() => { if(item.type === 'invoice') setViewInvoice(item); }}
                      >
                        <TableCell className="font-medium text-slate-600">
                          {new Date(item.timestamp || item.date).toLocaleDateString('ar-IQ')}
                        </TableCell>
                        <TableCell>
                          {item.type === 'invoice' ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
                              <ArrowDownLeft className="w-3 h-3" /> فاتورة شراء
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                              <ArrowUpRight className="w-3 h-3" /> دفعة نقدية
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {item.type === 'invoice' 
                            ? `رقم: ${item.invoiceNumber} (${item.itemsCount} مواد)` 
                            : item.note || "بدون ملاحظات"}
                        </TableCell>
                        <TableCell className="text-center font-bold text-emerald-700">
                          {item.type === 'payment' ? formatCurrency(item.amount) : "-"}
                        </TableCell>
                        <TableCell className="text-center font-bold text-red-700">
                          {item.type === 'invoice' ? formatCurrency(item.totalAmount) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Truck className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg">اختر مورداً من القائمة لعرض السجل</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Suppliers;