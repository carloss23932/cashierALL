﻿﻿﻿import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Clock3, TrendingDown, TrendingUp, X, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { getCurrentUserId } from "@/lib/auth";

type UserRef = string | { id?: any; username?: string; name?: string } | null | undefined;

type DebtPayment = {
  id: number;
  amount: number;
  note?: string | null;
  createdAt?: string | null;
  createdBy?: UserRef;
  user?: UserRef; // تمت الإضافة لتتوافق مع schema.prisma
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

const fmt = (n: number) => new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(n);
const normalizeName = (val: any): string =>
  typeof val === "string"
    ? val
    : val?.name || val?.username || val?.clientName || (val?.id != null ? String(val.id) : "-");
const nameFromDebt = (d: Debt): string => normalizeName((d as any)?.client?.name ?? d.clientName);
const sumPayments = (d?: Debt) => (d?.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
const remaining = (d: Debt) => Math.max(0, Number(d.amount || 0) - sumPayments(d));
const keyFor = (id?: number | null, name?: string | null) => (id != null ? `id:${id}` : `name:${name || "-"}`);

const DebtsPage: React.FC = () => {
  const qc = useQueryClient();

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
    queryFn: () => window.api.listDebts(),
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

  const displayUser = (userOrPayment: any) => {
    if (!userOrPayment) return "غير معروف";
    if (typeof userOrPayment === "string") return userOrPayment;

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
      // Optimistically update the debts data
      qc.setQueryData<Debt[]>(["debts"], (old) => {
        if (!old) return [];
        // Fetch the latest users data directly from the cache to avoid stale closures
        const usersData = qc.getQueryData<any[]>(["users"]) || [];
        const currentUser = usersData.find((u) => u.id === variables.userId);

        return old.map((debt) => {
          if (debt.id === variables.debtId) {
            // Use the actual data returned from the backend if available,
            // otherwise, construct it from the variables.
            const newPaymentData: DebtPayment = {
              id: addedPayment?.id ?? Math.random(), // Use a temp ID if backend doesn't return one
              amount: variables.amount,
              note: variables.note,
              createdAt: addedPayment?.createdAt ?? new Date().toISOString(),
              user: { id: variables.userId, name: currentUser?.name ?? currentUser?.username ?? "أنت" }, // تحديث متفائل
            };
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
  const firstUnpaidDebtId = useMemo(() => {
    const target = sortedClientDebts.find((d) => remaining(d) > 0);
    return target?.id ?? null;
  }, [sortedClientDebts]);

  const outstandingTotal = useMemo(() => debts.reduce((s, d) => s + remaining(d), 0), [debts]);
  const openCount = useMemo(() => debts.filter((d) => remaining(d) > 0).length, [debts]);

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
    const targetDebtId = firstUnpaidDebtId;
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
    const confirmation = window.confirm(`هل أنت متأكد من رغبتك في حذف العميل "${selectedClientName}"؟ لا يمكن التراجع عن هذا الإجراء.`);
    if (confirmation) {
      deleteClient.mutate({ id: selectedClientId });
    }
  };

  const handleTestPrint = async () => {
    // 1. تجميع بيانات الإيصال في كائن صريح ومحدد
    const now = new Date();
    const receiptPayload = {
      store: {
        name: "اسم المحل",
        address: "العنوان هنا، بغداد",
        phone: "123-456-7890",
      },
      invoice: {
        number: 123,
        date: now.toLocaleDateString("ar-IQ"),
        time: now.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }),
        items: [
          { name: "منتج عربي 1", qty: 2, price: 1500, total: 3000 },
          { name: "Another Item", qty: 1, price: 3000, total: 3000 },
        ],
        total: 6000,
      },
      footer: "شكراً لزيارتكم!",
    };

    try {
      alert("جاري إرسال أمر الطباعة...");
      // 2. إرسال كائن الإيصال مباشرة إلى Electron
      await window.api.printThermalReceipt(receiptPayload);
      alert("تم إرسال الإيصال إلى الطابعة بنجاح!");
    } catch (error: any) {
      alert(`فشلت الطباعة: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6">
      {/* الإحصائيات */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/20 to-blue-500/10 border border-blue-500/20 p-6 backdrop-blur-xl transition-all duration-300 hover:border-blue-400/40 hover:from-blue-600/30 hover:to-blue-500/20">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex flex-row items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-blue-100/70">إجمالي الديون القائمة</h3>
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-400/30">
              <Wallet className="w-5 h-5 text-blue-300" />
            </div>
          </div>
          <div className="relative">
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-200 to-blue-100 bg-clip-text text-transparent">{fmt(outstandingTotal)}</div>
            <div className="text-blue-200/50 text-xs mt-1">د.ع المبلغ الإجمالي غير المسدد</div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600/20 to-red-500/10 border border-red-500/20 p-6 backdrop-blur-xl transition-all duration-300 hover:border-red-400/40 hover:from-red-600/30 hover:to-red-500/20">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex flex-row items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-red-100/70">الديون المفتوحة</h3>
            <div className="p-2 rounded-lg bg-red-500/20 border border-red-400/30">
              <TrendingDown className="w-5 h-5 text-red-300" />
            </div>
          </div>
          <div className="relative">
            <div className="text-3xl font-bold bg-gradient-to-r from-red-200 to-red-100 bg-clip-text text-transparent">{openCount}</div>
            <div className="text-red-200/50 text-xs mt-1">عدد الديون غير المسددة بالكامل</div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 to-emerald-500/10 border border-emerald-500/20 p-6 backdrop-blur-xl transition-all duration-300 hover:border-emerald-400/40 hover:from-emerald-600/30 hover:to-emerald-500/20">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex flex-row items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-emerald-100/70">آخر دفعة</h3>
            <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-400/30">
              <Clock3 className="w-5 h-5 text-emerald-300" />
            </div>
          </div>
          <div className="relative">
            <div className="text-3xl font-bold bg-gradient-to-r from-emerald-200 to-emerald-100 bg-clip-text text-transparent">
              {lastPaymentDate ? lastPaymentDate.toLocaleDateString("ar-IQ") : "لا يوجد"}
            </div>
            <div className="text-emerald-200/50 text-xs mt-1">تاريخ آخر دفعة مسجلة</div>
          </div>
        </div>
      </div>

      {/* العملاء */}
      <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl overflow-hidden">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">العملاء</h2>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative">
              <Input
                placeholder="🔍 بحث عن عميل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60 transition-all w-full md:w-64"
              />
            </div>
            <Button 
              size="sm" 
              onClick={() => {
                setShowCreateClient(true);
                setNewClientName("");
                setNewPhone("");
              }}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 rounded-lg transition-all duration-300"
            >
              <Plus className="w-4 h-4 ml-2" />
              إضافة عميل
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-6">
          {clients.map((c) => (
            <div 
              key={`${c.id ?? "name"}-${c.name}`} 
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 border border-slate-600/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-slate-500/80 hover:from-slate-700/60 hover:to-slate-800/60 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
              onClick={() => openClientDetails(c)}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-slate-100 text-lg">{c.name}</div>
                    <div className="text-xs text-slate-400 mt-1">إجمالي الدين المتبقي</div>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-gradient-to-r from-blue-600/40 to-blue-500/40 border border-blue-400/50 text-blue-100 text-sm font-semibold whitespace-nowrap">
                    {fmt(c.total)} د.ع
                  </div>
                </div>
                <Button 
                  size="sm" 
                  className="w-full bg-blue-600/60 hover:bg-blue-600/80 text-blue-50 border border-blue-400/30 rounded-lg transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    openClientDetails(c);
                  }}
                >
                  <Eye className="w-4 h-4 ml-2" />
                  عرض التفاصيل
                </Button>
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-12">
              <div className="text-sm text-slate-400">لا يوجد عملاء لعرضهم.</div>
            </div>
          )}
        </div>
      </div>

      {/* تفاصيل العميل */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-60 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
                تفاصيل العميل {selectedClientName ? `- ${selectedClientName}` : ""}
              </h2>
              <div className="flex items-center gap-2">
                {clientDebts.length === 0 && selectedClientId && (
                  <Button
                    size="sm"
                    onClick={handleDeleteClient}
                    disabled={deleteClient.isPending}
                    className="bg-red-600/60 hover:bg-red-600/80 text-red-50 border border-red-400/30 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4 ml-2" />
                    {deleteClient.isPending ? "جاري الحذف..." : "حذف العميل"}
                  </Button>
                )}
                <Button 
                  size="sm" 
                  onClick={() => {
                    setEditClientName(selectedClientName);
                    setShowEditClient(true);
                  }}
                  className="bg-slate-700/60 hover:bg-slate-700/80 text-slate-100 border border-slate-600/50 rounded-lg transition-all"
                >
                  <Pencil className="w-4 h-4 ml-2" /> 
                  تعديل الاسم
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowDetails(false)}
                  className="text-slate-400 hover:bg-slate-700/50 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-150px)] p-6 space-y-6">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="px-4 py-3 rounded-lg bg-slate-700/40 border border-slate-600/50">
                  <div className="text-xs text-slate-400 mb-1">العميل</div>
                  <div className="text-lg font-semibold text-slate-100">{selectedClientName || "-"}</div>
                  {selectedClientId && <div className="text-xs text-slate-500 mt-1">الرقم: {selectedClientId}</div>}
                </div>
                <div className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-500/30">
                  <div className="text-xs text-blue-300 mb-1">إجمالي الدين المتبقي</div>
                  <div className="text-lg font-semibold text-blue-100">
                    {fmt(clientDebts.reduce((s, d) => s + remaining(d), 0))} د.ع
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* الديون */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-100 text-lg">الديون</h3>
                    <Button 
                      size="sm" 
                      onClick={() => setShowAddDebt(true)}
                      className="bg-emerald-600/60 hover:bg-emerald-600/80 text-emerald-50 border border-emerald-400/30 rounded-lg transition-all text-xs"
                    >
                      <Plus className="w-3 h-3 ml-1" />
                      إضافة
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                    {sortedClientDebts.map((d) => (
                      <div key={d.id} className="group rounded-lg border border-slate-600/50 bg-gradient-to-br from-slate-700/40 to-slate-800/40 p-3 hover:border-slate-500/80 hover:from-slate-700/60 hover:to-slate-800/60 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-slate-100">{fmt(d.amount)} د.ع</div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            remaining(d) === 0 
                              ? "bg-emerald-600/40 text-emerald-100 border border-emerald-400/50" 
                              : "bg-red-600/40 text-red-100 border border-red-400/50"
                          }`}>
                            {remaining(d) === 0 ? "✓ مسدد" : `${fmt(remaining(d))} متبقي`}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          {d.reason && <div>السبب: {d.reason}</div>}
                          <div className="flex items-center justify-between">
                            <div>الكاشير: {displayUser(d.createdBy)}</div>
                            {d.createdAt && <div>{new Date(d.createdAt).toLocaleString("ar-IQ")}</div>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full mt-2 text-slate-300 hover:text-slate-100 hover:bg-slate-600/50"
                          onClick={() => {
                            setEditDebtId(d.id);
                            setEditDebtAmount(String(d.amount));
                            setEditDebtReason(d.reason || "");
                            setEditDebtNote(d.note || "");
                            setShowEditDebt(true);
                          }}
                        >
                          <Pencil className="w-3 h-3 ml-2" />
                          تعديل
                        </Button>
                      </div>
                    ))}
                    {sortedClientDebts.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                        لا توجد ديون مسجلة لهذا العميل.
                      </div>
                    )}
                  </div>
                </div>

                {/* الدفعات */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-100 text-lg">الدفعات</h3>
                    <Button 
                      size="sm" 
                      onClick={() => setShowAddPayment(true)} 
                      disabled={!selectedClientId}
                      className="bg-emerald-600/60 hover:bg-emerald-600/80 text-emerald-50 border border-emerald-400/30 rounded-lg transition-all text-xs disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3 ml-1" />
                      إضافة
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                    {allClientPayments.map((p) => (
                      <div key={p.id} className="group rounded-lg border border-slate-600/50 bg-gradient-to-br from-slate-700/40 to-slate-800/40 p-3 hover:border-slate-500/80 hover:from-slate-700/60 hover:to-slate-800/60 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-emerald-100">{fmt(p.amount)} د.ع</div>
                          {p.createdAt && (
                            <div className="text-xs text-slate-400">
                              {new Date(p.createdAt).toLocaleString("ar-IQ")}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <div>{p.note || "لا توجد ملاحظات"}</div>
                          <div>الكاشير: {displayUser(p)}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full mt-2 text-slate-300 hover:text-slate-100 hover:bg-slate-600/50"
                          onClick={() => {
                            setEditPaymentId(p.id);
                            setEditPaymentAmount(String(p.amount));
                            setEditPaymentNote(p.note || "");
                            setShowEditPayment(true);
                          }}
                        >
                          <Pencil className="w-3 h-3 ml-2" />
                          تعديل
                        </Button>
                      </div>
                    ))}
                    {allClientPayments.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                        لا توجد دفعات.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* إضافة عميل جديد */}
      {showCreateClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">إضافة عميل جديد</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowCreateClient(false)} className="text-slate-400 hover:bg-slate-700/50">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">اسم العميل</label>
                <Input
                  autoFocus
                  placeholder="أدخل اسم العميل"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">رقم الهاتف (اختياري)</label>
                <Input
                  placeholder="أدخل رقم الهاتف"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              {clientError && <div className="text-xs text-red-400 bg-red-600/10 border border-red-500/30 rounded-lg p-2">{clientError}</div>}
              <Button className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 rounded-lg transition-all duration-300" onClick={handleCreateClient} disabled={createClient.isPending}>
                {createClient.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* إضافة دين */}
      {showAddDebt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">إضافة دين</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowAddDebt(false)} className="text-slate-400 hover:bg-slate-700/50">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-sm text-blue-200">
                العميل: {selectedClientName || "-"}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">المبلغ</label>
                <Input
                  autoFocus
                  placeholder="أدخل المبلغ"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">السبب (اختياري)</label>
                <Input
                  placeholder="أدخل السبب"
                  value={debtReason}
                  onChange={(e) => setDebtReason(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">ملاحظات (اختياري)</label>
                <Textarea
                  placeholder="أدخل الملاحظات"
                  value={debtNote}
                  onChange={(e) => setDebtNote(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60 resize-none"
                />
              </div>
              {debtError && <div className="text-xs text-red-400 bg-red-600/10 border border-red-500/30 rounded-lg p-2">{debtError}</div>}
              <Button className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 rounded-lg transition-all duration-300" onClick={handleAddDebt} disabled={createDebt.isPending}>
                {createDebt.isPending ? "جاري الإضافة..." : "إضافة"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* إضافة دفعة */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">إضافة دفعة</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowAddPayment(false)} className="text-slate-400 hover:bg-slate-700/50">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-sm text-emerald-200">
                سيتم إضافة الدفعة لأول دين غير مسدد.
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">المبلغ</label>
                <Input
                  autoFocus
                  placeholder="أدخل المبلغ"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">ملاحظات (اختياري)</label>
                <Textarea
                  placeholder="أدخل الملاحظات"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60 resize-none"
                />
              </div>
              <Button className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white border-0 rounded-lg transition-all duration-300" onClick={handleAddPayment} disabled={!selectedClientId || addPayment.isPending}>
                {addPayment.isPending ? "جاري الإضافة..." : "إضافة دفعة"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* تعديل دين */}
      {showEditDebt && editDebtId != null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">تعديل دين</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowEditDebt(false)} className="text-slate-400 hover:bg-slate-700/50">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">المبلغ</label>
                <Input
                  autoFocus
                  placeholder="أدخل المبلغ"
                  value={editDebtAmount}
                  onChange={(e) => setEditDebtAmount(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">السبب (اختياري)</label>
                <Input
                  placeholder="أدخل السبب"
                  value={editDebtReason}
                  onChange={(e) => setEditDebtReason(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">ملاحظات (اختياري)</label>
                <Textarea
                  placeholder="أدخل الملاحظات"
                  value={editDebtNote}
                  onChange={(e) => setEditDebtNote(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60 resize-none"
                />
              </div>
              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 rounded-lg transition-all duration-300"
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
            </div>
          </div>
        </div>
      )}

      {/* تعديل دفعة */}
      {showEditPayment && editPaymentId != null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">تعديل دفعة</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowEditPayment(false)} className="text-slate-400 hover:bg-slate-700/50">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">المبلغ</label>
                <Input
                  autoFocus
                  placeholder="أدخل المبلغ"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">ملاحظات (اختياري)</label>
                <Textarea
                  placeholder="أدخل الملاحظات"
                  value={editPaymentNote}
                  onChange={(e) => setEditPaymentNote(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60 resize-none"
                />
              </div>
              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 rounded-lg transition-all duration-300"
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
            </div>
          </div>
        </div>
      )}

      {/* تعديل اسم العميل */}
      {showEditClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">تعديل اسم العميل</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowEditClient(false)} className="text-slate-400 hover:bg-slate-700/50">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">اسم العميل</label>
                <Input
                  autoFocus
                  placeholder="أدخل اسم العميل"
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="bg-slate-700/40 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-slate-700/60"
                />
              </div>
              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 rounded-lg transition-all duration-300"
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtsPage;
