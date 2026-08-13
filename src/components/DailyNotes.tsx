import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { NotebookPen, Edit, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type NoteType = "increase" | "decrease";

interface NoteEntry {
  id: string | number;
  type: NoteType;
  amount: number;
  text: string;
  createdAt: string | null;
  noteDate: string | null;
}

const DailyNotes = ({ currentUser }: { currentUser?: any }) => {
  const [noteText, setNoteText] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [type, setType] = useState<NoteType>("increase");
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // حساب تاريخ اليوم (يبدأ 1 صباحاً)
  const getBusinessDate = () => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState<string>(getBusinessDate());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["daily-notes", filterDate],
    queryFn: () => window.api.listDailyNotes({ date: filterDate, limit: 1000 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { type: NoteType; amount: number; text: string; date: string }) =>
      window.api.createDailyNote(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-notes", filterDate] });
      setNoteText("");
      setAmount("");
    },
    onError: (err: any) => {
      const msg = (err && err.message) ? String(err.message) : "حدث خطأ أثناء حفظ الملاحظة";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; type: NoteType; amount: number; text: string }) =>
      window.api.updateDailyNote(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-notes", filterDate] });
      cancelEdit();
      toast({ title: "تم التعديل", description: "تم تعديل الملاحظة بنجاح." });
    },
    onError: (err: any) => {
      const msg = (err && err.message) ? String(err.message) : "فشل التعديل";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.deleteDailyNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-notes", filterDate] });
      toast({ title: "تم الحذف", description: "تم حذف الملاحظة." });
    },
    onError: (err: any) => {
      const msg = (err && err.message) ? String(err.message) : "فشل الحذف";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    },
  });

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const nd = (e as any).noteDate;
      if (nd == null) return false;
      let iso = "";
      if (typeof nd === "string") {
        iso = nd;
      } else if (typeof nd === "number") {
        iso = new Date(nd).toISOString();
      } else if (nd instanceof Date) {
        iso = nd.toISOString();
      } else if (typeof nd === "object" && typeof nd.toISOString === "function") {
        try {
          iso = (nd as any).toISOString();
        } catch {
          iso = String(nd);
        }
      } else {
        iso = String(nd);
      }
      
      // تحويل تاريخ الملاحظة (UTC) إلى تاريخ العمل (UTC+2) للمقارنة
      const d = new Date(iso);
      d.setUTCHours(d.getUTCHours() + 2);
      return d.toISOString().slice(0, 10) === filterDate;
    });
  }, [entries, filterDate]);
  const totalIn = filteredEntries.filter((e) => e.type === "increase").reduce((sum, e) => sum + e.amount, 0);
  const totalOut = filteredEntries.filter((e) => e.type === "decrease").reduce((sum, e) => sum + e.amount, 0);

  const parseNote = (rawText: string) => {
    const delimiter = "|||USER|||";
    if (!rawText || typeof rawText !== 'string' || !rawText.includes(delimiter)) {
      return { text: rawText || "", user: null };
    }
    const parts = rawText.split(delimiter);
    const text = parts[0];
    let user = null;
    try {
      user = JSON.parse(parts[1]);
    } catch (e) {}
    return { text, user };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !noteText.trim()) return;
    
    const delimiter = "|||USER|||";

    if (editingId) {
      const originalEntry = entries.find((e: any) => e.id === editingId);
      const { user: originalUser } = parseNote((originalEntry as any)?.text);
      
      let finalText = noteText.trim();
      if (originalUser) {
        finalText += delimiter + JSON.stringify(originalUser);
      }

      updateMutation.mutate({
        id: editingId,
        type,
        amount: Number(amount),
        text: finalText,
      });
    } else {
      let finalText = noteText.trim();
      if (currentUser) {
        finalText += delimiter + JSON.stringify({ id: currentUser.id, name: currentUser.name || currentUser.username });
      }
      createMutation.mutate({
        type,
        amount: Number(amount),
        text: finalText,
        date: filterDate,
      });
    }
  };

  const cancelEdit = () => {
    setNoteText("");
    setAmount("");
    setEditingId(null);
    setType("increase");
  };

  const handleEdit = (entry: any) => {
    const { text, user } = parseNote(entry.text);
    
    if (user && currentUser && user.id !== currentUser.id) {
      toast({ title: "تنبيه", description: "لا يمكنك تعديل ملاحظة مستخدم آخر.", variant: "destructive" });
      return;
    }

    setEditingId(entry.id);
    setAmount(entry.amount);
    setNoteText(text);
    setType(entry.type as NoteType);
  };

  const handleDelete = (entry: any) => {
    const { user } = parseNote(entry.text);
    if (user && currentUser && user.id !== currentUser.id) {
      toast({ title: "تنبيه", description: "لا يمكنك حذف ملاحظة مستخدم آخر.", variant: "destructive" });
      return;
    }
    deleteMutation.mutate(entry.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-3 text-slate-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all">
          <NotebookPen className="w-5 h-5 text-emerald-600" />
          <span>ملاحظات اليوم</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto daily-notes-content" dir="rtl">
        <DialogHeader>
          <DialogDescription className="sr-only">نافذة إدارة الملاحظات اليومية والمصاريف</DialogDescription>
          <div className="space-y-4 pb-2">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3 text-slate-900">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <NotebookPen className="w-5 h-5 text-white" />
              </div>
              ملاحظات اليوم
              <span className="text-xs font-normal text-slate-500 ml-2">(المخزون المالي الأساسي)</span>
            </DialogTitle>

            {/* ملخص الأرقام */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 p-4">
                <div className="text-xs text-emerald-600 font-medium mb-1">💰 الدخل</div>
                <div className="text-2xl font-bold text-emerald-700">{totalIn.toLocaleString()}</div>
                <div className="text-[11px] text-emerald-600/70">دينار</div>
              </div>
              
              <div className="rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 p-4">
                <div className="text-xs text-rose-600 font-medium mb-1">📤 الخرج</div>
                <div className="text-2xl font-bold text-rose-700">{totalOut.toLocaleString()}</div>
                <div className="text-[11px] text-rose-600/70">دينار</div>
              </div>
              
              <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 p-4">
                <div className="text-xs text-blue-600 font-medium mb-1">⚖️ الصافي</div>
                <div className={`text-2xl font-bold ${(totalIn - totalOut) >= 0 ? 'text-blue-700' : 'text-blue-700'}`}>
                  {(totalIn - totalOut).toLocaleString()}
                </div>
                <div className="text-[11px] text-blue-600/70">دينار</div>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 p-4">
                <div className="text-xs text-slate-600 font-medium mb-1">📊 العدد</div>
                <div className="text-2xl font-bold text-slate-700">{filteredEntries.length}</div>
                <div className="text-[11px] text-slate-600/70">ملاحظة</div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 border-t pt-4">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <Label className="text-sm font-semibold">📅 عرض ملاحظات تاريخ</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="rounded-lg border-slate-200"
              />
            </div>
          </div>

          <Card className="bg-gradient-to-br from-white to-slate-50/50 border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <Label className="text-sm font-semibold mb-2 block">النوع</Label>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant={type === "increase" ? "default" : "outline"} 
                      className={`flex-1 ${type === "increase" ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md' : 'border-slate-200'}`}
                      onClick={() => setType("increase")}
                    >
                      ➕ زيادة
                    </Button>
                    <Button 
                      type="button" 
                      variant={type === "decrease" ? "destructive" : "outline"} 
                      className={`flex-1 ${type === "decrease" ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-md' : 'border-slate-200'}`}
                      onClick={() => setType("decrease")}
                    >
                      ➖ نقصان
                    </Button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-semibold mb-2 block">المبلغ</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    min={0}
                    className="rounded-lg border-slate-200 font-semibold"
                  />
                </div>
                <div className="md:col-span-7">
                  <Label className="text-sm font-semibold mb-2 block">ملاحظة</Label>
                  <Input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="مثال: سحب للمورد / إيداع من المبيعات ..."
                    className="rounded-lg border-slate-200"
                  />
                </div>
                <div className="md:col-span-1">
                  {editingId ? (
                    <div className="flex gap-1">
                      <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md" title="حفظ التعديل">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" onClick={cancelEdit} title="إلغاء" className="border-slate-200">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md">
                      ✔️ حفظ
                    </Button>
                  )}
                </div>
              </form>

              {isLoading ? (
                <div className="mt-6 text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-500 mb-2"></div>
                  <div className="text-sm text-slate-500">جاري التحميل...</div>
                </div>
              ) : filteredEntries.length > 0 ? (
                <div className="mt-6 space-y-2">
                  {filteredEntries.map((entry, idx) => {
                    const { text: displayText, user: creator } = parseNote(entry.text);
                    const isIncrease = entry.type === "increase";
                    return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between p-4 rounded-xl border backdrop-blur-sm transition-all hover:shadow-md ${
                        isIncrease
                          ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-emerald-200 hover:border-emerald-300'
                          : 'bg-gradient-to-r from-rose-50 to-rose-100/50 border-rose-200 hover:border-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
                          isIncrease
                            ? 'bg-emerald-200/50 text-emerald-700'
                            : 'bg-rose-200/50 text-rose-700'
                        }`}>
                          {isIncrease ? '📈' : '📉'}
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="text-sm font-semibold text-slate-900">{displayText}</div>
                          {creator && <div className="text-xs text-slate-500">👤 {creator.name}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`text-lg font-bold whitespace-nowrap ${
                          isIncrease ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {isIncrease ? '+' : '−'} {entry.amount.toLocaleString()}
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`h-8 w-8 rounded-lg transition-all ${isIncrease ? 'hover:bg-emerald-200/50' : 'hover:bg-rose-200/50'}`}
                            onClick={() => handleEdit(entry)}
                          >
                            <Edit className={`w-4 h-4 ${isIncrease ? 'text-emerald-600' : 'text-rose-600'}`} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`h-8 w-8 rounded-lg transition-all ${isIncrease ? 'hover:bg-emerald-200/50' : 'hover:bg-rose-200/50'}`}
                            onClick={() => handleDelete(entry)}
                          >
                            <Trash2 className={`w-4 h-4 ${isIncrease ? 'text-emerald-600' : 'text-rose-600'}`} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              ) : (
                <div className="mt-6 text-center py-12">
                  <div className="text-3xl mb-2">📝</div>
                  <div className="text-sm text-slate-500">لا توجد ملاحظات لهذا التاريخ</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DailyNotes;
