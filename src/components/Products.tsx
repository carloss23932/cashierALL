import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Package,
  Barcode,
  Filter,
  AlertTriangle,
  Box,
  Layers,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const Products = () => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    barcode: "",
    categoryId: "all",
    unitsPerBox: "",
    boxPurchasePrice: "",
    boxSalePrice: "",
  });

  // Fetch Products
  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: () => window.api.listProducts(),
  });

  // Fetch Categories
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => window.api.listCategories(),
  });

  // Mutations
  const upsertMutation = useMutation({
    mutationFn: (data: any) => window.api.upsertProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "تم الحفظ", description: "تم حفظ بيانات المنتج بنجاح." });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({
        title: "خطأ",
        description: err.message || "حدث خطأ أثناء الحفظ.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "تم الحذف", description: "تم حذف المنتج بنجاح." });
    },
    onError: (err: any) => {
      toast({
        title: "خطأ",
        description: err.message || "حدث خطأ أثناء الحذف.",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price,
      stock: product.stock,
      barcode: product.barcode || "",
      categoryId: product.categoryId ? String(product.categoryId) : "all",
      unitsPerBox: product.unitsPerBox || "",
      boxPurchasePrice: product.boxPurchasePrice || "",
      boxSalePrice: product.boxSalePrice || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا المنتج؟")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      price: Number(formData.price),
      stock: Number(formData.stock),
      unitsPerBox: formData.unitsPerBox ? Number(formData.unitsPerBox) : null,
      boxPurchasePrice: formData.boxPurchasePrice
        ? Number(formData.boxPurchasePrice)
        : null,
      boxSalePrice: formData.boxSalePrice
        ? Number(formData.boxSalePrice)
        : null,
      categoryId: formData.categoryId && formData.categoryId !== "all" ? Number(formData.categoryId) : null,
      id: editingProduct ? editingProduct.id : undefined,
    };
    upsertMutation.mutate(payload);
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      price: "",
      stock: "",
      barcode: "",
      categoryId: "all",
      unitsPerBox: "",
      boxPurchasePrice: "",
      boxSalePrice: "",
    });
  };

  // Filtering
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode && p.barcode.includes(search));
      const matchesCategory =
        categoryFilter === "all" ||
        (p.categoryId && String(p.categoryId) === categoryFilter);
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const lowStockCount = products.filter((p: any) => p.stock <= 5).length;

  return (
    <div className="p-6 bg-slate-50/50 min-h-screen font-sans space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700" dir="rtl">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-0 shadow-md rounded-2xl overflow-hidden relative group hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-gradient-to-b from-blue-400 to-blue-600" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">إجمالي المنتجات</CardTitle>
            <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800">{products.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-0 shadow-md rounded-2xl overflow-hidden relative group hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">إجمالي المخزون</CardTitle>
            <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-100 transition-colors">
              <Layers className="h-5 w-5 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800">
              {products.reduce((acc: number, p: any) => acc + p.stock, 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-0 shadow-md rounded-2xl overflow-hidden relative group hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-gradient-to-b from-orange-400 to-orange-600" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">نواقص المخزون</CardTitle>
            <div className="p-2 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{lowStockCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="border-0 shadow-xl rounded-2xl bg-white ring-1 ring-slate-900/5 overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-xl shadow-sm">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <span>إدارة المنتجات</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث البيانات" className="rounded-xl border-slate-200 hover:bg-slate-50">
                <RefreshCw className="w-4 h-4 text-slate-600" />
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white gap-2 shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all rounded-xl px-6">
                    <Plus className="w-4 h-4" /> إضافة منتج جديد
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl" dir="rtl">
                  <DialogHeader>
                    <DialogTitle>{editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
                    <DialogDescription>
                      أدخل تفاصيل المنتج أدناه. الحقول المميزة بـ * مطلوبة.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>اسم المنتج *</Label>
                        <Input
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="مثال: بيبسي علب"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>الباركود</Label>
                        <div className="relative">
                          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            value={formData.barcode}
                            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                            placeholder="امسح الباركود..."
                            className="pl-9 text-right"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>سعر البيع (للقطعة) *</Label>
                        <Input
                          type="number"
                          required
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>الكمية المتوفرة *</Label>
                        <Input
                          type="number"
                          required
                          value={formData.stock}
                          onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>التصنيف</Label>
                        <Select
                          value={formData.categoryId}
                          onValueChange={(val) => setFormData({ ...formData, categoryId: val })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="اختر تصنيفاً" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">بدون تصنيف</SelectItem>
                            {categories.map((cat: any) => (
                              <SelectItem key={cat.id} value={String(cat.id)}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
  
                    {/* Box Details Section */}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center gap-2 mb-4 text-slate-600 font-semibold">
                        <Box className="w-4 h-4" /> تفاصيل الصندوق (اختياري)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">عدد القطع في الصندوق</Label>
                          <Input
                            type="number"
                            value={formData.unitsPerBox}
                            onChange={(e) => setFormData({ ...formData, unitsPerBox: e.target.value })}
                            placeholder="مثال: 24"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">سعر شراء الصندوق</Label>
                          <Input
                            type="number"
                            value={formData.boxPurchasePrice}
                            onChange={(e) => setFormData({ ...formData, boxPurchasePrice: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">سعر بيع الصندوق</Label>
                          <Input
                            type="number"
                            value={formData.boxSalePrice}
                            onChange={(e) => setFormData({ ...formData, boxSalePrice: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
  
                    <DialogFooter className="mt-6">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>إلغاء</Button>
                      <Button type="submit" className="bg-blue-600 hover:bg-blue-700">حفظ البيانات</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mt-6">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="بحث باسم المنتج أو الباركود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 border-slate-200 focus:border-blue-500 rounded-xl"
              />
            </div>
            <div className="w-full md:w-[200px]">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="border-slate-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <SelectValue placeholder="كل التصنيفات" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  {categories.map((cat: any) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-right font-bold text-slate-700">اسم المنتج</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">الباركود</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">التصنيف</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">السعر</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">المخزون</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                      جاري تحميل المنتجات...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                      لا توجد منتجات مطابقة.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product: any) => (
                    <TableRow key={product.id} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 group">
                      <TableCell className="font-medium text-slate-800">{product.name}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{product.barcode || "-"}</TableCell>
                      <TableCell>
                        {product.categoryName ? (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200">
                            {product.categoryName}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-bold text-blue-600">
                        {formatCurrency(product.price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={product.stock <= 5 ? "destructive" : "outline"} 
                          className={product.stock > 5 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""}
                        >
                          {product.stock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:bg-blue-50 rounded-lg"
                            onClick={() => handleEdit(product)}
                            title="تعديل"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50 rounded-lg"
                            onClick={() => handleDelete(product.id)}
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Products;