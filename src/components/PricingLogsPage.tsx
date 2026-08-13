import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calculator, History, Tag } from "lucide-react";

const sourceLabels: Record<string, string> = {
  "product-create": "إنشاء منتج",
  "product-edit": "تعديل منتج",
  "server-product-upsert": "تعديل من الخادم",
  "purchase-invoice-create": "فاتورة شراء جديدة",
  "purchase-invoice-update": "تعديل فاتورة شراء",
  "auto-pricing-batch": "تشغيل التسعير الآن",
  "auto-pricing-purchase": "تسعير تلقائي بعد فاتورة شراء",
  "auto-pricing-manual-product-edit": "تعديل يدوي لكلفة المنتج",
  "auto-pricing-server-product-edit": "تعديل كلفة المنتج من الخادم",
};

const modeLabels: Record<string, string> = {
  manual: "يدوي",
  auto: "تلقائي",
};

const PricingLogsPage = () => {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["pricing-logs", { dateFrom, dateTo, search, source }],
    queryFn: () => window.api.listPricingLogs({ dateFrom, dateTo, search, source, limit: 1000 }),
  });

  const formatPrice = (value: any) =>
    new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 2 }).format(Number(value || 0));

  const formatPercent = (value: any) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return `${Number(value).toFixed(2)}%`;
  };

  const explainLog = (log: any) => {
    const calc = log?.calculation;
    if (calc) {
      return {
        title: calc.mode === "preserve" ? "الحفاظ على نسبة الربح الحالية" : "اعتماد نسب ثابتة من الإعدادات",
        unitSteps: [
          `تكلفة القطعة القديمة = ${formatPrice(calc.oldBoxPurchasePrice)} / ${calc.unitsPerBox} = ${formatPrice(calc.oldUnitCost)}`,
          `تكلفة القطعة الجديدة = ${formatPrice(calc.newBoxPurchasePrice)} / ${calc.unitsPerBox} = ${formatPrice(calc.newUnitCost)}`,
          `نسبة ربح القطعة المستخدمة = ${formatPercent(calc.unitMarkupPercent)}`,
          `سعر القطعة قبل التقريب = ${formatPrice(calc.newUnitCost)} * (1 + ${Number(calc.unitMarkupPercent || 0).toFixed(4)} / 100) = ${formatPrice(calc.rawUnitSale)}`,
          `سعر القطعة بعد التقريب = ${formatPrice(calc.roundedUnitSale)}`,
        ],
        boxSteps: [
          `شراء الكرتون الجديد = ${formatPrice(calc.newBoxPurchasePrice)}`,
          `نسبة ربح الكرتون المستخدمة = ${formatPercent(calc.boxMarkupPercent)}`,
          `سعر الكرتون قبل التقريب = ${formatPrice(calc.newBoxPurchasePrice)} * (1 + ${Number(calc.boxMarkupPercent || 0).toFixed(4)} / 100) = ${formatPrice(calc.rawBoxSale)}`,
          `سعر الكرتون بعد التقريب = ${formatPrice(calc.roundedBoxSale)}`,
        ],
        footer: `طريقة التقريب: ${calc.roundMode === "up" ? "للأعلى دائمًا" : "لأقرب قيمة"} | خطوة التقريب: ${formatPrice(calc.roundTo)} | منع البيع بأقل من الشراء: ${calc.preventLoss ? "نعم" : "لا"}`,
      };
    }

    const before = log?.before || {};
    const after = log?.after || {};
    const units = Number(after.unitsPerBox ?? before.unitsPerBox ?? 1) || 1;
    return {
      title: "تفاصيل مشتقة من القيم المسجلة",
      unitSteps: [
        `تكلفة القطعة قبل التغيير = ${formatPrice(before.boxPurchasePrice)} / ${units} = ${formatPrice(before.unitCost)}`,
        `سعر القطعة قبل التغيير = ${formatPrice(before.unitPrice)}`,
        `ربح القطعة قبل التغيير = ${formatPrice(before.unitProfitAmount)} (${formatPercent(before.unitProfitPercent)})`,
        `تكلفة القطعة بعد التغيير = ${formatPrice(after.boxPurchasePrice)} / ${units} = ${formatPrice(after.unitCost)}`,
        `سعر القطعة بعد التغيير = ${formatPrice(after.unitPrice)}`,
        `ربح القطعة بعد التغيير = ${formatPrice(after.unitProfitAmount)} (${formatPercent(after.unitProfitPercent)})`,
      ],
      boxSteps: [
        `شراء الكرتون قبل التغيير = ${formatPrice(before.boxPurchasePrice)}`,
        `سعر الكرتون قبل التغيير = ${formatPrice(before.boxSalePrice)}`,
        `ربح الكرتون قبل التغيير = ${formatPrice(before.boxProfitAmount)} (${formatPercent(before.boxProfitPercent)})`,
        `شراء الكرتون بعد التغيير = ${formatPrice(after.boxPurchasePrice)}`,
        `سعر الكرتون بعد التغيير = ${formatPrice(after.boxSalePrice)}`,
        `ربح الكرتون بعد التغيير = ${formatPrice(after.boxProfitAmount)} (${formatPercent(after.boxProfitPercent)})`,
      ],
      footer: "هذا السجل قديم أو يدوي، لذلك عُرضت التفاصيل المشتقة من القيم المسجلة فقط.",
    };
  };

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-2xl font-bold text-blue-800">سجل التسعيرات</h2>

      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <History className="w-6 h-6" />
            فلترة سجل التسعيرات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>بحث</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم المنتج أو الملاحظة" />
            </div>
            <div className="space-y-2">
              <Label>المصدر</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.entries(sourceLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="invisible">تحديث</Label>
              <Button variant="outline" className="w-full" onClick={() => refetch()}>
                تحديث
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">جاري تحميل سجل التسعيرات...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">لا توجد سجلات تسعير مطابقة للفلاتر الحالية.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right min-w-[180px]">المنتج</TableHead>
                    <TableHead className="text-right min-w-[140px]">المصدر</TableHead>
                    <TableHead className="text-right min-w-[260px]">التغييرات</TableHead>
                    <TableHead className="text-right min-w-[220px]">الربح</TableHead>
                    <TableHead className="text-right min-w-[180px]">الوقت</TableHead>
                    <TableHead className="text-right min-w-[120px]">الحساب</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium align-top">
                        <div>{log.productName || `منتج #${log.productId}`}</div>
                        <div className="text-xs text-slate-500">ID: {log.productId ?? "-"}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2">
                          <Badge variant="outline" className="w-fit">
                            <Tag className="w-3 h-3 ml-1" />
                            {sourceLabels[log.source] || log.source}
                          </Badge>
                          <Badge variant="secondary" className="w-fit">
                            {modeLabels[log.mode] || log.mode}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div>شراء الكرتون: {formatPrice(log.before?.boxPurchasePrice)} → {formatPrice(log.after?.boxPurchasePrice)}</div>
                        <div>سعر القطعة: {formatPrice(log.before?.unitPrice)} → {formatPrice(log.after?.unitPrice)}</div>
                        <div>سعر الكرتون: {formatPrice(log.before?.boxSalePrice)} → {formatPrice(log.after?.boxSalePrice)}</div>
                        <div className="text-xs text-slate-500">عدد القطع: {log.after?.unitsPerBox ?? log.before?.unitsPerBox ?? "-"}</div>
                        {log.note ? <div className="text-xs text-slate-500 mt-1">{log.note}</div> : null}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div>ربح القطعة: {formatPrice(log.before?.unitProfitAmount)} → {formatPrice(log.after?.unitProfitAmount)}</div>
                        <div>نسبة القطعة: {formatPercent(log.before?.unitProfitPercent)} → {formatPercent(log.after?.unitProfitPercent)}</div>
                        <div>ربح الكرتون: {formatPrice(log.before?.boxProfitAmount)} → {formatPrice(log.after?.boxProfitAmount)}</div>
                        <div>نسبة الكرتون: {formatPercent(log.before?.boxProfitPercent)} → {formatPercent(log.after?.boxProfitPercent)}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        {new Date(log.createdAt).toLocaleString("ar-IQ", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="align-top">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelectedLog(log)}>
                          <Calculator className="w-4 h-4" />
                          التفاصيل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {selectedLog ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  تفاصيل عملية التسعير
                </DialogTitle>
                <DialogDescription>
                  {selectedLog.productName || `منتج #${selectedLog.productId}`} - {sourceLabels[selectedLog.source] || selectedLog.source}
                </DialogDescription>
              </DialogHeader>

              {(() => {
                const details = explainLog(selectedLog);
                return (
                  <div className="space-y-4">
                    <Card className="border-slate-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{details.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-slate-700">
                        {details.unitSteps.map((step, index) => (
                          <div key={`unit-${index}`} className="p-2 rounded-lg bg-slate-50">{step}</div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">حساب الكرتون</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-slate-700">
                        {details.boxSteps.map((step, index) => (
                          <div key={`box-${index}`} className="p-2 rounded-lg bg-slate-50">{step}</div>
                        ))}
                      </CardContent>
                    </Card>

                    <div className="text-xs text-slate-500">{details.footer}</div>
                  </div>
                );
              })()}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PricingLogsPage;
