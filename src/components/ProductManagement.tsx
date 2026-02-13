import React, { useEffect, useState, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Search, Edit, Trash2, Barcode, FileText, Printer, Database, FilePlus, X, Save, History, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CategoryManagement from "./CategoryManagement";
import { useToast } from "@/hooks/use-toast";
import useBarcodeValidation from "@/hooks/useBarcodeValidation";
import ProductHistoryModal from "./ProductHistoryModal";

interface Category {
  id: string;
  name: string;
  description?: string;
  color: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
  categoryId?: number;
  categoryName?: string;
  unitsPerBox?: number;
  boxPurchasePrice?: number;
  boxSalePrice?: number;
  alternativeProductId?: string | number | null;
  isOffer?: boolean;
  offerUnderlyingProductId?: number | null;
  offerUnderlyingProductQuantity?: number | null;
}

const ProductManagement = ({ currentUser, purchaseMode = "units" }: { currentUser?: any, purchaseMode?: string }) => {
  // دالة لتنسيق الأرقام باللغة الانجليزية
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    }).format(value);
  };

  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showRayanModal, setShowRayanModal] = useState(false);
  const [manualStockEditEnabled, setManualStockEditEnabled] = useState(true);
  const purchaseListRef = useRef<HTMLDivElement | null>(null);
  const prevPurchaseCount = useRef(0);
  
  // State for alternative product search
  const [altProductSearchOpen, setAltProductSearchOpen] = useState(false);
  const [altProductSearchQuery, setAltProductSearchQuery] = useState("");

  // State for offer product search
  const [offerProductSearchOpen, setOfferProductSearchOpen] = useState(false);
  const [offerProductSearchQuery, setOfferProductSearchQuery] = useState("");
  
  // Purchase Invoice State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
  const [purchaseMeta, setPurchaseMeta] = useState({ 
    number: "", 
    date: new Date(Date.now() + 2 * 3600000).toISOString().split('T')[0], // تاريخ العمل (1 صباحاً)
    cashier: currentUser?.name || currentUser?.username || "النظام",
    supplier: ""
  });
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    barcode: "",
    categoryId: "",
    unitsPerBox: "1",
    boxPurchasePrice: "",
    boxSalePrice: "",
    alternativeProductId: "none",
    isOffer: false,
    offerUnderlyingProductId: "",
    offerUnderlyingProductQuantity: "",
  });

  const { toast } = useToast();
  const { validate, ConflictDialog } = useBarcodeValidation();
  const queryClient = useQueryClient();

  const { data: categoriesData = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => window.api.listCategories(),
  });

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => window.api.listProducts(),
  });

  const { data: purchaseHistory = [] } = useQuery({
    queryKey: ["purchaseHistory"],
    queryFn: () => window.api.listPurchaseInvoices({ limit: 200 }),
  });

  // جلب كافة الفواتير لاستخراج قائمة الموردين للاقتراحات
  const { data: allInvoices = [] } = useQuery({
    queryKey: ["allPurchaseInvoicesForSuggestions"],
    queryFn: () => window.api.listPurchaseInvoices(),
  });

  const uniqueSuppliers = useMemo(() => {
    const names = new Set<string>();
    allInvoices.forEach((inv: any) => {
      if (inv.supplierName) names.add(inv.supplierName);
    });
    return Array.from(names).sort();
  }, [allInvoices]);

  // تصفية الفواتير لعرض فواتير المخزون فقط (التي تحتوي على مواد)
  const stockInvoices = useMemo(() => {
    return purchaseHistory.filter((record: any) => record.itemsCount > 0);
  }, [purchaseHistory]);

  const calcPurchaseLineTotal = (item: any) => {
    const qtyInBoxes = purchaseMode === 'boxes'
      ? Number(item.addQuantity || 0)
      : (Number(item.addQuantity || 0) / (item.unitsPerBox || 1));
    return qtyInBoxes * Number(item.newCost || 0);
  };

  const purchasePreviewTotal = useMemo(() => {
    return purchaseItems.reduce((sum, item) => sum + calcPurchaseLineTotal(item), 0);
  }, [purchaseItems, purchaseMode]);

  const rayanStats = useMemo(() => {
    const items = products.filter((p: any) => p.categoryName && p.categoryName.includes("الريان"));
    const totalStock = items.reduce((sum: number, p: any) => sum + (p.stock || 0), 0);
    const totalValue = items.reduce((sum: number, p: any) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    return { items, totalStock, totalValue };
  }, [products]);

  useEffect(() => {
    const converted = (categoriesData || []).map((c: any) => ({
      id: String(c.id),
      name: c.name,
      description: c.description || "",
      color: c.color || "#3B82F6",
    }));
    setCategories(converted);
  }, [categoriesData]);

  useEffect(() => {
    if (!showPurchaseModal) {
      prevPurchaseCount.current = purchaseItems.length;
      return;
    }
    if (purchaseItems.length > prevPurchaseCount.current) {
      requestAnimationFrame(() => {
        const el = purchaseListRef.current;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      });
    }
    prevPurchaseCount.current = purchaseItems.length;
  }, [purchaseItems.length, showPurchaseModal]);


  useEffect(() => {
    let active = true;

    const resolveEnabled = (value: any) => {
      if (value === null || value === undefined) return true;
      return !(value === false || value === "false");
    };

    const loadSettings = async () => {
      try {
        const enabledRaw = await window.api.getAppSetting("manualStockEditEnabled");
        if (!active) return;
        setManualStockEditEnabled(resolveEnabled(enabledRaw));
      } catch (e) {
        if (!active) return;
        setManualStockEditEnabled(true);
      }
    };

    const handleSettingsUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if ("enabled" in detail) {
        setManualStockEditEnabled(resolveEnabled(detail.enabled));
      }
    };

    loadSettings();
    window.addEventListener("manual-stock-edit-settings", handleSettingsUpdate as EventListener);
    return () => {
      active = false;
      window.removeEventListener("manual-stock-edit-settings", handleSettingsUpdate as EventListener);
    };
  }, []);

  // تحديث اسم الكاشير تلقائياً عند فتح نافذة الشراء لضمان تسجيل المستخدم الحالي (سواء كان المدير أو بائع)
  useEffect(() => {
    if (showPurchaseModal && editingPurchaseId === null) {
      setPurchaseMeta(prev => ({
        ...prev,
        cashier: currentUser?.name || currentUser?.username || "النظام"
      }));
    }
  }, [showPurchaseModal, editingPurchaseId, currentUser]);

  const upsertMutation = useMutation({
    mutationFn: (product: any) => window.api.upsertProduct(product),
    // Invalidation is handled in handleSubmit to ensure it runs after setting the alternative product
  });

  const upsertCategoryMutation = useMutation({
    mutationFn: (category: any) => window.api.upsertCategory(category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => window.api.deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.deleteProduct(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const resetForm = () =>
    setFormData({
      name: "",
      price: "",
      stock: "",
      barcode: "",
      categoryId: "",
      unitsPerBox: "1",
      boxPurchasePrice: "",
      boxSalePrice: "",
      alternativeProductId: "none",
      isOffer: false,
      offerUnderlyingProductId: "",
      offerUnderlyingProductQuantity: "",
    });

  const generateBarcode = () => {
    const barcode = Math.floor(Math.random() * 1000000000).toString();
    setFormData({ ...formData, barcode });
  };

  const handlePrintRayanInventory = async () => {
    try {
      // تصفية المنتجات لطباعة المتوفر فقط (المخزون > 0)
      const itemsToPrint = rayanStats.items.filter((item: any) => (item.stock || 0) > 0);
      const printTotalStock = itemsToPrint.reduce((sum: number, p: any) => sum + (p.stock || 0), 0);
      const printTotalValue = itemsToPrint.reduce((sum: number, p: any) => sum + ((p.stock || 0) * (p.price || 0)), 0);

      await window.api.printThermalReceipt({
        type: 'inventory',
        title: 'جرد منتجات الريان',
        items: itemsToPrint.map((item: any) => ({
          name: item.name,
          stock: item.stock,
          price: item.price,
        })),
        totalStock: printTotalStock,
        totalValue: printTotalValue,
        qr: "https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL"
      });
      toast({ title: "تم الإرسال", description: "جاري طباعة تقرير الجرد..." });
    } catch (e) {
      toast({ title: "خطأ", description: "فشل في الطباعة", variant: "destructive" });
    }
  };

  const handleImportLegacyDBF = async () => {
    if (!confirm("هل أنت متأكد من استيراد المنتجات من ملف الكاشير القديم؟\n(Products.DBF)")) return;
    
    try {
      toast({ title: "جاري الاستيراد", description: "يرجى الانتظار..." });
      // @ts-ignore
      const result = await window.api.importLegacyDBF();
      if (result.ok) {
        toast({ title: "تم الاستيراد", description: `تم استيراد ${result.count} منتج بنجاح.` });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } else {
        toast({ title: "خطأ", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleAddPurchaseItem = (product: any) => {
    if (purchaseItems.find(i => i.id === product.id)) {
        toast({ title: "موجود بالفعل", description: "المنتج مضاف للقائمة مسبقاً", variant: "destructive" });
        return;
    }
    setPurchaseItems([...purchaseItems, { ...product, addQuantity: 1, newCost: product.boxPurchasePrice || 0 }]);
    setPurchaseSearch(""); // Clear search after adding
  };

  const handleRemovePurchaseItem = (id: number) => {
    setPurchaseItems(purchaseItems.filter(i => i.id !== id));
  };

  const openNewPurchaseModal = () => {
    setEditingPurchaseId(null);
    setPurchaseItems([]);
    setPurchaseMeta({ 
        number: "", 
        date: new Date(Date.now() + 2 * 3600000).toISOString().split('T')[0],
        cashier: currentUser?.name || currentUser?.username || "النظام",
        supplier: ""
    });
    setShowPurchaseModal(true);
  };

  const handleEditPurchase = async (invoice: any) => {
    setEditingPurchaseId(invoice.id);
    
    // تحسين معالجة التاريخ لتجنب الأخطاء
    let formattedDate = new Date().toISOString().split('T')[0];
    try {
        if (invoice.date) {
            formattedDate = new Date(invoice.date).toISOString().split('T')[0];
        }
    } catch (e) {
        console.error("Invalid date:", invoice.date);
    }

    setPurchaseMeta({
        number: invoice.invoiceNumber || invoice.number || "",
        date: formattedDate,
        cashier: invoice.cashier || invoice.cashierName || "",
        supplier: invoice.supplierName || ""
    });

    console.log("Editing Invoice Data:", invoice); // للمساعدة في تتبع البيانات في الكونسول

    // محاولة العثور على قائمة المواد بأسماء مختلفة (بحث موسع)
    const potentialKeys = ['items', 'purchaseItems', 'products', 'lines', 'details', 'purchase_items', 'invoiceItems', 'invoice_items'];
    
    let rawItems: any[] = [];
    let found = false;

    // محاولة جلب التفاصيل من الخادم إذا كانت القائمة فارغة (لأن القائمة الحالية قد تكون ملخصاً فقط)
    if ((!invoice.items && !invoice.products && !invoice.purchaseItems) && invoice.id) {
        try {
            // @ts-ignore
            if (window.api.getPurchaseInvoice) {
                toast({ title: "جاري التحميل", description: "يتم جلب تفاصيل الفاتورة..." });
                // @ts-ignore
                const fullInvoice = await window.api.getPurchaseInvoice(invoice.id);
                if (fullInvoice) {
                    console.log("Fetched Full Invoice Details:", fullInvoice);
                    invoice = { ...invoice, ...fullInvoice }; // دمج البيانات الجديدة مع القديمة
                }
            }
        } catch (e) {
            console.error("Failed to fetch full invoice details:", e);
        }
    }

    // 1. البحث في المفاتيح المعروفة
    for (const key of potentialKeys) {
        if (invoice[key]) {
            let val = invoice[key];
            // معالجة النصوص (JSON)
            if (typeof val === 'string') {
                try {
                    val = JSON.parse(val);
                    // معالجة التشفير المزدوج (Double Stringify)
                    if (typeof val === 'string') val = JSON.parse(val);
                } catch (e) {
                    console.error(`Failed to parse ${key}:`, e);
                    continue;
                }
            }
            
            if (Array.isArray(val)) {
                rawItems = val;
                found = true;
                break;
            }
        }
    }

    // 2. إذا لم نجد شيئاً، نبحث في كل خصائص الكائن عن أي مصفوفة
    if (!found) {
        for (const key of Object.keys(invoice)) {
            if (key === 'id' || key === 'invoiceNumber') continue; // تخطي الحقول الأساسية
            
            let val = invoice[key];
            if (typeof val === 'string') {
                try { val = JSON.parse(val); } catch (e) {}
            }
            
            if (Array.isArray(val) && val.length > 0) {
                // التحقق مما إذا كانت المصفوفة تحتوي على بيانات تشبه المنتجات
                const sample = val[0];
                if (sample && (sample.productId || sample.product_id || sample.quantity || sample.qty || sample.name)) {
                    rawItems = val;
                    found = true;
                    break;
                }
            }
        }
    }

    if (!found || rawItems.length === 0) {
        toast({
            title: "تنبيه",
            description: `لم يتم العثور على منتجات. يبدو أن السجل يعيد ملخصاً فقط. يرجى التأكد من أن listPurchaseInvoices تعيد (items).`,
            variant: "destructive"
        });
    }

    // التأكد من أن rawItems مصفوفة قبل المعالجة
    const items = rawItems.map((item: any) => {
        const pId = item.productId || item.product_id || item.product?.id || item.id;
        const product = products.find((p: any) => String(p.id) === String(pId));
        const units = product?.unitsPerBox || 1;
        // إذا كان النظام "كرتون"، نقسم الكمية المخزنة (قطع) على عدد الوحدات في الصندوق
        const displayQty = purchaseMode === 'boxes' ? (Number(item.quantity || item.qty || item.count || 0) / units) : (item.quantity || item.qty || item.count || 0);
        
        return {
            ...product, // نسخ بيانات المنتج الموجود (مثل المخزون الحالي)
            id: pId, // ضمان وجود المعرف
            name: product?.name || item.product?.name || item.productName || item.name || "منتج غير معروف",
            stock: product?.stock || 0,
            addQuantity: displayQty,
            newCost: item.cost ?? item.price ?? item.newCost ?? item.amount ?? 0,
            unitsPerBox: product?.unitsPerBox || 1
        };
    });

    setPurchaseItems(items);
    setShowHistoryModal(false);
    setShowPurchaseModal(true);
  };

  const handlePurchaseSubmit = async () => {
    if (!purchaseMeta.number) { toast({title: "رقم الفاتورة مطلوب", variant: "destructive"}); return; }
    if (!purchaseMeta.supplier || !purchaseMeta.supplier.trim()) { toast({title: "اسم المورد مطلوب", variant: "destructive"}); return; }
    if (purchaseItems.length === 0) { toast({title: "القائمة فارغة", variant: "destructive"}); return; }
    
    try {
        console.log("Submitting Purchase:", purchaseItems); // للتأكد من البيانات قبل الإرسال

        // حساب الإجمالي التقريبي للفاتورة
        const totalAmount = purchaseItems.reduce((sum, item) => {
            // إذا كان الإدخال بالكرتون: الكمية * سعر الكرتون
            // إذا كان الإدخال بالقطعة: (الكمية / الوحدات) * سعر الكرتون
            const qtyInBoxes = purchaseMode === 'boxes' ? Number(item.addQuantity) : (Number(item.addQuantity) / (item.unitsPerBox || 1));
            return sum + (qtyInBoxes * Number(item.newCost));
        }, 0);

        const payload = {
            invoiceNumber: purchaseMeta.number,
            date: purchaseMeta.date,
            cashierName: purchaseMeta.cashier,
            supplierName: purchaseMeta.supplier,
            totalAmount: totalAmount,
            items: purchaseItems.map(i => ({
                productId: i.id,
                // تحويل الكمية إلى قطع إذا كان الإدخال بالكرتون
                quantity: purchaseMode === 'boxes' ? Number(i.addQuantity) * (i.unitsPerBox || 1) : Number(i.addQuantity),
                cost: Number(i.newCost)
            }))
        };

        if (editingPurchaseId) {
            // @ts-ignore
            await window.api.updatePurchaseInvoice({ id: editingPurchaseId, ...payload });
            toast({ title: "تم التعديل", description: "تم تحديث الفاتورة والمخزون بنجاح" });
        } else {
            // @ts-ignore
            await window.api.processPurchaseInvoice(payload);
            toast({ title: "تم الحفظ", description: "تم تحديث المخزون بنجاح" });
        }

        setShowPurchaseModal(false);
        setPurchaseItems([]);
        setPurchaseMeta({ 
            number: "", 
            date: new Date(Date.now() + 2 * 3600000).toISOString().split('T')[0],
            cashier: currentUser?.name || currentUser?.username || "النظام",
            supplier: ""
        });
        setEditingPurchaseId(null);
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["purchaseHistory"] });
    } catch(e: any) {
        toast({ title: "خطأ", description: e.message || "فشل الحفظ", variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "الاسم مطلوب",
        description: "يرجى إدخال اسم المنتج قبل الحفظ.",
        variant: "destructive",
      });
      return;
    }

    const units = Number(formData.unitsPerBox || 1);
    const boxSale = Number(formData.boxSalePrice || 0);
    const boxPurchase = Number(formData.boxPurchasePrice || 0);

    if (!units || units <= 0) {
      toast({ title: "عدد الوحدات في الصندوق يجب أن يكون أكبر من صفر", variant: "destructive" });
      return;
    }

    const unitPrice = boxSale > 0 ? boxSale / units : Number(formData.price || 0);

    const conflictResult = await validate(formData.barcode, async (b) => {
      const code = String(b || "").trim();
      if (!code) return null;
      const conflict = products.find((p: any) => p.barcode === code && (!editingProduct || p.id !== editingProduct.id));
      return conflict || null;
    });
    if (conflictResult.status !== "ok") {
      if (conflictResult.status === "abort") return;
      if (conflictResult.status === "edit") {
        handleEdit(conflictResult.product);
        return;
      }
      if (conflictResult.status === "delete") {
        const conflictId = conflictResult.product.id;
        if (!conflictId) return;
        try {
          await deleteMutation.mutateAsync(Number(conflictId));
        } catch {
          /* ignore */
        }
      }
    }

    const newProduct: Partial<Product> = {
      id: editingProduct ? editingProduct.id : undefined,
      name: formData.name.trim(),
      price: unitPrice || 0,
      stock: parseInt(formData.stock) || 0,
      barcode: formData.barcode.trim() || undefined,
      categoryId: (formData.categoryId && formData.categoryId !== "") ? Number(formData.categoryId) : undefined,
      unitsPerBox: units,
      boxPurchasePrice: boxPurchase || 0,
      boxSalePrice: boxSale || 0,
      isOffer: formData.isOffer,
      offerUnderlyingProductId: formData.isOffer ? formData.offerUnderlyingProductId : null,
      offerUnderlyingProductQuantity: formData.isOffer ? formData.offerUnderlyingProductQuantity : null,
    };

    const savedProduct = await upsertMutation.mutateAsync(newProduct)
    
    // حفظ المنتج البديل
    if (savedProduct && savedProduct.id) {
        await window.api.setProductAlternative({
            productId: savedProduct.id,
            alternativeId: (formData.alternativeProductId && formData.alternativeProductId !== "none") ? formData.alternativeProductId : null
        });
    }

    await queryClient.invalidateQueries({ queryKey: ["products"] });
    setIsDialogOpen(false);
    setEditingProduct(null);
    resetForm();
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
      barcode: product.barcode || "",
      categoryId: product.categoryId ? String(product.categoryId) : "",
      unitsPerBox: (product.unitsPerBox || 1).toString(),
      boxPurchasePrice: product.boxPurchasePrice ? product.boxPurchasePrice.toString() : "",
      boxSalePrice: product.boxSalePrice ? product.boxSalePrice.toString() : "",
      alternativeProductId: product.alternativeProductId ? String(product.alternativeProductId) : "none",
      isOffer: product.isOffer || false,
      offerUnderlyingProductId: product.offerUnderlyingProductId ? String(product.offerUnderlyingProductId) : "",
      offerUnderlyingProductQuantity: product.offerUnderlyingProductQuantity ? String(product.offerUnderlyingProductQuantity) : "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleCategoriesUpdate = async (updated: Category[]) => {
    const prevIds = new Set(categories.map((c) => c.id));
    const updatedIds = new Set(updated.map((u) => u.id));
    for (const p of categories) {
      if (!updatedIds.has(p.id)) {
        const numericId = Number(p.id);
        if (Number.isInteger(numericId)) {
          try {
            await deleteCategoryMutation.mutateAsync(numericId);
          } catch {}
        }
      }
    }
    for (const cat of updated) {
      try {
        if (Number.isInteger(Number(cat.id))) {
          await upsertCategoryMutation.mutateAsync({ id: Number(cat.id), name: cat.name, description: cat.description || null, color: cat.color });
        } else {
          const created: any = await upsertCategoryMutation.mutateAsync({ name: cat.name, description: cat.description || null, color: cat.color });
          cat.id = String(created.id);
        }
      } catch {}
    }
    setCategories(updated);
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.categoryName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on search
  }, [searchTerm]);

  const getCategoryColor = (categoryName: string) => {
    const category = categories.find((c) => c.name === categoryName);
    return category?.color || "#6B7280";
  };

  return (
    <div className="space-y-6" dir="rtl">
      {ConflictDialog}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-blue-800">إدارة المنتجات</h2>
        <div className="flex gap-2">
          <Button onClick={() => setShowHistoryModal(true)} variant="outline" className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50">
            <History className="w-4 h-4" />
            سجل الفواتير
          </Button>
          <Button onClick={openNewPurchaseModal} variant="outline" className="gap-2 border-green-200 text-green-700 hover:bg-green-50">
            <FilePlus className="w-4 h-4" />
            إدخال فاتورة شراء
          </Button>
          {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
            <Button onClick={handleImportLegacyDBF} variant="outline" className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50">
              <Database className="w-4 h-4" />
              استيراد قديم
            </Button>
          )}
          <Button onClick={() => setShowRayanModal(true)} variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
            <FileText className="w-4 h-4" />
            جرد منتجات الريان
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                onClick={() => {
                  setEditingProduct(null);
                  resetForm();
                }}
              >
                <Plus className="w-4 h-4 ml-2" />
                إضافة منتج جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-right">
                  اسم المنتج *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: رز مزة، سكر، زيت..."
                  required
                />
              </div>

              <div className="flex items-center space-x-2 space-x-reverse border-t pt-4">
                <Checkbox
                  id="isOffer"
                  checked={formData.isOffer}
                  onCheckedChange={(checked) => setFormData({ ...formData, isOffer: Boolean(checked) })}
                />
                <label htmlFor="isOffer" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-blue-700">هل هذا المنتج عرض خاص؟</label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!formData.isOffer && (
                <div>
                  <Label htmlFor="unitsPerBox" className="text-right">
                    عدد الوحدات في الصندوق *
                  </Label>
                  <Input
                    id="unitsPerBox"
                    type="number"
                    min={1}
                    value={formData.unitsPerBox}
                    onChange={(e) => setFormData({ ...formData, unitsPerBox: e.target.value })}
                    placeholder="عدد القطع في الصندوق"
                  />
                </div>
                )}
                {manualStockEditEnabled ? (
                  <div className={formData.isOffer ? "col-span-2 opacity-50" : ""}>
                    <Label htmlFor="stock" className="text-right">
                      المخزون
                    </Label>
                    <Input
                      id="stock"
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="0"
                      disabled={formData.isOffer}
                    />
                  </div>
                ) : (
                  <div className="col-span-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3">
                    <div className="text-xs text-slate-500 mb-1">تعديل المخزون اليدوي معطل من الإعدادات</div>
                    <div className="text-sm font-medium">
                      المخزون الحالي: {editingProduct?.stock ?? Number(formData.stock || 0)}
                    </div>
                  </div>
                )}
              </div>

              {!formData.isOffer && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="boxPurchasePrice" className="text-right">
                    سعر شراء الصندوق
                  </Label>
                  <Input
                    id="boxPurchasePrice"
                    type="number"
                    step="0.01"
                    value={formData.boxPurchasePrice}
                    onChange={(e) => setFormData({ ...formData, boxPurchasePrice: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="boxSalePrice" className="text-right">
                    سعر بيع الصندوق
                  </Label>
                  <Input
                    id="boxSalePrice"
                    type="number"
                    step="0.01"
                    value={formData.boxSalePrice}
                    onChange={(e) => setFormData({ ...formData, boxSalePrice: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              )}

              {formData.isOffer ? (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-4">
                  <div>
                    <Label htmlFor="offer-price" className="text-blue-800">سعر العرض الإجمالي *</Label>
                    <Input
                      id="offer-price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="السعر الإجمالي للعرض"
                      className="bg-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-blue-800">المنتج الأساسي للعرض *</Label>
                    <Popover open={offerProductSearchOpen} onOpenChange={setOfferProductSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between bg-white">
                          {formData.offerUnderlyingProductId
                            ? products.find((p) => String(p.id) === formData.offerUnderlyingProductId)?.name
                            : "اختر المنتج..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="ابحث عن منتج..." onValueChange={setOfferProductSearchQuery} />
                          <CommandList>
                            <CommandEmpty>لا يوجد منتج.</CommandEmpty>
                            <CommandGroup>
                              {products.filter(p => !p.isOffer && p.name.toLowerCase().includes(offerProductSearchQuery.toLowerCase())).map((p) => (
                                <CommandItem key={p.id} value={p.name} onSelect={() => {
                                  setFormData({ ...formData, offerUnderlyingProductId: String(p.id) });
                                  setOfferProductSearchOpen(false);
                                }}>
                                  {p.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label htmlFor="offer-qty" className="text-blue-800">الكمية في العرض *</Label>
                    <Input
                      id="offer-qty"
                      type="number"
                      min="1"
                      value={formData.offerUnderlyingProductQuantity}
                      onChange={(e) => setFormData({ ...formData, offerUnderlyingProductQuantity: e.target.value })}
                      placeholder="عدد القطع في العرض"
                      className="bg-white"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <Label htmlFor="price" className="text-right">سعر بيع الوحدة (يُحسب تلقائياً)</Label>
                  <Input id="price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0.00" />
                </div>
              )}

              {!formData.isOffer && (
              <div>
                <Label htmlFor="barcode" className="text-right">
                  الباركود
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="أدخل أو امسح الباركود"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={generateBarcode}>
                    <Barcode className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              )}

              <div>
                <Label htmlFor="category" className="text-right mb-2 block">
                  التصنيف
                </Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {categories.find(c => c.id === formData.categoryId)?.name === "الريان" && (
              <div>
                <Label htmlFor="alternative" className="text-right mb-2 block text-blue-600">
                  المنتج البديل (للتجميد/التحويل)
                </Label>
                <Popover open={altProductSearchOpen} onOpenChange={setAltProductSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={altProductSearchOpen}
                      className="w-full justify-between border-blue-200 bg-blue-50"
                    >
                      {formData.alternativeProductId && formData.alternativeProductId !== 'none'
                        ? products.find((p) => String(p.id) === formData.alternativeProductId)?.name
                        : "اختر المنتج البديل..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="ابحث عن منتج..."
                        onValueChange={setAltProductSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>لا يوجد منتج بهذا الاسم.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            key="none"
                            value="none"
                            onSelect={() => {
                              setFormData({ ...formData, alternativeProductId: 'none' });
                              setAltProductSearchOpen(false);
                            }}
                          >
                            بدون بديل
                          </CommandItem>
                          {products
                            .filter(p => (!editingProduct || p.id !== editingProduct.id) && p.name.toLowerCase().includes(altProductSearchQuery.toLowerCase()))
                            .map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => {
                                  setFormData({ ...formData, alternativeProductId: String(p.id) });
                                  setAltProductSearchOpen(false);
                                }}
                              >
                                {p.name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500">
                  {editingProduct ? "حفظ التعديل" : "إضافة"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <CategoryManagement categories={categories} onCategoriesUpdate={handleCategoriesUpdate} />

      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث عن المنتج أو التصنيف..."
              className="pl-10 text-right"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading && (
          <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardContent className="text-center py-12 text-gray-500">...يتم التحميل</CardContent>
          </Card>
        )}
        {!isLoading &&
          paginatedProducts.map((product) => (
            <Card
              key={product.id}
              className="bg-white/80 backdrop-blur-sm border-blue-100 hover:shadow-lg transition-all duration-200"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg text-gray-800">{product.name}</CardTitle>
                  {product.categoryName && (
                    <Badge
                      variant="secondary"
                      className="text-xs text-white border-0"
                      style={{ backgroundColor: getCategoryColor(product.categoryName) }}
                    >
                      {product.categoryName}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-right">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">سعر بيع الوحدة:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(product.price)} د.ع</span>
                </div>
                {product.unitsPerBox ? (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>عدد الوحدات في الصندوق:</span>
                    <span>{product.unitsPerBox}</span>
                  </div>
                ) : null}
                {product.boxSalePrice !== undefined ? (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>سعر بيع الصندوق:</span>
                    <span>{formatCurrency(product.boxSalePrice || 0)} د.ع</span>
                  </div>
                ) : null}
                {product.boxPurchasePrice !== undefined ? (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>سعر شراء الصندوق:</span>
                    <span>{formatCurrency(product.boxPurchasePrice || 0)} د.ع</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">المخزون:</span>
                  <Badge variant={product.stock > 10 ? "default" : "destructive"}>{product.stock}</Badge>
                </div>
                {product.barcode && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">الباركود:</span>
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{product.barcode}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setHistoryProduct(product)} className="flex-1 border-purple-200 text-purple-600 hover:bg-purple-50">
                    <History className="w-3 h-3 ml-1" />
                    سجل
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(product)} className="flex-1">
                    <Edit className="w-3 h-3 ml-1" />
                    تعديل
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(product.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Pagination Controls */}
      {!isLoading && filteredProducts.length > 0 && (
        <div className="flex justify-center items-center gap-4 mt-6 dir-ltr">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">
            صفحة {currentPage} من {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {!isLoading && filteredProducts.length === 0 && (
        <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
          <CardContent className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">لا توجد منتجات مطابقة لبحثك.</p>
          </CardContent>
        </Card>
      )}

      {/* نافذة جرد منتجات الريان */}
      {showRayanModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <div>
                <h2 className="font-bold text-lg text-gray-800">جرد منتجات الريان</h2>
                <p className="text-xs text-gray-500">عدد الأصناف: {rayanStats.items.length}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowRayanModal(false)}>✕</Button>
            </div>
            <div className="p-0 overflow-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 sticky top-0">
                    <TableHead className="text-right">اسم المنتج</TableHead>
                    <TableHead className="text-center">الكمية الحالية</TableHead>
                    <TableHead className="text-center">سعر البيع</TableHead>
                    <TableHead className="text-center">القيمة الإجمالية</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rayanStats.items.length > 0 ? (
                    rayanStats.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-center font-bold text-lg">{item.stock}</TableCell>
                        <TableCell className="text-center">{formatCurrency(item.price)} د.ع</TableCell>
                        <TableCell className="text-center text-blue-600 font-bold">{formatCurrency((item.stock || 0) * (item.price || 0))} د.ع</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-gray-500 text-lg">لا توجد منتجات تحت تصنيف "الريان"</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-between items-center">
              <div className="flex gap-6">
                <div className="bg-white px-4 py-2 rounded border shadow-sm text-center min-w-[120px]">
                  <span className="text-xs text-gray-500 block mb-1">إجمالي العدد (قطع)</span>
                  <span className="font-bold text-xl">{rayanStats.totalStock}</span>
                </div>
                <div className="bg-white px-4 py-2 rounded border shadow-sm text-center min-w-[150px]">
                  <span className="text-xs text-gray-500 block mb-1">إجمالي القيمة المالية</span>
                  <span className="font-bold text-xl text-green-600">{formatCurrency(rayanStats.totalValue)} د.ع</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePrintRayanInventory} className="gap-2 bg-gray-800 hover:bg-gray-900 text-white">
                  <Printer className="w-4 h-4" />
                  طباعة الجرد
                </Button>
                <Button variant="secondary" onClick={() => setShowRayanModal(false)}>إغلاق</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إدخال فاتورة شراء */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-t-lg">
              <h2 className="font-bold text-lg text-white flex items-center gap-2">
                <FilePlus className="w-5 h-5" />
                {editingPurchaseId ? "تعديل فاتورة شراء" : "إدخال فاتورة شراء (زيادة مخزون)"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowPurchaseModal(false)} className="text-white hover:bg-white/10">
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="p-4 border-b bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <Label>رقم الفاتورة</Label>
                    <Input value={purchaseMeta.number} onChange={e => setPurchaseMeta({...purchaseMeta, number: e.target.value})} placeholder="مثال: 1023" />
                </div>
                <div>
                    <Label>التاريخ</Label>
                    <Input type="date" value={purchaseMeta.date} onChange={e => setPurchaseMeta({...purchaseMeta, date: e.target.value})} />
                </div>
                <div>
                    <Label>المسؤول / الكاشير</Label>
                    <Input value={purchaseMeta.cashier} onChange={e => setPurchaseMeta({...purchaseMeta, cashier: e.target.value})} />
                </div>
                <div>
                    <Label>المورد *</Label>
                    <Input 
                        list="suppliers-list"
                        value={purchaseMeta.supplier} 
                        onChange={e => setPurchaseMeta({...purchaseMeta, supplier: e.target.value})} 
                        placeholder="اسم المورد (مطلوب)" 
                    />
                    <datalist id="suppliers-list">
                        {uniqueSuppliers.map((supplier) => (
                            <option key={supplier} value={supplier} />
                        ))}
                    </datalist>
                </div>
                <div className="relative md:col-span-3">
                    <Label>بحث لإضافة منتج</Label>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        <Input 
                            value={purchaseSearch} 
                            onChange={e => setPurchaseSearch(e.target.value)} 
                            placeholder="ابحث بالاسم أو الباركود..." 
                            className="pl-8 text-right"
                        />
                    </div>
                    {purchaseSearch && (
                        <div className="absolute w-full bg-white border shadow-lg rounded-md mt-1 max-h-48 overflow-y-auto z-50">
                            {products.filter((p: any) => p.name.includes(purchaseSearch) || p.barcode?.includes(purchaseSearch)).map((p: any) => (
                                <div 
                                    key={p.id} 
                                    className="p-2 hover:bg-gray-100 cursor-pointer text-sm flex justify-between"
                                    onClick={() => handleAddPurchaseItem(p)}
                                >
                                    <span>{p.name}</span>
                                    <span className="text-gray-500 text-xs">{p.stock} في المخزون</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="px-4 pb-3 border-b bg-white flex flex-wrap gap-3">
              <div className="px-4 py-2 rounded-xl border bg-slate-50">
                <div className="text-xs text-slate-500">عدد المواد</div>
                <div className="text-lg font-bold text-slate-700">{purchaseItems.length}</div>
              </div>
              <div className="px-4 py-2 rounded-xl border bg-emerald-50">
                <div className="text-xs text-emerald-700">الإجمالي التقريبي</div>
                <div className="text-lg font-bold text-emerald-700">{formatCurrency(purchasePreviewTotal)} د.ع</div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-0" ref={purchaseListRef}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 sticky top-0">
                    <TableHead className="text-right w-[40%]">المنتج</TableHead>
                    <TableHead className="text-center">المخزون الحالي</TableHead>
                    <TableHead className="text-center w-[15%]">الكمية المضافة ({purchaseMode === 'boxes' ? 'كرتون' : 'قطعة'})</TableHead>
                    <TableHead className="text-center w-[15%]">سعر الشراء (للصندوق)</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseItems.length > 0 ? purchaseItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/60">
                      <TableCell className="font-medium">
                        <div>{item.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          سعر الصندوق: {formatCurrency(Number(item.newCost || 0))} د.ع
                        </div>
                        <div className="text-xs text-emerald-700">
                          الإجمالي التقريبي: {formatCurrency(calcPurchaseLineTotal(item))} د.ع
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-gray-500">{item.stock}</TableCell>
                      <TableCell className="text-center">
                        <Input type="number" min="0.1" step="any" value={item.addQuantity} onChange={e => setPurchaseItems(purchaseItems.map(i => i.id === item.id ? {...i, addQuantity: e.target.value} : i))} className="h-8 text-center" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input type="number" value={item.newCost} onChange={e => setPurchaseItems(purchaseItems.map(i => i.id === item.id ? {...i, newCost: e.target.value} : i))} className="h-8 text-center" />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleRemovePurchaseItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">لم يتم إضافة منتجات للفاتورة بعد</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPurchaseModal(false)}>إلغاء</Button>
                <Button onClick={handlePurchaseSubmit} className="bg-green-600 hover:bg-green-700 gap-2">
                    <Save className="w-4 h-4" />
                    {editingPurchaseId ? "حفظ التعديلات" : "حفظ الفاتورة وتحديث المخزون"}
                </Button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة سجل فواتير الشراء */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-purple-50 rounded-t-lg">
              <h2 className="font-bold text-lg text-purple-800 flex items-center gap-2">
                <History className="w-5 h-5" />
                سجل فواتير الشراء المضافة
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowHistoryModal(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="flex-1 overflow-auto p-0 max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 sticky top-0">
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-center">التاريخ</TableHead>
                    <TableHead className="text-center">الكاشير</TableHead>
                    <TableHead className="text-center">المورد</TableHead>
                    <TableHead className="text-center" style={{width: "100px"}}>عدد المواد</TableHead>
                    <TableHead className="text-center">الإجمالي (تقريبي)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockInvoices.length > 0 ? stockInvoices.map((record: any) => (
                    <TableRow 
                        key={record.id} 
                        className="cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => handleEditPurchase(record)}
                    >
                      <TableCell className="font-bold">{record.invoiceNumber}</TableCell>
                      <TableCell className="text-center">{record.date}</TableCell>
                      <TableCell className="text-center text-blue-600">{record.cashier}</TableCell>
                      <TableCell className="text-center text-slate-600">{record.supplierName || "-"}</TableCell>
                      <TableCell className="text-center">{record.itemsCount}</TableCell>
                      <TableCell className="text-center font-bold text-green-600">{formatCurrency(record.totalAmount)}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">لا يوجد سجل فواتير</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* نافذة سجل حركة المنتج */}
      {historyProduct && (
        <ProductHistoryModal
          productId={historyProduct.id}
          productName={historyProduct.name}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
};

export default ProductManagement;
