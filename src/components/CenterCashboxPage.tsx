import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, Pencil, RefreshCw, Trash2, Wallet } from "lucide-react";

const TEXT = {
  pageTitle: "\u0642\u0627\u0635\u0629 \u0627\u0644\u0645\u0631\u0643\u0632",
  pageSubtitle: "\u0633\u062c\u0644 \u0645\u0628\u0627\u0644\u063a \u0627\u0644\u0642\u0627\u0635\u0629 \u0648\u062a\u0623\u062b\u064a\u0631\u0647\u0627 \u0639\u0644\u0649 \u0635\u0627\u0641\u064a \u0627\u0644\u0635\u0646\u062f\u0648\u0642.",
  adminOnly: "\u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u0645\u062a\u0627\u062d\u0629 \u0644\u0644\u0645\u062f\u064a\u0631 \u0641\u0642\u0637.",
  withdrawRestrictedTitle: "\u063a\u064a\u0631 \u0645\u0633\u0645\u0648\u062d",
  withdrawRestrictedDescription: "\u0627\u0644\u0633\u062d\u0628 \u0645\u0646 \u0627\u0644\u0642\u0627\u0635\u0629 \u0645\u062a\u0627\u062d \u0644\u0644\u0645\u062f\u064a\u0631 \u0641\u0642\u0637.",
  invalidAmountTitle: "\u0642\u064a\u0645\u0629 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629",
  invalidAmountDescription: "\u0623\u062f\u062e\u0644 \u0645\u0628\u0644\u063a\u064b\u0627 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631.",
  adminFallback: "\u0627\u0644\u0625\u062f\u0627\u0631\u0629",
  createFailedTitle: "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0627\u0644\u0639\u0645\u0644\u064a\u0629",
  createFailedDescription: "\u0641\u0634\u0644 \u062a\u0633\u062c\u064a\u0644 \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629.",
  createSuccessTitle: "\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u062d\u0631\u0643\u0629",
  createDepositSuccess: "\u062a\u0645 \u0625\u064a\u062f\u0627\u0639 \u0645\u0628\u0644\u063a \u0641\u064a \u0627\u0644\u0642\u0627\u0635\u0629.",
  createWithdrawalSuccess: "\u062a\u0645 \u0633\u062d\u0628 \u0645\u0628\u0644\u063a \u0645\u0646 \u0627\u0644\u0642\u0627\u0635\u0629.",
  updateFailedTitle: "\u062a\u0639\u0630\u0631 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u062d\u0631\u0643\u0629",
  updateFailedDescription: "\u0641\u0634\u0644 \u062a\u0639\u062f\u064a\u0644 \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629.",
  updateSuccessTitle: "\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u062d\u0631\u0643\u0629",
  updateSuccessDescription: "\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a \u0639\u0644\u0649 \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629.",
  deleteFailedTitle: "\u062a\u0639\u0630\u0631 \u062d\u0630\u0641 \u0627\u0644\u062d\u0631\u0643\u0629",
  deleteFailedDescription: "\u0641\u0634\u0644 \u062d\u0630\u0641 \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629.",
  deleteSuccessTitle: "\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u062d\u0631\u0643\u0629",
  deleteSuccessDescription: "\u062d\u064f\u0630\u0641\u062a \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629 \u0628\u0646\u062c\u0627\u062d.",
  deleteConfirmPrefix: "\u062d\u0630\u0641 \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629 \u0628\u0645\u0628\u0644\u063a",
  deleteConfirmSuffix: "\u062f.\u0639\u061f",
  exportFailedTitle: "\u062a\u0639\u0630\u0631 \u0627\u0644\u062a\u0635\u062f\u064a\u0631",
  exportFailedDescription: "\u0641\u0634\u0644 \u062a\u0635\u062f\u064a\u0631 \u0633\u062c\u0644 \u0627\u0644\u0642\u0627\u0635\u0629.",
  exportSuccessTitle: "\u062a\u0645 \u0627\u0644\u062a\u0635\u062f\u064a\u0631",
  exportSuccessDescriptionPrefix: "\u062a\u0645 \u062a\u0635\u062f\u064a\u0631",
  exportSuccessDescriptionSuffix: "\u062d\u0631\u0643\u0629 \u0625\u0644\u0649 \u0645\u0644\u0641 CSV.",
  refresh: "\u062a\u062d\u062f\u064a\u062b",
  exportCsv: "\u062a\u0635\u062f\u064a\u0631 CSV",
  exporting: "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u0635\u062f\u064a\u0631...",
  currentBalance: "\u0631\u0635\u064a\u062f \u0627\u0644\u0642\u0627\u0635\u0629 \u0627\u0644\u062d\u0627\u0644\u064a",
  currentBalanceHint: "\u0647\u0630\u0627 \u0627\u0644\u0631\u0635\u064a\u062f \u064a\u064f\u062e\u0635\u0645 \u0645\u0646 \u0635\u0627\u0641\u064a \u0627\u0644\u0635\u0646\u062f\u0648\u0642 \u0627\u0644\u062d\u0627\u0644\u064a.",
  totalDeposits: "\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0625\u064a\u062f\u0627\u0639",
  totalDepositsHint: "\u0625\u064a\u062f\u0627\u0639 \u0625\u0644\u0649 \u0627\u0644\u0642\u0627\u0635\u0629 = \u062e\u0635\u0645 \u0645\u0646 \u0627\u0644\u0635\u0646\u062f\u0648\u0642.",
  totalWithdrawals: "\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0633\u062d\u0628",
  totalWithdrawalsHint: "\u0633\u062d\u0628 \u0645\u0646 \u0627\u0644\u0642\u0627\u0635\u0629 = \u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0635\u0627\u0641\u064a \u0627\u0644\u0635\u0646\u062f\u0648\u0642.",
  addMovement: "\u0625\u0636\u0627\u0641\u0629 \u062d\u0631\u0643\u0629 \u062c\u062f\u064a\u062f\u0629",
  movementType: "\u0646\u0648\u0639 \u0627\u0644\u062d\u0631\u0643\u0629",
  deposit: "\u0625\u064a\u062f\u0627\u0639 \u0625\u0644\u0649 \u0627\u0644\u0642\u0627\u0635\u0629",
  withdrawal: "\u0633\u062d\u0628 \u0645\u0646 \u0627\u0644\u0642\u0627\u0635\u0629",
  amount: "\u0627\u0644\u0645\u0628\u0644\u063a",
  amountPlaceholder: "\u0645\u062b\u0627\u0644: 25000",
  note: "\u0645\u0644\u0627\u062d\u0638\u0629",
  notePlaceholder: "\u0633\u0628\u0628 \u0627\u0644\u062d\u0631\u0643\u0629 \u0623\u0648 \u0648\u0635\u0641 \u0645\u062e\u062a\u0635\u0631",
  saveMovement: "\u062d\u0641\u0638 \u0627\u0644\u062d\u0631\u0643\u0629",
  saving: "\u062c\u0627\u0631\u064d \u0627\u0644\u062d\u0641\u0638...",
  tableTitle: "\u062d\u0631\u0643\u0627\u062a \u0627\u0644\u0642\u0627\u0635\u0629",
  loading: "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u062d\u0631\u0643\u0627\u062a...",
  empty: "\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0631\u0643\u0627\u062a \u0645\u0633\u062c\u0644\u0629 \u0641\u064a \u0627\u0644\u0642\u0627\u0635\u0629.",
  date: "\u0627\u0644\u062a\u0627\u0631\u064a\u062e",
  type: "\u0627\u0644\u0646\u0648\u0639",
  by: "\u0628\u0648\u0627\u0633\u0637\u0629",
  actions: "\u0625\u062c\u0631\u0627\u0621\u0627\u062a",
  edit: "\u062a\u0639\u062f\u064a\u0644",
  remove: "\u062d\u0630\u0641",
  lastEditPrefix: "\u0622\u062e\u0631 \u062a\u0639\u062f\u064a\u0644:",
  editDialogTitle: "\u062a\u0639\u062f\u064a\u0644 \u062d\u0631\u0643\u0629 \u0627\u0644\u0642\u0627\u0635\u0629",
  editDialogDescription: "\u0639\u062f\u0651\u0644 \u0646\u0648\u0639 \u0627\u0644\u062d\u0631\u0643\u0629 \u0623\u0648 \u0627\u0644\u0645\u0628\u0644\u063a \u0623\u0648 \u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0629\u060c \u062b\u0645 \u0627\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a.",
  cancel: "\u0625\u0644\u063a\u0627\u0621",
  saveChanges: "\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a",
  updating: "\u062c\u0627\u0631\u064d \u0627\u0644\u062d\u0641\u0638...",
};

const DEFAULT_FORM = {
  type: "deposit",
  amount: "",
  note: "",
};

const CenterCashboxPage = ({ currentUser }: { currentUser?: any }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === "admin";
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(DEFAULT_FORM);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const { data: entries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["center-cashbox-entries"],
    queryFn: () => window.api.listCenterCashboxEntries({ limit: 1000 }),
  });

  const summary = useMemo(() => {
    return (entries || []).reduce(
      (acc: any, entry: any) => {
        const value = Number(entry.amount || 0);
        if (!(value > 0)) return acc;
        if (entry.type === "withdrawal") {
          acc.withdrawals += value;
          acc.balance -= value;
          acc.drawerEffect += value;
        } else {
          acc.deposits += value;
          acc.balance += value;
          acc.drawerEffect -= value;
        }
        return acc;
      },
      { deposits: 0, withdrawals: 0, balance: 0, drawerEffect: 0 }
    );
  }, [entries]);

  const refreshEntries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["center-cashbox-entries"] });
  };

  const resetCreateForm = () => setForm(DEFAULT_FORM);

  const handleCreate = async () => {
    if (form.type === "withdrawal" && !isAdmin) {
      toast({
        title: TEXT.withdrawRestrictedTitle,
        description: TEXT.withdrawRestrictedDescription,
        variant: "destructive",
      });
      return;
    }

    const numericAmount = Number(form.amount);
    if (!(numericAmount > 0)) {
      toast({ title: TEXT.invalidAmountTitle, description: TEXT.invalidAmountDescription, variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await window.api.createCenterCashboxEntry({
        type: form.type,
        amount: numericAmount,
        note: form.note,
        actorRole: currentUser?.role,
        createdById: currentUser?.id,
        createdByName: currentUser?.name || currentUser?.username || TEXT.adminFallback,
      });

      if (!res?.ok) {
        throw new Error(res?.error || TEXT.createFailedDescription);
      }

      resetCreateForm();
      await refreshEntries();
      toast({
        title: TEXT.createSuccessTitle,
        description: form.type === "deposit" ? TEXT.createDepositSuccess : TEXT.createWithdrawalSuccess,
      });
    } catch (error: any) {
      toast({
        title: TEXT.createFailedTitle,
        description: error?.message || TEXT.createFailedDescription,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (entry: any) => {
    setEditingEntry(entry);
    setEditForm({
      type: entry.type === "withdrawal" ? "withdrawal" : "deposit",
      amount: String(entry.amount ?? ""),
      note: entry.note || "",
    });
  };

  const closeEditDialog = () => {
    setEditingEntry(null);
    setEditForm(DEFAULT_FORM);
  };

  const handleUpdate = async () => {
    if (!editingEntry) return;
    const numericAmount = Number(editForm.amount);
    if (!(numericAmount > 0)) {
      toast({ title: TEXT.invalidAmountTitle, description: TEXT.invalidAmountDescription, variant: "destructive" });
      return;
    }

    setIsEditSubmitting(true);
    try {
      const res = await window.api.updateCenterCashboxEntry({
        id: editingEntry.id,
        type: editForm.type,
        amount: numericAmount,
        note: editForm.note,
        actorRole: currentUser?.role,
        updatedById: currentUser?.id,
        updatedByName: currentUser?.name || currentUser?.username || TEXT.adminFallback,
      });
      if (!res?.ok) throw new Error(res?.error || TEXT.updateFailedDescription);

      await refreshEntries();
      closeEditDialog();
      toast({ title: TEXT.updateSuccessTitle, description: TEXT.updateSuccessDescription });
    } catch (error: any) {
      toast({
        title: TEXT.updateFailedTitle,
        description: error?.message || TEXT.updateFailedDescription,
        variant: "destructive",
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDelete = async (entry: any) => {
    if (!entry?.id) return;
    const confirmed = window.confirm(`${TEXT.deleteConfirmPrefix} ${formatCurrency(entry.amount)} ${TEXT.deleteConfirmSuffix}`);
    if (!confirmed) return;

    try {
      const res = await window.api.deleteCenterCashboxEntry({ id: entry.id, actorRole: currentUser?.role });
      if (!res?.ok) throw new Error(res?.error || TEXT.deleteFailedDescription);

      await refreshEntries();
      toast({ title: TEXT.deleteSuccessTitle, description: TEXT.deleteSuccessDescription });
    } catch (error: any) {
      toast({
        title: TEXT.deleteFailedTitle,
        description: error?.message || TEXT.deleteFailedDescription,
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await window.api.exportCenterCashboxCsv({ limit: 5000 });
      if (res?.canceled) return;
      if (!res?.ok) throw new Error(res?.error || TEXT.exportFailedDescription);

      toast({
        title: TEXT.exportSuccessTitle,
        description: `${TEXT.exportSuccessDescriptionPrefix} ${res.count || 0} ${TEXT.exportSuccessDescriptionSuffix}`,
      });
    } catch (error: any) {
      toast({
        title: TEXT.exportFailedTitle,
        description: error?.message || TEXT.exportFailedDescription,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };



  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-blue-800">{TEXT.pageTitle}</h2>
          <p className="text-sm text-slate-500">{TEXT.pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            {TEXT.refresh}
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExport} disabled={isExporting}>
            <FileSpreadsheet className="w-4 h-4" />
            {isExporting ? TEXT.exporting : TEXT.exportCsv}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{TEXT.currentBalance}</CardTitle>
            <Wallet className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{formatCurrency(summary.balance)} {"\u062f.\u0639"}</div>
            <p className="text-xs text-muted-foreground">{TEXT.currentBalanceHint}</p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{TEXT.totalDeposits}</CardTitle>
            <ArrowDownLeft className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.deposits)} {"\u062f.\u0639"}</div>
            <p className="text-xs text-muted-foreground">{TEXT.totalDepositsHint}</p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{TEXT.totalWithdrawals}</CardTitle>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.withdrawals)} {"\u062f.\u0639"}</div>
            <p className="text-xs text-muted-foreground">{TEXT.totalWithdrawalsHint}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="text-blue-800">{TEXT.addMovement}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{TEXT.movementType}</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="deposit">{TEXT.deposit}</SelectItem>
                  {isAdmin && (
                    <SelectItem value="withdrawal">{TEXT.withdrawal}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {!isAdmin && (
                <div className="text-xs text-amber-700">{TEXT.withdrawRestrictedDescription}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label>{TEXT.amount}</Label>
              <Input
                type="number"
                min="0"
                step="250"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder={TEXT.amountPlaceholder}
              />
            </div>

            <div className="space-y-2">
              <Label>{TEXT.note}</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder={TEXT.notePlaceholder}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button className="gap-2" onClick={handleCreate} disabled={isSubmitting}>
              <Wallet className="w-4 h-4" />
              {isSubmitting ? TEXT.saving : TEXT.saveMovement}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="text-blue-800">{TEXT.tableTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">{TEXT.loading}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">{TEXT.empty}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{TEXT.date}</TableHead>
                    <TableHead className="text-right">{TEXT.type}</TableHead>
                    <TableHead className="text-right">{TEXT.amount}</TableHead>
                    <TableHead className="text-right">{TEXT.note}</TableHead>
                    <TableHead className="text-right">{TEXT.by}</TableHead>
                    {isAdmin && <TableHead className="text-right">{TEXT.actions}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {new Date(entry.createdAt).toLocaleString("ar-IQ", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className={entry.type === "deposit" ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>
                        {entry.type === "deposit" ? TEXT.deposit : TEXT.withdrawal}
                      </TableCell>
                      <TableCell>{formatCurrency(entry.amount)} {"\u062f.\u0639"}</TableCell>
                      <TableCell className="max-w-[260px] whitespace-normal break-words">{entry.note || "-"}</TableCell>
                      <TableCell>
                        <div>{entry.updatedByName || entry.createdByName || "-"}</div>
                        {entry.updatedAt && entry.updatedAt !== entry.createdAt ? (
                          <div className="text-xs text-slate-500">
                            {TEXT.lastEditPrefix}{" "}
                            {new Date(entry.updatedAt).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" })}
                          </div>
                        ) : null}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openEditDialog(entry)}
                            >
                              <Pencil className="w-4 h-4" />
                              {TEXT.edit}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1"
                              onClick={() => handleDelete(entry)}
                            >
                              <Trash2 className="w-4 h-4" />
                              {TEXT.remove}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{TEXT.editDialogTitle}</DialogTitle>
            <DialogDescription>{TEXT.editDialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{TEXT.movementType}</Label>
              <Select
                value={editForm.type}
                onValueChange={(value) =>
                  setEditForm((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="deposit">{TEXT.deposit}</SelectItem>
                  {isAdmin && (
                    <SelectItem value="withdrawal">{TEXT.withdrawal}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{TEXT.amount}</Label>
              <Input
                type="number"
                min="0"
                step="250"
                value={editForm.amount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{TEXT.note}</Label>
              <Input
                value={editForm.note}
                onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder={TEXT.notePlaceholder}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              {TEXT.cancel}
            </Button>
            <Button onClick={handleUpdate} disabled={isEditSubmitting}>
              {isEditSubmitting ? TEXT.updating : TEXT.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CenterCashboxPage;
