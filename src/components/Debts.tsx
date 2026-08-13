﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Clock3, TrendingDown, TrendingUp, X, Eye, Pencil, Plus, Trash2, Printer, Loader2 } from "lucide-react";
import { getCurrentUserId } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type UserRef = string | { id?: any; username?: string; name?: string } | null | undefined;

type DebtPayment = {
  id: number;
  amount: number;
  note?: string | null;
  createdAt?: string | null;
  createdBy?: UserRef;
};

type Debt = {
  id: number;
  clientId?: number | null;
  clientName: string;
  client?: { id?: number | null; name?: string | null } | null;
  amount: number;
  reason?: string | null;
  note?: string | null;
  createdAt?: string | null;
  createdBy?: UserRef;
  payments?: DebtPayment[];
};

type Client = {
  id?: number | null;
  name: string;
  phone?: string | null;
  total: number;
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n);
const normalizeName = (val: any): string =>
  typeof val === "string"
    ? val
    : val?.name || val?.username || val?.clientName || (val?.id != null ? String(val.id) : "-");
const nameFromDebt = (d: Debt): string => normalizeName((d as any)?.client?.name ?? d.clientName);
const sumPayments = (d?: Debt) => (d?.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
// تم التعديل للسماح بالقيم السالبة (الفائض) لضمان دقة الحساب الإجمالي للعميل
const remaining = (d: Debt) => Number(d.amount || 0) - sumPayments(d);
const keyFor = (id?: number | null, name?: string | null) => (id != null ? `id:${id}` : `name:${name || "-"}`);

const DebtsPage: React.FC = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  // حالة الواجهة
  const [search, setSearch] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showEditDebt, setShowEditDebt] = useState(false);
  const [showEditPayment, setShowEditPayment] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);

  // حالة الاختيار
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string>("");

  // حالة التعديل
  const [editDebtId, setEditDebtId] = useState<number | null>(null);
  const [editDebtAmount, setEditDebtAmount] = useState("");
  const [editDebtReason, setEditDebtReason] = useState("");
  const [editDebtNote, setEditDebtNote] = useState("");

  const [editPaymentId, setEditPaymentId] = useState<number | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentNote, setEditPaymentNote] = useState("");

  const [editClientName, setEditClientName] = useState("");

  // بيانات جديدة
  const [newClientName, setNewClientName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const [debtAmount, setDebtAmount] = useState("");
  const [debtReason, setDebtReason] = useState("");
  const [debtNote, setDebtNote] = useState("");
  const [debtError, setDebtError] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // استعلامات البيانات
  const debtsQuery = useQuery<Debt[]>({
    queryKey: ["debts"],
    queryFn: () => window.api.listDebts({ limit: 10000 }),
  });

  const clientsQuery = useQuery<any[]>({
    queryKey: ["clients"],
    queryFn: () => window.api.listClients(),
  });

  const usersQuery = useQuery<any[]>({
    queryKey: ["users"],
    queryFn: () => window.api.listUsers(),
  });

  const users = usersQuery.data || [];
  
  const isLoading = debtsQuery.isLoading || clientsQuery.isLoading;

  const displayUser = (userOrPayment: any) => {
    // Accept either a user-like object OR a payment object which may contain user/userId/createdBy
    if (!userOrPayment) return "غير معروف";
    if (typeof userOrPayment === "string") return userOrPayment;

    // If a payment object was passed, try to extract the actor fields
    let candidate = userOrPayment;
    if (userOrPayment && (userOrPayment.user || userOrPayment.createdBy || userOrPayment.userId || userOrPayment.createdById)) {
      candidate = userOrPayment.user || userOrPayment.createdBy || { id: userOrPayment.userId ?? userOrPayment.createdById };
    }

    if (!candidate) return "غير معروف";
    if (typeof candidate === "string") return candidate;

    if (usersQuery.isLoading) return "جارٍ التحميل...";

    const uid = candidate.id ?? null;
    if (uid != null) {
      const found = users.find((u) => u.id === uid);
      if (found) return found.name || found.username || `المعرف ${uid}`;
      if (candidate.name) return candidate.name;
      return `المعرف ${uid}`;
    }

    return candidate.name || candidate.username || "غير معروف";
  };

  // عمليات الإنشاء والتعديل
  const createClient = useMutation({
    mutationFn: (payload: { clientName: string; phone?: string | null }) => window.api.createClient(payload),
    onSuccess: (created: any) => {
      qc.setQueryData<any[]>(["clients"], (prev) => ([...(prev || []), created]));
      qc.invalidateQueries({ queryKey: ["clients"] });
      setClientError(null);
      setSearch("");
      setNewClientName("");
      setNewPhone("");
      setShowCreateClient(false);
      setSelectedClientId(created?.id ?? null);
      const fallbackName = newClientName?.trim?.() || "";
      setSelectedClientName(normalizeName(created?.name || created?.clientName || fallbackName));
      setShowDetails(true);
    },
    onError: () => setClientError("حدث خطأ أثناء إنشاء العميل."),
  });

  const updateClient = useMutation({
    mutationFn: (payload: { id?: number | null; clientName: string; phone?: string | null }) =>
      window.api.updateClient(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", "debts"] });
      setShowEditClient(false);
    },
    onError: () => setClientError("حدث خطأ أثناء تحديث العميل."),
  });

  const deleteClient = useMutation({
    mutationFn: (payload: { id: number }) => window.api.deleteClient(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", "debts"] });
      setShowDetails(false);
      alert("تم حذف العميل بنجاح.");
    },
    onError: (err: any) => alert(err.message || "حدث خطأ أثناء حذف العميل."),
  });

  const createDebt = useMutation({
    mutationFn: (payload: {
      clientId?: number | null;
      clientName: string;
      phone?: string | null;
      amount: number;
      reason?: string | null;
      note?: string | null;
      actorId?: number | null;
    }) => window.api.createDebt(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      setDebtError(null);
      setDebtAmount("");
      setDebtReason("");
      setDebtNote("");
      setShowAddDebt(false);
    },
    onError: () => setDebtError("حدث خطأ أثناء إضافة الدين."),
  });

  const updateDebt = useMutation({
    mutationFn: (payload: { id: number; amount: number; reason?: string | null; note?: string | null }) =>
      window.api.updateDebt(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      setShowEditDebt(false);
    },
    onError: () => alert("حدث خطأ أثناء التعديل"),
  });

  const addPayment = useMutation({
    mutationFn: (payload: { debtId: number; amount: number; note?: string; userId?: number | null }) =>
      window.api.addDebtPayment(payload),
    onSuccess: async (addedPayment, variables) => {
      // **FIX**: Fetch the latest users data directly from the cache to avoid stale closures.
      const usersData = qc.getQueryData<any[]>(["users"]) || [];
      const currentUser = usersData.find(u => u.id === variables.userId);
      
      qc.setQueryData<Debt[]>(["debts"], (old) => {
        if (!old) return [];
        return old.map((debt) => {
          if (debt.id === variables.debtId) {
            // Use the actual data returned from the backend if available,
            // otherwise, construct it from the variables.
            const newPaymentData: DebtPayment = {
              id: addedPayment?.id ?? Math.random(), // Use a temp ID if backend doesn't return one
              amount: Number(variables.amount),
              note: variables.note,
              createdAt: addedPayment?.createdAt ?? new Date().toISOString(),
              createdBy: { id: variables.userId, name: currentUser?.name ?? currentUser?.username ?? "أنت" },
            }
            return {
              ...debt,
              payments: [...(debt.payments || []), newPaymentData],
            };
          }
          return debt;
        });
      });
      
      setPayAmount("");
      setPayNote("");
      setShowAddPayment(false);
    },
    onError: () => {
      alert("حدث خطأ أثناء إضافة الدفعة");
    },
    onSettled: () => {
      // Invalidate to refetch from the server and get the real ID for the new payment.
      qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });

  const updatePayment = useMutation({
    mutationFn: (payload: { id: number; amount: number; note?: string | null }) =>
      window.api.updateDebtPayment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      setShowEditPayment(false);
    },
    onError: () => alert("حدث خطأ أثناء تعديل الدفعة"),
  });

  const markPaid = useMutation({
    mutationFn: (id: number) => window.api.markDebtPaid({ id, userId: getCurrentUserId() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
    onError: () => alert("حدث خطأ أثناء تسوية الدين"),
  });

  const debts = debtsQuery.data || [];
  const clientsRaw = clientsQuery.data || [];

  // تجميع العملاء من الديون والعملاء الخام
  const clients: Client[] = useMemo(() => {
    const map = new Map<string, Client>();
    debts.forEach((d) => {
      const dName = nameFromDebt(d);
      const key = keyFor(d.clientId, dName);
      const prev = map.get(key);
      const rem = remaining(d);
      map.set(key, {
        id: d.clientId ?? prev?.id ?? null,
        name: dName || prev?.name || "-",
        phone: prev?.phone ?? null,
        total: (prev?.total || 0) + rem,
      });
    });
    clientsRaw.forEach((c: any) => {
      const name = normalizeName(c.name || c.clientName || "-");
      const key = keyFor(c.id, name);
      if (!map.has(key)) {
        map.set(key, { id: c.id ?? null, name, phone: c.phone ?? null, total: 0 });
      }
    });
    const list = Array.from(map.values());
    const term = search.trim();
    const filtered = term ? list.filter((c) => c.name.includes(term)) : list;
    return filtered.sort((a, b) => b.total - a.total);
  }, [debts, clientsRaw, search]);

  const selectedClientKey =
    selectedClientId != null
      ? keyFor(selectedClientId, selectedClientName)
      : selectedClientName
      ? keyFor(null, selectedClientName)
      : null;

  const clientDebts = useMemo(
    () =>
      selectedClientKey
        ? debts.filter((d) => keyFor(d.clientId, nameFromDebt(d)) === selectedClientKey)
        : [],
    [debts, selectedClientKey]
  );
  const sortedClientDebts = useMemo(() => {
    return [...clientDebts].sort((a, b) => {
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad || b.id - a.id;
    });
  }, [clientDebts]);

  // تحديد أقدم دين غير مسدد لتوجيه الدفعة إليه تلقائياً (FIFO)
  const oldestUnpaidDebtId = useMemo(() => {
    const ascendingDebts = [...clientDebts].sort((a, b) => {
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ad - bd || a.id - b.id;
    });
    const target = ascendingDebts.find((d) => remaining(d) > 0.001);
    return target?.id ?? null;
  }, [clientDebts]);

  const outstandingTotal = useMemo(() => debts.reduce((s, d) => s + remaining(d), 0), [debts]);
  const openCount = useMemo(() => debts.filter((d) => remaining(d) > 0.001).length, [debts]);

  const allClientPayments = useMemo(
    () =>
      clientDebts.flatMap((d) => d.payments || []).sort((a, b) => {
        return (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
      }),
    [clientDebts]
  );
  const lastPaymentDate = useMemo(() => {
    const all = debts.flatMap((d) => d.payments || []);
    const dates = all
      .map((p) => (p.createdAt ? new Date(p.createdAt) : null))
      .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return dates[0] || null;
  }, [debts]);

  // المنطق
  const handleCreateClient = () => {
    if (!newClientName.trim()) {
      setClientError("الرجاء إدخال اسم العميل");
      return;
    }
    createClient.mutate({ clientName: newClientName.trim(), phone: newPhone || null });
  };

  const resolveClientName = () => {
    if (selectedClientName) return selectedClientName;
    const fromClients = clientsRaw.find((c: any) => c.id === selectedClientId);
    if (fromClients) return normalizeName(fromClients.name || fromClients.clientName);
    const fromDebts = debts.find((d) => d.clientId === selectedClientId);
    if (fromDebts) return normalizeName(fromDebts.clientName);
    return newClientName;
  };

  const handleAddDebt = () => {
    const name = resolveClientName();
    if (!name.trim()) {
      setDebtError("اسم العميل غير محدد");
      return;
    }
    const amountNum = Number(debtAmount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      setDebtError("الرجاء إدخال مبلغ صحيح.");
      return;
    }
    createDebt.mutate({
      clientId: selectedClientId || undefined,
      clientName: name.trim(),
      phone: newPhone || null,
      amount: amountNum,
      reason: debtReason || null,
      note: debtNote || null,
      actorId: getCurrentUserId(),
    });
  };

  const handleAddPayment = () => {
    const targetDebtId = oldestUnpaidDebtId;
    if (!targetDebtId) {
      alert("لا يوجد دين مفتوح لإضافة دفعة إليه.");
      return;
    }
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      alert("قيمة الدفعة غير صحيحة");
      return;
    }
    // Ensure we pass a numeric userId; fall back to localStorage if needed
    let uid = getCurrentUserId();
    try {
      if (!uid) {
        const raw = localStorage.getItem('currentUser');
        const parsed = raw ? JSON.parse(raw) : null;
        uid = parsed?.id ?? null;
      }
    } catch (e) {
      uid = uid ?? null;
    }

    addPayment.mutate({
      debtId: targetDebtId,
      amount: amt,
      note: payNote || undefined,
      userId: uid,
    });
  };

  const openClientDetails = (c: Client) => {
    setSelectedClientId(c.id ?? null);
    setSelectedClientName(normalizeName(c.name));
    setShowDetails(true);
  };

  const handleDeleteClient = () => {
    if (!selectedClientId) return;
    deleteClient.mutate({ id: selectedClientId });
  };

  // دالة لحساب الرصيد في لحظة دفع السند (تاريخياً)
  const calculateBalanceContext = (payment: DebtPayment, allDebts: Debt[]) => {
    if (!payment.createdAt) return { before: 0, after: 0 };
    
    const payTime = new Date(payment.createdAt).getTime();
    const payId = payment.id;

    // 1. حساب إجمالي الديون حتى لحظة هذه الدفعة
    const relevantDebts = allDebts.filter(d => {
        const dTime = d.createdAt ? new Date(d.createdAt).getTime() : 0;
        return dTime <= payTime; 
    });
    const totalDebtAtTime = relevantDebts.reduce((sum, d) => sum + Number(d.amount), 0);

    // 2. حساب إجمالي المدفوعات حتى لحظة هذه الدفعة (بما فيها هذه الدفعة)
    const allPayments = allDebts.flatMap(d => d.payments || []);
    const relevantPayments = allPayments.filter(p => {
        const pTime = p.createdAt ? new Date(p.createdAt).getTime() : 0;
        // الدفعات السابقة
        if (pTime < payTime) return true;
        // الدفعات في نفس الوقت (نستخدم المعرف لترتيبها)
        if (pTime === payTime) return p.id <= payId;
        return false;
    });
    const totalPaidAtTime = relevantPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    // 3. الاستنتاج
    const balanceAfter = totalDebtAtTime - totalPaidAtTime; // الرصيد بعد الدفعة
    const balanceBefore = balanceAfter + Number(payment.amount); // الرصيد قبل الدفعة

    return { before: balanceBefore, after: balanceAfter };
  };

  const handlePrintPayment = async (payment: DebtPayment) => {
    try {
      // حساب الأرصدة
      const { before, after } = calculateBalanceContext(payment, clientDebts);

      const receiptPayload = {
        type: 'payment', // نوع جديد مخصص لسندات القبض
        title: "سند قبض",
        invoice: {
          number: `PAY-${payment.id}`,
          date: payment.createdAt ? new Date(payment.createdAt).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US"),
          time: payment.createdAt ? new Date(payment.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleTimeString("en-US"),
          cashier: displayUser(payment),
          client: selectedClientName,
        },
        payment: {
            amount: Number(payment.amount),
            before: before,
            after: after,
            note: payment.note
        },
        footer: "سند قبض - شكراً لكم",
        qr: "https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL",
      };

      await window.api.printThermalReceipt(receiptPayload);
      toast({ title: "تمت الطباعة", description: "تم إرسال سند القبض إلى الطابعة." });
    } catch (err: any) {
      toast({ title: "خطأ", description: "فشل الطباعة.", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* الإحصائيات */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">إجمالي الديون القائمة</CardTitle>
            <Wallet className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(outstandingTotal)} د.ع</div>
            <p className="text-xs text-muted-foreground">المبلغ الإجمالي غير المسدد</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">الديون المفتوحة</CardTitle>
            <TrendingDown className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openCount}</div>
            <p className="text-xs text-muted-foreground">عدد الديون غير المسددة بالكامل</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">آخر دفعة</CardTitle>
            <Clock3 className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastPaymentDate ? lastPaymentDate.toLocaleDateString("en-US") : "لا يوجد"}
            </div>
            <p className="text-xs text-muted-foreground">تاريخ آخر دفعة مسجلة</p>
          </CardContent>
        </Card>
      </div>

      {/* العملاء */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">العملاء</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث عن عميل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Button
              size="sm"
              onClick={() => {
                setShowCreateClient(true);
                setNewClientName("");
                setNewPhone("");
              }}
            >
              <Plus className="w-4 h-4 ml-1" />
              إضافة عميل
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-10 h-10 animate-spin mb-2" />
              <p>جاري تحميل سجلات الديون...</p>
            </div>
          ) : (
            <>
          {clients.map((c) => (
            <Card key={`${c.id ?? "name"}-${c.name}`} className="border border-muted">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{c.name}</div>
                  <Badge variant="secondary">{fmt(c.total)} د.ع</Badge>
                </div>
                <div className="text-xs text-muted-foreground">إجمالي الدين المتبقي</div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => openClientDetails(c)}>
                  <Eye className="w-4 h-4 ml-1" />
                  عرض التفاصيل
                </Button>
              </CardContent>
            </Card>
          ))}
          {clients.length === 0 && <div className="text-sm text-muted-foreground">لا يوجد عملاء لعرضهم.</div>}
            </>
          )}
        </CardContent>
      </Card>

      {/* تفاصيل العميل */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-60">
          <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">تفاصيل العميل {selectedClientName ? `- ${selectedClientName}` : ""}</CardTitle>
              <div className="flex items-center gap-2">
                {clientDebts.length === 0 && selectedClientId && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteClient}
                    disabled={deleteClient.isPending}
                  >
                    <Trash2 className="w-4 h-4 ml-1" />
                    {deleteClient.isPending ? "جاري الحذف..." : "حذف العميل"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => {
                  setEditClientName(selectedClientName);
                  setShowEditClient(true);
                }}>
                  <Pencil className="w-4 h-4 ml-1" /> تعديل الاسم
                </Button> 
                <Button variant="ghost" size="icon" onClick={() => setShowDetails(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto max-h-[calc(90vh-150px)]">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  العميل: {selectedClientName || "-"} {selectedClientId ? `| الرقم: ${selectedClientId}` : ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  إجمالي الدين المتبقي: {fmt(clientDebts.reduce((s, d) => s + remaining(d), 0))} د.ع
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* الديون */}
                <div>
                  <div className="font-semibold mb-2 flex items-center justify-between">
                    <span>الديون</span>
                    <Button size="sm" onClick={() => setShowAddDebt(true)}>
                      إضافة دين
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {sortedClientDebts.map((d) => (
                        <Card key={d.id} className="border">
                        <CardContent className="p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">المبلغ: {fmt(d.amount)} د.ع</div>
                            <Badge variant={remaining(d) <= 0.001 ? "secondary" : "outline"} className={remaining(d) < -0.001 ? "bg-green-100 text-green-800" : ""}>
                              {remaining(d) <= 0.001 ? (remaining(d) < -0.001 ? `فائض ${fmt(Math.abs(remaining(d)))}` : "مسدد") : "غير مسدد"}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-sm">
                             <span className="text-muted-foreground">المدفوع: {fmt(sumPayments(d))}</span>
                             <span className={remaining(d) > 0 ? "text-red-600 font-bold" : "text-green-600"}>المتبقي: {fmt(remaining(d))}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">السبب: {d.reason || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            الكاشير: {displayUser(d.createdBy)}{" "}
                            {d.createdAt ? new Date(d.createdAt).toLocaleString("en-US") : ""}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditDebtId(d.id);
                                setEditDebtAmount(String(d.amount));
                                setEditDebtReason(d.reason || "");
                                setEditDebtNote(d.note || "");
                                setShowEditDebt(true);
                              }}
                            >
                              تعديل
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                      {sortedClientDebts.length === 0 && (
                        <div className="text-sm text-muted-foreground">لا توجد ديون مسجلة لهذا العميل.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* الدفعات */}
                <div>
                  <div className="font-semibold mb-2 flex items-center justify-between">
                    <span>الدفعات</span>
                    <Button size="sm" onClick={() => setShowAddPayment(true)} disabled={!selectedClientId}>
                      إضافة دفعة
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {allClientPayments.map((p) => (
                        <Card key={p.id} className="border">
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{fmt(p.amount)} د.ع</div>
                              <div className="text-xs text-muted-foreground">
                                {p.createdAt ? new Date(p.createdAt).toLocaleString("en-US") : ""}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">{p.note || "لا توجد ملاحظات"}</div>
                            <div className="text-xs text-muted-foreground">الكاشير: {displayUser(p)}</div>
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePrintPayment(p)}
                                title="طباعة سند قبض"
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditPaymentId(p.id);
                                  setEditPaymentAmount(String(p.amount));
                                  setEditPaymentNote(p.note || "");
                                  setShowEditPayment(true);
                                }}
                              >
                                تعديل
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    {allClientPayments.length === 0 && <div className="text-sm text-muted-foreground">لا توجد دفعات.</div>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* إضافة عميل جديد */}
      {showCreateClient && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-70">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">إضافة عميل جديد</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowCreateClient(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                autoFocus
                placeholder="اسم العميل"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
              <Input
                placeholder="رقم الهاتف (اختياري)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              {clientError && <div className="text-xs text-destructive">{clientError}</div>}
              <Button className="w-full" onClick={handleCreateClient} disabled={createClient.isPending}>
                {createClient.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* إضافة دين */}
      {showAddDebt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-70">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">إضافة دين</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowAddDebt(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">العميل: {selectedClientName || "-"}</div>
              <Input
                autoFocus
                placeholder="المبلغ"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
              />
              <Input
                placeholder="السبب (اختياري)"
                value={debtReason}
                onChange={(e) => setDebtReason(e.target.value)}
              />
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={debtNote}
                onChange={(e) => setDebtNote(e.target.value)}
              />
              {debtError && <div className="text-xs text-destructive">{debtError}</div>}
              <Button className="w-full" onClick={handleAddDebt} disabled={createDebt.isPending}>
                {createDebt.isPending ? "جاري الإضافة..." : "إضافة"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* إضافة دفعة */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-70">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">إضافة دفعة</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowAddPayment(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">سيتم إضافة الدفعة لأول دين غير مسدد.</div>
              <Input
                autoFocus
                placeholder="المبلغ"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
              <Button className="w-full" onClick={handleAddPayment} disabled={!selectedClientId || addPayment.isPending}>
                {addPayment.isPending ? "جاري الإضافة..." : "إضافة دفعة"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* تعديل دين */}
      {showEditDebt && editDebtId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-70">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">تعديل دين</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowEditDebt(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                autoFocus
                placeholder="المبلغ"
                value={editDebtAmount}
                onChange={(e) => setEditDebtAmount(e.target.value)}
              />
              <Input
                placeholder="السبب (اختياري)"
                value={editDebtReason}
                onChange={(e) => setEditDebtReason(e.target.value)}
              />
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={editDebtNote}
                onChange={(e) => setEditDebtNote(e.target.value)}
              />
              <Button
                className="w-full"
                onClick={() => {
                  const amt = Number(editDebtAmount);
                  if (!amt || amt <= 0) {
                    alert("المبلغ غير صالح");
                    return;
                  }
                  updateDebt.mutate({
                    id: editDebtId,
                    amount: amt,
                    reason: editDebtReason || null,
                    note: editDebtNote || null,
                  });
                }}
                disabled={updateDebt.isPending}
              >
                {updateDebt.isPending ? "جاري التعديل..." : "تعديل"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* تعديل دفعة */}
      {showEditPayment && editPaymentId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-70">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">تعديل دفعة</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowEditPayment(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                autoFocus
                placeholder="المبلغ"
                value={editPaymentAmount}
                onChange={(e) => setEditPaymentAmount(e.target.value)}
              />
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={editPaymentNote}
                onChange={(e) => setEditPaymentNote(e.target.value)}
              />
              <Button
                className="w-full"
                onClick={() => {
                  const amt = Number(editPaymentAmount);
                  if (!amt || amt <= 0) {
                    alert("المبلغ غير صالح");
                    return;
                  }
                  updatePayment.mutate({
                    id: editPaymentId,
                    amount: amt,
                    note: editPaymentNote || null,
                  });
                }}
                disabled={updatePayment.isPending}
              >
                {updatePayment.isPending ? "جاري التعديل..." : "تعديل الدفعة"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* تعديل اسم العميل */}
      {showEditClient && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-70">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">تعديل اسم العميل</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowEditClient(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                autoFocus
                placeholder="اسم العميل"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
              />
              <Button
                className="w-full"
                onClick={() => {
                  if (!editClientName.trim()) {
                    alert("الرجاء إدخال اسم العميل");
                    return;
                  }
                  updateClient.mutate({
                    id: selectedClientId || undefined,
                    clientName: editClientName.trim(),
                  });
                }}
                disabled={updateClient.isPending}
              >
                {updateClient.isPending ? "جاري التعديل..." : "تعديل الاسم"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DebtsPage;
