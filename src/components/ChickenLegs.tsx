import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface Entry {
  id: string;
  name: string;
  reason: string;
  quantity: number;
  note?: string;
  date: string; // YYYY-MM-DD
}

const DEFAULT_PRICE_PER_ITEM = 6500;

const ChickenLegs = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // اليوم الجديد يبدأ 1 صباحاً
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10));
  const [startingStockInput, setStartingStockInput] = useState<number>(0);
  const [pricePerItem, setPricePerItem] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("chickenPrice");
      return raw ? Number(raw) : DEFAULT_PRICE_PER_ITEM;
    } catch (e) {
      return DEFAULT_PRICE_PER_ITEM;
    }
  });
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState<number>(pricePerItem);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [note, setNote] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["chicken-logs", selectedDate],
    queryFn: () => window.api.listChickenLogs({ date: selectedDate }),
  });

  const dayData = data || { startingStock: 0, logs: [] };
  const { startingStock, logs }: { startingStock: number; logs: Entry[] } = {
    startingStock: dayData.startingStock ?? 0,
    logs: dayData.logs || [],
  };

  useEffect(() => {
    // مزامنة حقل الإدخال مع الرصيد القادم من الخادم عند تغيير التاريخ/تحميل البيانات.
    setStartingStockInput(startingStock);
  }, [startingStock]);

  useEffect(() => {
    setPriceInput(pricePerItem);
  }, [pricePerItem]);

  const aggregated = useMemo(() => {
    const map = new Map<string, { quantity: number; reason: string; note?: string }>();
    logs.forEach((e) => {
      const current = map.get(e.name);
      if (current) {
        map.set(e.name, { quantity: current.quantity + e.quantity, reason: current.reason, note: current.note || e.note });
      } else {
        map.set(e.name, { quantity: e.quantity, reason: e.reason, note: e.note });
      }
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }));
  }, [logs]);

  const totalOut = aggregated.reduce((sum, item) => sum + item.quantity, 0);
  const remaining = Math.max(0, startingStock - totalOut);
  const totalValue = totalOut * pricePerItem;

  const setStartMutation = useMutation({
    mutationFn: (stock: number) => window.api.setChickenDay({ date: selectedDate, startingStock: stock }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chicken-logs", selectedDate] });
      toast({ title: "تم حفظ رصيد أول اليوم" });
    },
    onError: (err: any) => {
      const msg = err?.message || "تعذر حفظ الرصيد";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    },
  });

  const createLogMutation = useMutation({
    mutationFn: (payload: { name: string; reason: string; quantity: number; note?: string; date: string }) =>
      window.api.createChickenLog(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chicken-logs", selectedDate] });
      setName("");
      setReason("");
      setQuantity("");
      setNote("");
      toast({ title: "تم تسجيل الحركة" });
    },
    onError: (err: any) => {
      const msg = err?.message || "تعذر تسجيل الحركة";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    },
  });

  const addEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !reason.trim() || !quantity || quantity <= 0) return;
    if (remaining <= 0) {
      toast({
        title: "لا يوجد رصيد متاح",
        description: "حدد رصيد أول اليوم ثم أعد المحاولة.",
        variant: "destructive",
      });
      return;
    }
    createLogMutation.mutate({
      name: name.trim(),
      reason: reason.trim(),
      quantity: Number(quantity),
      note: note.trim() || undefined,
      date: selectedDate,
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-blue-800">
            دجاج الأرجل (متابعة يومية)
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              الباقي: {remaining} دجاجة
            </Badge>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                سعر الواحدة: {pricePerItem.toLocaleString()} دينار
              </Badge>
              {editingPrice ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={priceInput}
                    onChange={(e) => setPriceInput(Number(e.target.value) || 0)}
                    className="w-28"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const val = Number(priceInput) || DEFAULT_PRICE_PER_ITEM;
                      setPricePerItem(val);
                      try {
                        localStorage.setItem("chickenPrice", String(val));
                      } catch (e) {}
                      setEditingPrice(false);
                      toast({ title: "تم تحديث سعر الدجاج" });
                    }}
                  >
                    حفظ
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingPrice(false)}>
                    إلغاء
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditingPrice(true)}>
                  تغيير السعر
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-3">
            <div className="md:col-span-2">
              <Label className="text-sm">تاريخ</Label>
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">رصيد أول اليوم (عدد الدجاج)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={startingStockInput}
                  onChange={(e) => setStartingStockInput(Number(e.target.value) || 0)}
                  min={0}
                />
                <Button type="button" variant="outline" onClick={() => setStartMutation.mutate(startingStockInput)} disabled={setStartMutation.isPending}>
                  حفظ
                </Button>
              </div>
              <div className="text-xs text-gray-500 mt-1">الرصيد الحالي: {startingStock} دجاجة</div>
            </div>
          </div>

          <form onSubmit={addEntry} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-2">
              <Label className="text-sm">الاسم</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المستلم أو الجهة" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">الكمية</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                min={1}
                placeholder="0"
              />
            </div>
            <div className="md:col-span-3">
              <Label className="text-sm">سبب/وجهة الخروج</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: توصيل طلب / مطعم / تالف ..." />
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">ملاحظة</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
            </div>
            <div className="md:col-span-1">
              <Button type="submit" className="w-full">تسجيل</Button>
            </div>
          </form>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-3 bg-emerald-50 border-emerald-100">
              <div className="text-sm text-emerald-700">رصيد أول اليوم</div>
              <div className="text-lg font-semibold text-emerald-900">{startingStock} دجاجة</div>
            </Card>
            <Card className="p-3 bg-rose-50 border-rose-100">
              <div className="text-sm text-rose-700">إجمالي الخارج اليوم</div>
              <div className="text-lg font-semibold text-rose-900">{totalOut} دجاجة</div>
              <div className="text-sm text-rose-700">قيمة الخارج: {totalValue.toLocaleString()} دينار</div>
            </Card>
            <Card className="p-3 bg-blue-50 border-blue-100">
              <div className="text-sm text-blue-700">المتبقي الآن</div>
              <div className="text-lg font-semibold text-blue-900">{remaining} دجاجة</div>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="text-blue-800">حركة اليوم (تجميع حسب الاسم)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-gray-500 py-6">جاري التحميل...</div>
          ) : aggregated.length === 0 ? (
            <div className="text-center text-gray-500 py-6">لا توجد حركات مسجلة لهذا التاريخ.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                  <TableHead className="text-right">السبب</TableHead>
                  <TableHead className="text-right">ملاحظة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-semibold">{row.name}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell className="text-gray-600">{row.note || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChickenLegs;
