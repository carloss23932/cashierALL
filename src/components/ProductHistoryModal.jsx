import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Filter, X, History, ArrowDown, ArrowUp } from "lucide-react";

const ProductHistoryModal = ({ productId, productName, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'in', 'out'

  useEffect(() => {
    if (productId) {
      setLoading(true);
      // استدعاء دالة IPC عبر window.api
      if (window.api && window.api.getProductHistory) {
        window.api.getProductHistory(productId)
          .then(data => {
            setHistory(data);
            setLoading(false);
          })
          .catch(err => {
            console.error("Failed to fetch history:", err);
            setLoading(false);
          });
      } else {
        console.error("API function getProductHistory not found. Please update preload.cjs");
        setLoading(false);
      }
    }
  }, [productId]);

  // تصفية السجل بناءً على التاريخ والنوع
  const filteredHistory = history.filter(item => {
    const itemDate = new Date(item.date);
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (itemDate < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (itemDate > end) return false;
    }

    if (filterType === 'in') return item.quantity > 0; // وارد (شراء، مرتجع، تعديل موجب)
    if (filterType === 'out') return item.quantity < 0; // صادر (بيع، تعديل سالب)

    return true;
  });

  // دالة لترجمة نوع الحركة للعربية وتحديد اللون
  const getTypeDetails = (type) => {
    switch (type) {
      case 'sale': return <Badge variant="destructive" className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200">مبيعات</Badge>;
      case 'return': return <Badge variant="default" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200">مرتجع مبيعات</Badge>;
      case 'purchase': return <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">فاتورة شراء</Badge>;
      case 'adjustment': return <Badge variant="outline" className="bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200">تعديل يدوي</Badge>;
      case 'server-adjustment': return <Badge variant="outline" className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200">تعديل من الخادم</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header - متناسق مع باقي النوافذ */}
        <div className="p-4 border-b flex justify-between items-center bg-purple-50 rounded-t-lg shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <History className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-purple-900">سجل حركة المنتج</h2>
              <p className="text-sm text-purple-600 font-medium">{productName}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-purple-100 text-purple-700 rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-white border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end shrink-0">
           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> من تاريخ
              </label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border-slate-200 h-9 focus:bg-white" />
           </div>
           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> إلى تاريخ
              </label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border-slate-200 h-9 focus:bg-white" />
           </div>
           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> نوع الحركة
              </label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-right focus:bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="in">وارد (دخول)</SelectItem>
                  <SelectItem value="out">صادر (خروج)</SelectItem>
                </SelectContent>
              </Select>
           </div>
           <Button 
             variant="outline" 
             onClick={() => { setStartDate(''); setEndDate(''); setFilterType('all'); }}
             className="h-9 border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
           >
             <X className="w-4 h-4 ml-1" />
             مسح الفلاتر
           </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-0 bg-slate-50/30">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
               <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
               <p className="text-sm">جاري تحميل البيانات...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
               <History className="w-12 h-12 opacity-20" />
               <p className="text-sm">لا توجد حركات مطابقة للفلاتر.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="text-right font-bold text-slate-600">التاريخ والوقت</TableHead>
                  <TableHead className="text-right font-bold text-slate-600">نوع الحركة</TableHead>
                  <TableHead className="text-center font-bold text-slate-600">الكمية</TableHead>
                  <TableHead className="text-center font-bold text-slate-600">السعر / التكلفة</TableHead>
                  <TableHead className="text-right font-bold text-slate-600">المرجع</TableHead>
                  <TableHead className="text-right font-bold text-slate-600">ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((item, index) => {
                  return (
                    <TableRow key={index} className="hover:bg-purple-50/50 transition-colors border-b border-slate-100 bg-white">
                      <TableCell className="font-medium text-slate-700">
                        <div className="flex flex-col">
                          <span>{new Date(item.date).toLocaleDateString('en-US')}</span>
                          <span className="text-[10px] text-slate-400">{new Date(item.date).toLocaleTimeString('en-US')}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getTypeDetails(item.type)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs ${item.quantity > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          <span dir="ltr" className="font-bold">{item.quantity > 0 ? `+${item.quantity}` : item.quantity}</span>
                          {item.quantity > 0 ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-slate-600">
                        {item.price ? Number(item.price).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-500">{item.ref}</TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={item.note}>{item.note || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
           <span>عدد الحركات: {filteredHistory.length}</span>
           <span>نظام المبيعات</span>
        </div>
      </div>
    </div>
  );
};

export default ProductHistoryModal;
