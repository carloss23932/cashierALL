import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, User, FileText, Edit2, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface InvoiceChangeLog {
  id: string;
  invoiceType: "purchase" | "sale";
  invoiceId: string;
  userId?: number;
  userName?: string;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  description?: string;
  createdAt: string;
}

const InvoiceChangeLogs = () => {
  const [filterType, setFilterType] = useState<"purchase" | "sale" | "all">("all");
  const [searchInvoiceId, setSearchInvoiceId] = useState("");
  const [selectedLog, setSelectedLog] = useState<InvoiceChangeLog | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const { data: allLogs = [], isLoading } = useQuery({
    queryKey: ["invoice-changes", filterType],
    queryFn: async () => {
      const result = await (window as any).api.listInvoiceChanges({
        invoiceType: filterType === "all" ? undefined : filterType,
        limit: 1000
      });
      return result || [];
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  const filteredLogs = allLogs.filter((log: InvoiceChangeLog) => {
    if (searchInvoiceId && !log.invoiceId.includes(searchInvoiceId)) {
      return false;
    }
    return true;
  });

  const formatDateTime = (date: string) => {
    try {
      return new Date(date).toLocaleString("ar-SA");
    } catch {
      return date;
    }
  };

  const getTypeColor = (type: string) => {
    return type === "purchase" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800";
  };

  const getTypeLabel = (type: string) => {
    return type === "purchase" ? "فاتورة شراء" : "فاتورة بيع";
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "create":
        return "إنشاء";
      case "update":
        return "تعديل";
      case "delete":
        return "حذف";
      default:
        return action;
    }
  };

  const parseJsonValue = (value: string) => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            سجل تعديلات الفواتير
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">نوع الفاتورة</label>
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="purchase">فواتير الشراء</SelectItem>
                  <SelectItem value="sale">فواتير البيع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">البحث برقم الفاتورة</label>
              <Input
                placeholder="ابحث برقم الفاتورة..."
                value={searchInvoiceId}
                onChange={(e) => setSearchInvoiceId(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <p className="text-sm text-gray-600">
                عدد التعديلات: <span className="font-bold">{filteredLogs.length}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <CardTitle>سجل التغييرات</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              لا توجد تعديلات
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ والوقت</TableHead>
                    <TableHead className="text-right">نوع الفاتورة</TableHead>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                    <TableHead className="text-right">المستخدم</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log: InvoiceChangeLog) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{formatDateTime(log.createdAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={getTypeColor(log.invoiceType)}>
                          {getTypeLabel(log.invoiceType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {log.invoiceId.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">
                          {getActionLabel(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{log.userName || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right max-w-xs truncate text-sm">
                        {log.description || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedLog(log);
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
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

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل التعديل</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">نوع الفاتورة</label>
                  <p className="mt-1">{getTypeLabel(selectedLog.invoiceType)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">رقم الفاتورة</label>
                  <p className="mt-1 font-mono text-sm">{selectedLog.invoiceId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">الإجراء</label>
                  <p className="mt-1">{getActionLabel(selectedLog.action)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">المستخدم</label>
                  <p className="mt-1">{selectedLog.userName || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">التاريخ والوقت</label>
                  <p className="mt-1">{formatDateTime(selectedLog.createdAt)}</p>
                </div>
                {selectedLog.fieldName && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">الحقل المعدل</label>
                    <p className="mt-1">{selectedLog.fieldName}</p>
                  </div>
                )}
              </div>

              {selectedLog.description && (
                <div>
                  <label className="text-sm font-medium text-gray-600">الوصف</label>
                  <p className="mt-1 bg-gray-50 p-2 rounded text-sm">{selectedLog.description}</p>
                </div>
              )}

              {selectedLog.oldValue && (
                <div>
                  <label className="text-sm font-medium text-gray-600">القيمة السابقة</label>
                  <pre className="mt-1 bg-gray-50 p-2 rounded text-xs overflow-auto max-h-40">
                    {parseJsonValue(selectedLog.oldValue)}
                  </pre>
                </div>
              )}

              {selectedLog.newValue && (
                <div>
                  <label className="text-sm font-medium text-gray-600">القيمة الجديدة</label>
                  <pre className="mt-1 bg-gray-50 p-2 rounded text-xs overflow-auto max-h-40">
                    {parseJsonValue(selectedLog.newValue)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoiceChangeLogs;
