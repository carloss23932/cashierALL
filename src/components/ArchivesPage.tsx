import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Archive, RefreshCw, FileText, Calendar, Database } from "lucide-react";

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
};

const formatNumber = (value: number) => new Intl.NumberFormat("ar-IQ").format(Number(value || 0));

const formatCurrency = (value: number) => `${formatNumber(Number(value || 0))} د.ع`;


const formatSize = (bytes?: number) => {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const typeLabel = (type?: string) => {
  if (type === "sales") return "فواتير البيع";
  if (type === "purchase-invoices") return "فواتير الشراء";
  return "غير معروف";
};

const ArchivesPage = () => {
  const [selected, setSelected] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: archives = [], isLoading, refetch } = useQuery({
    queryKey: ["archives"],
    queryFn: () => window.api.listArchives(),
  });

  const sortedArchives = useMemo(() => {
    return [...archives].sort((a: any, b: any) => {
      const aTime = new Date(a?.modifiedAt || a?.generatedAt || 0).getTime();
      const bTime = new Date(b?.modifiedAt || b?.generatedAt || 0).getTime();
      return bTime - aTime;
    });
  }, [archives]);

  const openDetails = async (archive: any) => {
    try {
      const payload = await window.api.readArchive({ file: archive.file });
      setSelected(payload);
      setDetailOpen(true);
    } catch (e) {
      setSelected(null);
      setDetailOpen(true);
    }
  };

  const renderSummaryTable = () => {
    if (!selected?.summaryByDate || selected.summaryByDate.length === 0) {
      return <div className="text-sm text-slate-500">لا توجد ملخصات يومية.</div>;
    }

    const isSales = selected.type === "sales";
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">عدد السجلات</TableHead>
            <TableHead className="text-right">الإجمالي</TableHead>
            {isSales && <TableHead className="text-right">الخصم</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {selected.summaryByDate.map((row: any) => (
            <TableRow key={row.date}>
              <TableCell className="font-medium">{row.date}</TableCell>
              <TableCell>{formatNumber(row.count)}</TableCell>
              <TableCell>{formatCurrency(row.total ?? 0)}</TableCell>
              {isSales && <TableCell>{formatCurrency(row.discount ?? 0)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
            <Archive className="w-6 h-6" />
            الأرشيفات
          </h2>
          <p className="text-sm text-slate-500">عرض أرشيف التقارير والفواتير المحذوفة تلقائيًا.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          تحديث
        </Button>
      </div>

      <Card className="border-0 shadow-lg ring-1 ring-slate-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Database className="w-5 h-5 text-blue-600" />
            قائمة الأرشيفات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-slate-500 py-10">جاري التحميل...</div>
          ) : sortedArchives.length === 0 ? (
            <div className="text-center text-slate-500 py-10">لا توجد أرشيفات محفوظة.</div>
          ) : (
            <div className="space-y-3">
              {sortedArchives.map((archive: any) => (
                <div key={archive.file} className="border rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{typeLabel(archive.type)}</Badge>
                      <span className="text-sm text-slate-500">{archive.file}</span>
                    </div>
                    <div className="text-sm text-slate-600 flex flex-wrap gap-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {formatDateTime(archive.generatedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4 text-slate-400" />
                        الحجم: {formatSize(archive.size)}
                      </span>
                      {archive.range?.from && archive.range?.to && (
                        <span>المدى: {archive.range.from} → {archive.range.to}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => openDetails(archive)}>
                      عرض التفاصيل
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="px-6 pt-5 pb-4 bg-gradient-to-r from-slate-900 to-slate-700 text-white">
            <DialogTitle className="text-white flex items-center gap-2">
              <Archive className="w-5 h-5" />
              تفاصيل الأرشيف
            </DialogTitle>
            <p className="text-xs text-slate-200 mt-1">عرض ملخص سريع للتقارير والفواتير المؤرشفة.</p>
          </DialogHeader>
          {!selected ? (
            <div className="text-sm text-slate-500 px-6 py-8">تعذر تحميل تفاصيل الأرشيف.</div>
          ) : (
            <div className="space-y-6 px-6 py-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl border bg-slate-50">
                  <div className="text-xs text-slate-500">النوع</div>
                  <div className="font-bold text-slate-800">{typeLabel(selected.type)}</div>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50">
                  <div className="text-xs text-slate-500">تاريخ الإنشاء</div>
                  <div className="font-bold text-slate-800">{formatDateTime(selected.generatedAt)}</div>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50">
                  <div className="text-xs text-slate-500">المدى</div>
                  <div className="font-bold text-slate-800">
                    {selected.range?.from || "-"} → {selected.range?.to || "-"}
                  </div>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50">
                  <div className="text-xs text-slate-500">مدة الاحتفاظ</div>
                  <div className="font-bold text-slate-800">{selected.retentionDays || "-"} يوم</div>
                </div>
              </div>

              {selected.counts && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border bg-white">
                    <div className="text-xs text-slate-500">عدد السجلات</div>
                    <div className="text-lg font-bold text-blue-700">
                      {formatNumber(selected.counts.sales || selected.counts.invoices || 0)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border bg-white">
                    <div className="text-xs text-slate-500">المرتجعات</div>
                    <div className="text-lg font-bold text-rose-600">
                      {formatNumber(selected.counts.returns || 0)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border bg-white">
                    <div className="text-xs text-slate-500">عدد الأيام</div>
                    <div className="text-lg font-bold text-emerald-700">
                      {formatNumber(selected.summaryByDate?.length || 0)}
                    </div>
                  </div>
                </div>
              )}

              <Card className="border-0 shadow-sm ring-1 ring-slate-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-700">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    ملخص يومي
                  </CardTitle>
                </CardHeader>
                <CardContent>{renderSummaryTable()}</CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArchivesPage;
