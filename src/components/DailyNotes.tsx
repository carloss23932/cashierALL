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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto daily-notes-content" dir="rtl">
        <DialogHeader>
          <DialogDescription className="sr-only">نافذة إدارة الملاحظات اليومية والمصاريف</DialogDescription>
          <DialogTitle className="flex items-center gap-3 text-blue-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ملاحظات اليوم (المخزون المالي الأساسي)
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              دخل: {totalIn.toLocaleString()} دينار
            </Badge>
            <Badge variant="secondary" className="bg-rose-50 text-rose-700 border-rose-200">
              خرج: {totalOut.toLocaleString()} دينار
            </Badge>
            <Badge variant="outline" className="text-blue-700 border-blue-200">
              الصافي: {(totalIn - totalOut).toLocaleString()} دينار
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <Label className="text-sm">عرض ملاحظات تاريخ</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
          </div>

          <Card className="bg-white/70 backdrop-blur-sm border-blue-100">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <Label className="text-sm">النوع</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={type === "increase" ? "default" : "outline"} className="flex-1" onClick={() => setType("increase")}>
                      زيادة
                    </Button>
                    <Button type="button" variant={type === "decrease" ? "destructive" : "outline"} className="flex-1" onClick={() => setType("decrease")}>
                      نقصان
                    </Button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm">المبلغ</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    min={0}
                  />
                </div>
                <div className="md:col-span-7">
                  <Label className="text-sm">ملاحظة</Label>
                  <Input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="مثال: سحب للمورد / إيداع من المبيعات ..."
                  />
                </div>
                <div className="md:col-span-1">
                  {editingId ? (
                    <div className="flex gap-1">
                      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" title="حفظ التعديل"><Edit className="w-4 h-4" /></Button>
                      <Button type="button" variant="outline" onClick={cancelEdit} title="إلغاء"><X className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    <Button type="submit" className="w-full">حفظ</Button>
                  )}
                </div>
              </form>

              {isLoading ? (
                <div className="mt-4 text-center text-gray-500">جاري التحميل...</div>
              ) : filteredEntries.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {filteredEntries.map((entry) => {
                    const { text: displayText, user: creator } = parseNote(entry.text);
                    return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 border-blue-100"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className={entry.type === "increase" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"}
                        >
                          {entry.type === "increase" ? "زيادة" : "نقصان"}
                        </Badge>
                        <div className="flex flex-col">
                          <div className="text-sm text-gray-800">{displayText}</div>
                          {creator && <div className="text-[10px] text-slate-400">كتبها: {creator.name}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm font-semibold text-blue-800">
                          {entry.amount.toLocaleString()} دينار
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(entry)}>
                            <Edit className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(entry)}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              ) : (
                <div className="mt-4 text-center text-gray-500">لا توجد ملاحظات لهذا التاريخ.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DailyNotes;
