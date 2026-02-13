import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ShoppingCart, ChevronsUpDown, Check, Plus, X, Settings, AlertTriangle, RotateCcw, Search, Barcode, CreditCard, Banknote, User, Package, Info, Snowflake, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const SalesInterface = ({ currentUser, soundEnabled = true, allowPriceEdit = false }: { currentUser: any, soundEnabled?: boolean, allowPriceEdit?: boolean }) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const barcodeInputRef = useRef(null);
  const cartScrollRef = useRef<HTMLDivElement>(null);

  // دالة لتنسيق الأرقام باللغة الانجليزية
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    }).format(value);
  };

  // طباعة بيانات المستخدم الحالي في الكونسول للتأكد من وصولها
  useEffect(() => {
    console.log("Current User Data:", currentUser);
  }, [currentUser]);

  // إدارة التبويبات (الفواتير المفتوحة)
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = localStorage.getItem("pos_tabs");
      const parsed = saved ? JSON.parse(saved) : null;
      return (parsed && Array.isArray(parsed) && parsed.length > 0) ? parsed : [{
        id: 1,
        cart: [],
        paymentMethod: "cash",
        discount: 0,
        selectedClientId: "",
        clientName: "",
        editingSaleId: null,
        amountReceived: 0
      }];
    } catch {
      return [{
        id: 1,
        cart: [],
        paymentMethod: "cash",
        discount: 0,
        selectedClientId: "",
        clientName: "",
        editingSaleId: null,
        amountReceived: 0
      }];
    }
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = localStorage.getItem("pos_activeTabId");
    return saved ? Number(saved) : 1;
  });

  // حفظ التبويبات عند أي تغيير لضمان عدم ضياع البيانات عند التنقل
  useEffect(() => {
    localStorage.setItem("pos_tabs", JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem("pos_activeTabId", String(activeTabId));
  }, [activeTabId]);

  // استخراج بيانات التبويب النشط
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const cart = activeTab.cart;
  const paymentMethod = activeTab.paymentMethod;
  const discount = activeTab.discount;
  const selectedClientId = activeTab.selectedClientId;
  const clientName = activeTab.clientName;
  const amountReceived = activeTab.amountReceived || 0;

  // سكرول تلقائي لأسفل القائمة عند إضافة منتج جديد
  useEffect(() => {
    if (cartScrollRef.current) {
      cartScrollRef.current.scrollTop = cartScrollRef.current.scrollHeight;
    }
  }, [cart.length, activeTabId]);

  const [barcode, setBarcode] = useState("");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState(""); // حالة جديدة للبحث اليدوي
  const [autoPrint, setAutoPrint] = useState(true);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  
  // إعدادات المتجر
  const [showSettings, setShowSettings] = useState(false);
  const [storeSettings, setStoreSettings] = useState({ name: "", address: "", phone: "" });
  const [showAbout, setShowAbout] = useState(false);

  // حالة نافذة التجميد
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeSourceId, setFreezeSourceId] = useState<string>("");
  const [freezeTargetId, setFreezeTargetId] = useState<string>("");
  const [freezeQty, setFreezeQty] = useState("");

  // حالة التعامل مع الباركود المكرر
  const [duplicateProducts, setDuplicateProducts] = useState<any[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => window.api.listProducts(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => window.api.listClients(),
  });

  // جلب إعدادات المتجر
  useQuery({
    queryKey: ["appSettings"],
    queryFn: async () => {
      const name = await window.api.getAppSetting('storeName');
      const address = await window.api.getAppSetting('storeAddress');
      const phone = await window.api.getAppSetting('storePhone');
      const settings = { name: name || "مركز الجمجمة", address: address || "", phone: phone || "" };
      setStoreSettings(settings);
      return settings;
    }
  });

  const productsWithoutBarcode = useMemo(
    () => products.filter((p) => !p.barcode).sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  // دالة لتشغيل صوت تنبيه عند الخطأ (منتج غير موجود)
  const playErrorSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sawtooth'; // صوت حاد للتنبيه
      osc.frequency.setValueAtTime(220, ctx.currentTime); // تردد منخفض
      gain.gain.setValueAtTime(0.1, ctx.currentTime); // مستوى الصوت

      osc.start();
      osc.stop(ctx.currentTime + 0.2); // مدة الصوت
    } catch (e) { console.error(e); }
  };

  // دالة لتشغيل صوت نجاح خفيف عند إضافة منتج
  const playSuccessSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine'; // صوت ناعم
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime); // مستوى صوت أعلى

      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) { console.error(e); }
  };

  // التركيز التلقائي على حقل الباركود عند تحميل الصفحة
  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, []);

  // استماع لحدث الضغط على الأزرار (للقراءة من الباركود حتى لو لم يكن الحقل محدداً)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. تجاهل الحدث إذا تم التعامل معه مسبقاً أو كان زر Escape (للسماح بالخروج من القوائم)
      if (e.defaultPrevented || e.key === 'Escape') return;

      // إصلاح: منع التقاط الباركود إذا كانت هناك نافذة منبثقة مفتوحة (مثل الملاحظات أو الإعدادات) لتجنب تضارب الإدخال
      if (
        document.querySelector('[role="dialog"]') || 
        document.querySelector('[role="alertdialog"]') || 
        document.querySelector('[aria-modal="true"]') || 
        document.querySelector('[data-state="open"]') || 
        document.querySelector('.daily-notes-content') || 
        document.querySelector('.fixed.inset-0')
      ) return;

      const target = e.target as HTMLElement;
      
      // 2. تحسين التحقق من العناصر التفاعلية لتشمل القوائم المنسدلة والمحتوى القابل للتعديل
      const isInteractive = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.tagName === 'BUTTON' || target.isContentEditable || (target.closest && target.closest('[contenteditable="true"]'));

      if (isInteractive) {
        return;
      }

      // إذا كان الحرف قابلاً للطباعة (تجاهل الاختصارات)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
        setBarcode((prev) => prev + e.key);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // دوال إدارة التبويبات
  const addNewTab = () => {
    const newId = Math.max(...tabs.map(t => t.id), 0) + 1;
    setTabs([...tabs, {
      id: newId,
      cart: [],
      paymentMethod: "cash",
      discount: 0,
      selectedClientId: "",
      clientName: "",
      editingSaleId: null,
      amountReceived: 0
    }]);
    setActiveTabId(newId);
  };

  const closeTab = (id) => {
    if (tabs.length === 1) return; // لا تغلق آخر تبويب
    
    const tabIndexToRemove = tabs.findIndex(t => t.id === id);
    const activeTabIndex = tabs.findIndex(t => t.id === activeTabId);

    const filteredTabs = tabs.filter(t => t.id !== id);
    
    // إعادة تسلسل الأرقام (1, 2, 3...) لضمان الترتيب الصحيح
    const reindexedTabs = filteredTabs.map((t, index) => ({
      ...t,
      id: index + 1
    }));

    setTabs(reindexedTabs);

    if (id === activeTabId) {
      // إذا أغلقنا التبويب النشط، ننتقل للذي قبله أو بعده
      let newActiveIndex = tabIndexToRemove;
      if (newActiveIndex >= reindexedTabs.length) {
        newActiveIndex = reindexedTabs.length - 1;
      }
      setActiveTabId(reindexedTabs[newActiveIndex].id);
    } else {
      // إذا أغلقنا تبويب آخر، نحدث رقم التبويب النشط الحالي ليطابق موقعه الجديد
      let newActiveIndex = activeTabIndex;
      if (tabIndexToRemove < activeTabIndex) {
        newActiveIndex = activeTabIndex - 1;
      }
      setActiveTabId(reindexedTabs[newActiveIndex].id);
    }
  };

  const updateActiveTab = (updates) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const createSale = useMutation({
    mutationFn: (payload) => window.api.createSale(payload),
    onSuccess: async (newSale) => {
      toast({ title: "نجاح", description: "تم إنشاء الفاتورة بنجاح." });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      
      // إذا كان هناك أكثر من تبويب، أغلق الحالي. وإلا، أعد تعيينه.
      if (tabs.length > 1) {
        closeTab(activeTabId);
      } else {
        updateActiveTab({
          cart: [],
          paymentMethod: "cash",
          discount: 0,
          selectedClientId: "",
          clientName: "",
          editingSaleId: null,
          amountReceived: 0
        });
      }

      // إعادة التركيز على حقل الباركود بعد إتمام البيع
      if (barcodeInputRef.current) barcodeInputRef.current.focus();

      if (autoPrint && newSale) {
        try {
          // 1. تجميع بيانات الإيصال في كائن صريح ومحدد
          const now = new Date(newSale.createdAt);
          const subTotalVal = newSale.items.reduce((sum, item) => sum + item.quantity * item.price, 0);

          const finalClientName = activeTab.clientName || (selectedClientId ? clients.find(c => String(c.id) === selectedClientId)?.name : null);
          
          const isRamadan = localStorage.getItem("ramadanMode") === "true";

          const totalValue = Number(newSale.total ?? total ?? 0);
          const receivedAmount = amountReceived > 0
            ? Math.min(amountReceived, totalValue)
            : (paymentMethod === 'debt' ? 0 : totalValue);
          const remainingAmount = Math.max(0, totalValue - receivedAmount);

          const receiptPayload = {
            store: {
              name: isRamadan ? `🌙 ${storeSettings.name} 🌙` : storeSettings.name, // تغيير شكل اسم المتجر في الوصل
              address: storeSettings.address,
              phone: storeSettings.phone,
            },
            invoice: {
              number: newSale.id,
              date: now.toLocaleDateString("en-US"),
              time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
              cashier: currentUser?.name || currentUser?.username,
              client: finalClientName,
              items: newSale.items.map(item => {
                const p = products.find(prod => prod.id === item.productId);
                return {
                  name: p?.name || `منتج ${item.productId}`,
                  qty: item.quantity,
                  price: item.price,
                  total: item.quantity * item.price
                };
              }),
              subtotal: subTotalVal,
              discount: newSale.discount,
              total: totalValue,
              received: receivedAmount,
              remaining: remainingAmount,
            },
            footer: isRamadan ? "🌙 رمضان مبارك 🌙 - تقبل الله طاعاتكم - شكراً لزيارتكم 🌹" : "شكراً لزيارتكم 🌹",
            qr: "https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL", // رابط احتياطي
            qrImage: "qr.png",
          };
          // 2. إرسال كائن الإيصال مباشرة إلى Electron
          await window.api.printThermalReceipt(receiptPayload);
          toast({ title: "تمت الطباعة", description: "تم إرسال إيصال البيع إلى الطابعة." });
        } catch (printErr: any) {
          toast({
            title: "خطأ في الطباعة التلقائية",
            description: printErr.message || "فشل الاتصال بالطابعة.",
            variant: "destructive",
          });
        }
      }
    },
    onError: (err: any) => {
      toast({
        title: "خطأ",
        description: err.message || "فشل في إنشاء الفاتورة.",
        variant: "destructive",
      });
    },
  });

  // دالة تعديل الفاتورة
  const updateSaleMutation = useMutation({
    mutationFn: (payload) => window.api.updateSale(payload),
    onSuccess: async (updatedSale) => {
      toast({ title: "تم التعديل", description: "تم تعديل الفاتورة بنجاح." });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      
      // إعادة تعيين التبويب
      updateActiveTab({
        cart: [],
        paymentMethod: "cash",
        discount: 0,
        selectedClientId: "",
        clientName: "",
        editingSaleId: null,
        amountReceived: 0
      });

      if (barcodeInputRef.current) barcodeInputRef.current.focus();
      
      if (autoPrint && updatedSale) {
        try {
          const now = new Date();
          const subTotalVal = updatedSale.items.reduce((sum, item) => sum + item.quantity * item.price, 0);

          const finalClientName = clientName || (selectedClientId ? clients.find(c => String(c.id) === selectedClientId)?.name : null) || updatedSale.clientName;

          const isRamadan = localStorage.getItem("ramadanMode") === "true";

          const totalValue = Number(updatedSale.total ?? 0);
          const receivedAmount = amountReceived > 0
            ? Math.min(amountReceived, totalValue)
            : (paymentMethod === 'debt' ? 0 : totalValue);
          const remainingAmount = Math.max(0, totalValue - receivedAmount);

          const receiptPayload = {
            store: {
              name: isRamadan ? `🌙 ${storeSettings.name} 🌙` : storeSettings.name,
              address: storeSettings.address,
              phone: storeSettings.phone,
            },
            invoice: {
              number: updatedSale.id,
              date: now.toLocaleDateString("en-US"),
              time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
              cashier: currentUser?.name || currentUser?.username,
              client: finalClientName,
              items: updatedSale.items.map(item => {
                const p = products.find(prod => prod.id === item.productId);
                return {
                  name: p?.name || `منتج ${item.productId}`,
                  qty: item.quantity,
                  price: item.price,
                  total: item.quantity * item.price
                };
              }),
              subtotal: subTotalVal,
              discount: updatedSale.discount,
              total: totalValue,
              received: receivedAmount,
              remaining: remainingAmount,
            },
            footer: isRamadan ? "🌙 رمضان مبارك 🌙 - تقبل الله طاعاتكم - شكراً لزيارتكم 🌹 (تعديل)" : "شكراً لزيارتكم 🌹 (تعديل)",
            qr: "https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL",
            qrImage: "qr.png",
          };
          
          await window.api.printThermalReceipt(receiptPayload);
          toast({ title: "تمت الطباعة", description: "تم إرسال إيصال التعديل إلى الطابعة." });
        } catch (printErr: any) {
          toast({
            title: "خطأ في الطباعة التلقائية",
            description: printErr.message || "فشل الاتصال بالطابعة.",
            variant: "destructive",
          });
        }
      }
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message || "فشل تعديل الفاتورة.", variant: "destructive" });
    },
  });

  // دالة تحويل المنتج للتجميد
  const freezeMutation = useMutation({
    mutationFn: (data: any) => window.api.freezeProduct(data),
    onSuccess: () => {
      toast({ title: "تم التحويل", description: "تم تحويل الكمية إلى المجمد بنجاح." });
      setFreezeOpen(false);
      setFreezeSourceId("");
      setFreezeTargetId("");
      setFreezeQty("");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message || "فشل التحويل", variant: "destructive" })
  });

  const handleFreezeSubmit = () => {
    if (!freezeSourceId || !freezeTargetId || !freezeQty) return;
    if (freezeSourceId === freezeTargetId) { toast({ title: "تنبيه", description: "لا يمكن التحويل لنفس المنتج", variant: "destructive" }); return; }
    freezeMutation.mutate({ fromId: freezeSourceId, toId: freezeTargetId, quantity: Number(freezeQty) });
  };

  const handleBarcodeScan = (e) => {
    if (e.key === "Enter" && barcode.trim()) {
      const scannedCode = barcode.trim();
      const matchedProducts = products.filter((p) => String(p.barcode || "").trim() === scannedCode);

      if (matchedProducts.length === 1) {
        addToCart(matchedProducts[0]);
        playSuccessSound();
      } else if (matchedProducts.length > 1) {
        setDuplicateProducts(matchedProducts);
        setShowDuplicateDialog(true);
        playSuccessSound();
      } else {
        playErrorSound();
        toast({
          title: "خطأ",
          description: "المنتج غير موجود.",
          variant: "destructive",
        });
      }
      setBarcode("");
      // ضمان بقاء التركيز بعد المسح إذا لم تفتح نافذة الاختيار
      if (matchedProducts.length <= 1 && barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }
  };

  const toggleFrozenStatus = (item: any) => {
    // البحث عن المنتج الأصلي في القائمة للحصول على معرف البديل
    const product = products.find(p => p.id === item.productId);
    
    if (!product || !product.alternativeProductId) {
        toast({ title: "تنبيه", description: "لم يتم تحديد منتج بديل لهذا الصنف في إدارة المنتجات.", variant: "destructive" });
        return;
    }

    const target = products.find(p => String(p.id) === String(product.alternativeProductId));

    if (target) {
      setTabs(prevTabs => {
        return prevTabs.map(tab => {
          if (tab.id === activeTabId) {
            const newCart = tab.cart.map(cartItem => {
              if (cartItem.productId === item.productId) {
                return {
                  ...cartItem,
                  productId: target.id,
                  name: target.name,
                  price: target.price, // تحديث السعر للسعر الجديد
                  barcode: target.barcode,
                  categoryName: target.categoryName,
                  alternativeProductId: target.alternativeProductId
                };
              }
              return cartItem;
            });
            return { ...tab, cart: newCart };
          }
          return tab;
        });
      });
      playSuccessSound();
    } else {
      toast({ title: "خطأ", description: "المنتج البديل المحدد غير موجود في قاعدة البيانات.", variant: "destructive" });
    }
  };

  const addToCart = (product) => {
    setTabs(prevTabs => {
      return prevTabs.map(tab => {
        if (tab.id === activeTabId) {
          const existingItem = tab.cart.find((item) => item.productId === product.id);
          let newCart;
          if (existingItem) {
            newCart = tab.cart.map((item) =>
              item.productId === product.id
                ? { ...item, quantity: item.quantity + 1 }
                : item
            );
          } else {
            newCart = [
              ...tab.cart,
              {
                productId: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
                barcode: product.barcode,
                categoryName: product.categoryName,
                alternativeProductId: product.alternativeProductId
              },
            ];
          }
          return { ...tab, cart: newCart };
        }
        return tab;
      });
    });
    // إعادة التركيز على حقل الباركود (مفيد جداً عند النقر على أزرار المنتجات السريعة)
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const removeFromCart = (productId) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, cart: t.cart.filter(i => i.productId !== productId) } : t));
  };

  const updateCartQuantity = (productId, newQuantity) => {
    const quantity = parseInt(newQuantity, 10);
    setTabs(prevTabs => {
      return prevTabs.map(tab => {
        if (tab.id === activeTabId) {
          if (isNaN(quantity) || quantity <= 0) {
            return { ...tab, cart: tab.cart.filter((item) => item.productId !== productId) };
          }
          return {
            ...tab,
            cart: tab.cart.map((item) =>
              item.productId === productId ? { ...item, quantity: quantity } : item
            )
          };
        }
        return tab;
      });
    });
  };

  const updateCartPrice = (productId: number, newPrice: string) => {
    const price = parseFloat(newPrice);
    setTabs(prevTabs => {
      return prevTabs.map(tab => {
        if (tab.id === activeTabId) {
          return {
            ...tab,
            cart: tab.cart.map((item) =>
              item.productId === productId ? { ...item, price: isNaN(price) ? 0 : price } : item
            )
          };
        }
        return tab;
      });
    });
  };


  const itemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const subTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const commission = 0; // العمولة ملغاة بشكل دائم
  const total = useMemo(() => subTotal - discount, [subTotal, discount]);
  const change = amountReceived - total;

  const handleCreateSale = () => {
    try {
      if (cart.length === 0) {
        toast({ title: "تنبيه", description: "السلة فارغة!", variant: "destructive" });
        return;
      }

      if (paymentMethod === "debt" && !selectedClientId && !clientName.trim()) {
        toast({ title: "تنبيه", description: "يرجى اختيار أو إدخال اسم العميل للفاتورة الآجلة.", variant: "destructive" });
        return;
      }

      const computedClientName = clientName || (selectedClientId ? clients.find(c => String(c.id) === String(selectedClientId))?.name : "") || "";
      const hasPartialPayment = amountReceived > 0 && amountReceived < total;
      if (hasPartialPayment && !computedClientName) {
        toast({ title: "تنبيه", description: "يرجى إدخال اسم العميل عند دفع جزء من الفاتورة.", variant: "destructive" });
        return;
      }

      if (activeTab.editingSaleId) {
        // وضع التعديل
        updateSaleMutation.mutate({
          saleId: activeTab.editingSaleId,
          items: cart,
          discount: discount,
          paymentMethod: paymentMethod,
          clientId: selectedClientId ? Number(selectedClientId) : null,
          clientName: computedClientName
        });
      } else {
        // وضع الإنشاء الجديد
        createSale.mutate({
          items: cart,
          paymentMethod: paymentMethod,
          cashierId: currentUser?.id,
          discount: discount,
          clientId: selectedClientId ? Number(selectedClientId) : null,
          clientName: computedClientName,
          amountReceived: amountReceived
        });
      }
    } catch (error) {
      console.error("Error in handleCreateSale:", error);
      toast({ title: "خطأ غير متوقع", description: "حدثت مشكلة أثناء محاولة الحفظ. يرجى المحاولة مرة أخرى.", variant: "destructive" });
    }
  };

  const handleRetrieveLastSale = async () => {
    try {
      const lastSale = await window.api.getLastSale();
      if (!lastSale) {
        toast({ title: "تنبيه", description: "لا توجد فواتير سابقة.", variant: "destructive" });
        return;
      }

      const newCart = lastSale.items.map((item) => ({
        productId: item.productId,
        name: item.product?.name || "منتج غير معروف",
        price: item.price,
        quantity: item.quantity,
      }));

      updateActiveTab({
        cart: newCart,
        paymentMethod: lastSale.paymentMethod,
        discount: lastSale.discount,
        selectedClientId: lastSale.clientId ? String(lastSale.clientId) : "",
        clientName: lastSale.clientName || "",
        editingSaleId: lastSale.id,
        amountReceived: 0
      });

      toast({ title: "تم الاسترجاع", description: `تم استرجاع الفاتورة #${lastSale.id} للتعديل.` });
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل استرجاع الفاتورة.", variant: "destructive" });
    }
  };

  const cancelEdit = () => {
    updateActiveTab({
      cart: [],
      paymentMethod: "cash",
      discount: 0,
      selectedClientId: "",
      clientName: "",
      editingSaleId: null,
      amountReceived: 0
    });
  };

  const saveSettings = async () => {
    await window.api.setAppSetting({ key: 'storeName', value: storeSettings.name });
    await window.api.setAppSetting({ key: 'storeAddress', value: storeSettings.address });
    await window.api.setAppSetting({ key: 'storePhone', value: storeSettings.phone });
    toast({ title: "تم الحفظ", description: "تم تحديث معلومات المركز بنجاح." });
    setShowSettings(false);
    qc.invalidateQueries({ queryKey: ["appSettings"] });
  };

  const handleFactoryReset = async () => {
    if (confirm("تحذير هام جداً!\n\nهل أنت متأكد من حذف كافة بيانات التطبيق؟\nسيتم حذف جميع الفواتير، المنتجات، الديون، والعملاء.\n\nسيتم إعادة تشغيل التطبيق كأنه جديد.")) {
      if (confirm("تأكيد نهائي: هل أنت متأكد؟ لا يمكن التراجع عن هذه العملية.")) {
        await window.api.factoryReset();
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 bg-slate-100/50 h-[calc(100vh-4rem)] overflow-hidden font-sans" dir="rtl">
      {/* قسم المنتجات السريعة (بدون باركود) */}
      <aside className="lg:w-[280px] xl:w-[320px] shrink-0 h-full flex flex-col">
        <Card className="h-full flex flex-col shadow-lg border-0 rounded-2xl overflow-hidden bg-white ring-1 ring-slate-900/5">
          <CardHeader className="p-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-700">
              <Package className="w-5 h-5 text-blue-600" />
              منتجات سريعة
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 bg-slate-50/50">
            {productsWithoutBarcode.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {productsWithoutBarcode.map((product) => (
                  <Button
                    key={product.id}
                    variant="secondary"
                    className="h-auto py-3 px-2 text-xs whitespace-normal text-center leading-tight bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl flex flex-col justify-center gap-1"
                    onClick={() => addToCart(product)}
                  >
                    <span className="font-semibold text-slate-700 line-clamp-2">{product.name}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">لا توجد منتجات بدون باركود.</p>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* قسم الفاتورة */}
      <main className="flex-1 h-full flex flex-col overflow-hidden gap-3">
        {/* بانر رمضان يظهر فقط عند تفعيل الثيم */}
        {localStorage.getItem("ramadanMode") === "true" && (
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white p-2 rounded-xl shadow-md flex items-center justify-between px-4 shrink-0 animate-in fade-in slide-in-from-top-2 duration-500">
            <span className="font-bold flex items-center gap-2 text-sm">🌙 رمضان كريم - عروض خاصة</span>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded text-emerald-50">خصومات الشهر الفضيل</span>
          </div>
        )}
        {/* شريط التبويبات */}
        <div className="flex items-center gap-2 px-1 overflow-x-auto pb-1 no-scrollbar shrink-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-full cursor-pointer transition-all select-none shadow-sm border ${
                activeTabId === tab.id
                  ? "bg-blue-600 text-white border-blue-600 font-bold shadow-md transform scale-105"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="whitespace-nowrap">فاتورة {tab.id}</span>
              {tabs.length > 1 && (
                <X
                  className={`w-4 h-4 rounded-full p-0.5 transition-colors ${activeTabId === tab.id ? "hover:bg-blue-500 text-blue-100" : "hover:bg-slate-200 text-slate-400"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                />
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={addNewTab}
            className="rounded-full w-9 h-9 p-0 bg-white hover:bg-blue-50 border border-slate-200 shadow-sm text-blue-600"
            title="فاتورة جديدة"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        <Card className="w-full flex-1 flex flex-col overflow-hidden shadow-lg border-0 rounded-2xl bg-white ring-1 ring-slate-900/5">
        <CardHeader className="p-4 pb-3 shrink-0 border-b border-slate-100 bg-white z-10">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center text-lg font-bold text-slate-800">
                <div className={`p-2 rounded-lg ml-3 ${activeTab.editingSaleId ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
                  <ShoppingCart className="w-5 h-5" />
                </div>
                {activeTab.editingSaleId ? <span className="text-orange-600">تعديل الفاتورة #{activeTab.editingSaleId}</span> : "سلة المشتريات"}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-100" onClick={() => setShowAbout(true)} title="عن التطبيق">
                <Info className="w-5 h-5 text-slate-500" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-blue-50" onClick={() => setFreezeOpen(true)} title="تجميد منتجات (تحويل مخزون)">
                <Snowflake className="w-5 h-5 text-blue-400" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-100" onClick={() => setShowSettings(true)} title="إعدادات المركز">
                <Settings className="w-5 h-5 text-slate-500" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600" onClick={handleRetrieveLastSale} title="استرجاع آخر فاتورة">
                  <RotateCcw className="h-5 w-5" />
                </Button>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={productSearchOpen} className="w-[200px] h-10 rounded-xl border-slate-200 text-slate-600 justify-between hover:border-blue-300 hover:bg-slate-50">
                    <span className="flex items-center gap-2"><Search className="w-4 h-4" /> بحث بالاسم...</span>
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command shouldFilter={false}> 
                    <CommandInput placeholder="اكتب اسم المنتج..." onValueChange={setProductSearchQuery} />
                    <CommandList>
                      <CommandEmpty>لا يوجد منتج بهذا الاسم.</CommandEmpty>
                      <CommandGroup>
                        {products
                          .filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase()))
                          .slice(0, 30) // تحسين الأداء: عرض أول 30 نتيجة فقط
                          .map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.name}
                            onSelect={() => {
                              addToCart(product);
                              setProductSearchOpen(false);
                            }}
                          >
                            {product.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder="امسح الباركود..."
                  className="w-48 h-10 pl-9 text-right text-sm rounded-xl border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={handleBarcodeScan}
                  autoFocus
                />
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 flex flex-col overflow-hidden bg-slate-50/30">
          {/* قائمة المنتجات المضافة - مع سكرول */}
          <div className="flex-1 overflow-y-auto bg-white" ref={cartScrollRef}>
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 shadow-sm z-10">
                <TableRow>
                  <TableHead className="text-right font-bold text-slate-700">المنتج</TableHead>
                  <TableHead className="text-center w-[100px] font-bold text-slate-700">الكمية</TableHead>
                  <TableHead className="text-center w-[140px] font-bold text-slate-700">سعر القطعة</TableHead>
                  <TableHead className="text-left w-[140px] font-bold text-slate-700">الإجمالي</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <ShoppingCart className="w-12 h-12 opacity-20" />
                        <p>السلة فارغة، ابدأ بإضافة المنتجات</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map((item) => {
                    const isFrozen = item.name.includes("مجمد") || item.name.includes("البوادي");
                    const showFrozenToggle = item.alternativeProductId && item.categoryName === 'الريان';
                    return (
                    <TableRow key={item.productId} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100">
                      <TableCell className="font-semibold text-slate-800">
                        <div className="flex flex-col gap-1">
                          <span>{item.name}</span>
                          {showFrozenToggle && (
                            <div className="flex items-center gap-2 mt-1">
                              <Checkbox 
                                id={`frozen-${item.productId}`} 
                                checked={isFrozen}
                                onCheckedChange={() => toggleFrozenStatus(item)}
                                className={`h-5 w-5 border-2 border-blue-600 transition-colors ${isFrozen ? "!bg-blue-600 !border-blue-600 !text-white" : "bg-white"}`}
                              />
                              <Label htmlFor={`frozen-${item.productId}`} className="text-xs text-blue-600 cursor-pointer select-none font-bold">
                                تبديل (مجمد / طازج)
                              </Label>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateCartQuantity(item.productId, e.target.value)}
                          className="w-20 h-8 text-center mx-auto border-slate-200 focus:border-blue-500 rounded-lg"
                          min="1"
                        />
                      </TableCell>
                      <TableCell className="text-center text-slate-600">
                        {allowPriceEdit ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.price}
                            onChange={(e) => updateCartPrice(item.productId, e.target.value)}
                            className="w-24 h-8 text-center mx-auto border-slate-200 focus:border-blue-500 rounded-lg"
                          />
                        ) : (
                          formatCurrency(item.price)
                        )}
                      </TableCell>
                      <TableCell className="text-left font-bold text-blue-700">{formatCurrency(item.price * item.quantity)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                          onClick={() => removeFromCart(item.productId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )})
                )}
              </TableBody>
            </Table>
          </div>

          {/* ملخص الفاتورة + الدفع + الإجراءات (تصميم مضغوط) */}
          <div className="mt-auto shrink-0 bg-white border-t border-slate-100 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)] z-20 p-3 space-y-2">
            
            {/* الصف الأول: الأرقام (العدد، المجموع، الخصم، الإجمالي) */}
            <div className="flex items-center justify-between gap-2 text-sm">
               <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                 <span className="text-slate-500 text-xs">العدد:</span>
                 <span className="font-bold text-slate-800">{itemsCount}</span>
               </div>
               <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                 <span className="text-slate-500 text-xs">المجموع:</span>
                 <span className="font-bold text-slate-800">{formatCurrency(subTotal)}</span>
               </div>
               <div className="flex items-center gap-1">
                 <span className="text-slate-500 text-xs">الخصم:</span>
                 <Input
                    type="number"
                    value={discount}
                    onChange={(e) => updateActiveTab({ discount: Number(e.target.value) || 0 })}
                    className="w-16 h-7 text-center bg-slate-50 border-slate-200 focus:border-blue-500 text-xs px-1"
                  />
               </div>
               <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100 ml-auto">
                 <span className="text-blue-600 font-bold text-xs">الإجمالي:</span>
                 <span className="text-lg font-black text-blue-700">{formatCurrency(total)}</span>
               </div>
            </div>

            {/* الصف الجديد: المبلغ المستلم والباقي */}
            <div className="grid grid-cols-2 gap-3">
               <div className="relative">
                 <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                   <Banknote className="w-4 h-4 text-slate-400" />
                 </div>
                 <Input
                   type="number"
                   className="pl-14 pr-9 h-10 text-lg font-bold text-slate-800 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-left dir-ltr"
                   placeholder="المبلغ المستلم"
                   value={amountReceived || ''}
                   onChange={(e) => updateActiveTab({ amountReceived: parseFloat(e.target.value) || 0 })}
                   onFocus={(e) => e.target.select()}
                 />
                 <span className="absolute -top-2 right-2 bg-white px-1 text-[10px] font-bold text-slate-500">المبلغ المستلم</span>
                 <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute left-1 top-1 h-8 text-[10px] text-blue-600 hover:bg-blue-50 px-2 font-bold"
                    onClick={() => updateActiveTab({ amountReceived: total })}
                    tabIndex={-1}
                  >
                    كامل
                  </Button>
               </div>

               <div className={`flex items-center justify-between px-4 rounded-xl border ${change >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} transition-colors relative overflow-hidden h-10`}>
                  <span className={`text-xs font-bold ${change >= 0 ? 'text-green-600' : 'text-red-500'} z-10`}>
                    {change >= 0 ? 'الباقي للزبون:' : 'المتبقي:'}
                  </span>
                  <span className={`text-lg font-black tracking-tight ${change >= 0 ? 'text-green-700' : 'text-red-600'} z-10`}>
                    {formatCurrency(Math.abs(change))}
                  </span>
                  <Banknote className={`absolute -bottom-1 -left-1 w-8 h-8 ${change >= 0 ? 'text-green-100' : 'text-red-100'} -rotate-12`} />
               </div>
            </div>

            {/* الصف الثاني: طريقة الدفع واسم العميل */}
            <div className="flex gap-2 items-center">
               {/* طريقة الدفع - تصميم أزرار مدمجة */}
               <RadioGroup
                 defaultValue="cash"
                 value={paymentMethod}
                 onValueChange={(val) => updateActiveTab({ paymentMethod: val })}
                 className="flex gap-1 bg-slate-100 p-1 rounded-lg h-9 items-center shrink-0"
               >
                 <div className="flex items-center">
                   <RadioGroupItem value="cash" id="cash" className="peer sr-only" />
                   <Label htmlFor="cash" className="px-3 py-1 rounded-md cursor-pointer text-xs font-bold text-slate-500 peer-data-[state=checked]:bg-white peer-data-[state=checked]:text-blue-600 peer-data-[state=checked]:shadow-sm transition-all select-none">
                     كاش
                   </Label>
                 </div>
                 <div className="flex items-center">
                   <RadioGroupItem value="mastercard" id="mastercard" className="peer sr-only" />
                   <Label htmlFor="mastercard" className="px-3 py-1 rounded-md cursor-pointer text-xs font-bold text-slate-500 peer-data-[state=checked]:bg-white peer-data-[state=checked]:text-blue-600 peer-data-[state=checked]:shadow-sm transition-all select-none">
                     ماستر
                   </Label>
                 </div>
                 <div className="flex items-center">
                   <RadioGroupItem value="debt" id="debt" className="peer sr-only" />
                   <Label htmlFor="debt" className="px-3 py-1 rounded-md cursor-pointer text-xs font-bold text-slate-500 peer-data-[state=checked]:bg-white peer-data-[state=checked]:text-red-600 peer-data-[state=checked]:shadow-sm transition-all select-none">
                     آجل
                   </Label>
                 </div>
               </RadioGroup>

               {/* اسم العميل */}
               <div className="flex-1 min-w-0">
                  <Input
                    type="text"
                    placeholder="اسم العميل..."
                    value={clientName || ""}
                    onChange={(e) => updateActiveTab({ clientName: e.target.value })}
                    className="h-9 bg-slate-50 border-slate-200 focus:bg-white transition-colors text-sm w-full"
                  />
               </div>
            </div>

            {/* الصف الثالث (مشروط): اختيار العميل للدين */}
            {paymentMethod === 'debt' && (
              <div className="w-full animate-in fade-in slide-in-from-top-1 duration-200">
                 <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={clientSearchOpen} className="w-full justify-between h-8 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 text-xs">
                        {selectedClientId
                          ? clients.find((client) => String(client.id) === selectedClientId)?.name
                          : "اختر حساب العميل للدين..."}
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="ابحث عن عميل..." className="text-right h-8 text-xs" />
                        <CommandList>
                          <CommandEmpty className="py-2 text-xs text-center">لا يوجد عميل.</CommandEmpty>
                          <CommandGroup>
                            {clients.map((client) => (
                              <CommandItem
                                key={client.id}
                                value={client.name}
                                onSelect={() => {
                                  updateActiveTab({ selectedClientId: String(client.id) });
                                  setClientSearchOpen(false);
                                }}
                                className="flex justify-between text-xs py-1.5"
                              >
                                <span>{client.name}</span>
                                {selectedClientId === String(client.id) && <Check className="h-3 w-3 opacity-100" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
              </div>
            )}

            {/* الصف الرابع: زر الإجراء */}
            <div className="flex gap-2 pt-1">
               {activeTab.editingSaleId && (
                  <Button variant="outline" onClick={cancelEdit} className="h-10 px-4 text-red-600 border-red-200 hover:bg-red-50 font-bold">
                    إلغاء
                  </Button>
               )}
               <Button
                  onClick={handleCreateSale}
                  className={`flex-1 h-10 text-base font-bold shadow-md transition-all hover:scale-[1.01] rounded-xl ${activeTab.editingSaleId ? "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-orange-200" : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-200"}`}
                  disabled={cart.length === 0 || createSale.isPending || updateSaleMutation.isPending}
               >
                  {createSale.isPending || updateSaleMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      جاري المعالجة...
                    </span>
                  ) : (
                    activeTab.editingSaleId ? "حفظ التعديلات" : "إتمام عملية البيع"
                  )}
               </Button>
            </div>

          </div>
        </CardContent>
        <CardFooter className="p-2 border-t shrink-0 bg-white text-xs text-slate-500 flex justify-between items-center">
            <div className="flex items-center space-x-2 space-x-reverse">
              <Checkbox id="auto-print" checked={autoPrint} onCheckedChange={(checked) => setAutoPrint(Boolean(checked))} />
              <label htmlFor="auto-print" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                طباعة تلقائية بعد البيع
              </label>
            </div>
            <div>
              نظام نقاط البيع - {storeSettings.name}
            </div>
          </CardFooter>
      </Card>
      </main>

      {/* نافذة إعدادات المركز */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96 bg-white">
            <CardHeader>
              <CardTitle>إعدادات المركز</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>اسم المركز</Label>
                <Input value={storeSettings.name} onChange={e => setStoreSettings({...storeSettings, name: e.target.value})} />
              </div>
              <div>
                <Label>العنوان</Label>
                <Input value={storeSettings.address} onChange={e => setStoreSettings({...storeSettings, address: e.target.value})} />
              </div>
              <div>
                <Label>رقم الهاتف</Label>
                <Input value={storeSettings.phone} onChange={e => setStoreSettings({...storeSettings, phone: e.target.value})} />
              </div>
              
              {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
                <div className="pt-4 border-t mt-4">
                  <Button variant="destructive" className="w-full bg-red-600 hover:bg-red-700" onClick={handleFactoryReset}>
                    <AlertTriangle className="w-4 h-4 ml-2" /> حذف كافة البيانات (إعادة ضبط المصنع)
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowSettings(false)}>إلغاء</Button>
                <Button onClick={saveSettings}>حفظ</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* نافذة عن التطبيق */}
      {showAbout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <Card className="w-[450px] bg-white shadow-2xl animate-in fade-in zoom-in duration-200 border-0">
            <CardHeader className="border-b pb-3 bg-slate-50/50 rounded-t-xl">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  <span>عن النظام</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowAbout(false)} className="h-8 w-8 p-0 rounded-full hover:bg-slate-200"><X className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                  <ShoppingCart className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">نظام نقاط البيع</h3>
                <p className="text-sm text-slate-500">إصدار 1.0.0</p>
              </div>

              <div className="space-y-3 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-[300px] overflow-y-auto">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  مميزات النظام الشاملة:
                </h4>
                <div className="space-y-4">
                  <div>
                    <h5 className="font-bold text-blue-700 mb-1 text-xs">1. نقطة البيع المتطورة:</h5>
                    <p className="text-xs leading-relaxed">واجهة بيع سريعة تدعم قارئ الباركود والبحث الذكي. تتيح لك فتح عدة فواتير (تبويبات) في وقت واحد لخدمة عدة زبائن، مع دعم كامل للبيع النقدي، الآجل (الديون)، والدفع بالبطاقة.</p>
                  </div>
                  
                  <div>
                    <h5 className="font-bold text-blue-700 mb-1 text-xs">2. إدارة المخزون والمنتجات:</h5>
                    <p className="text-xs leading-relaxed">نظام مرن لإدارة المنتجات يدعم الوحدات المتعددة (قطعة/صندوق) مع حساب تلقائي للأسعار. يتضمن تنبيهات للمخزون وإمكانية استيراد البيانات من الأنظمة القديمة.</p>
                  </div>

                  <div>
                    <h5 className="font-bold text-blue-700 mb-1 text-xs">3. العملاء والديون:</h5>
                    <p className="text-xs leading-relaxed">سجل متكامل للعملاء يتيح متابعة الديون بدقة، تسجيل الدفعات، وعرض كشف حساب لكل عميل، مما يسهل إدارة المستحقات المالية.</p>
                  </div>

                  <div>
                    <h5 className="font-bold text-blue-700 mb-1 text-xs">4. التقارير والأمان:</h5>
                    <p className="text-xs leading-relaxed">تقارير يومية للمبيعات والمصاريف، مع نظام صلاحيات للمستخدمين وسجل نشاطات لضمان أمان البيانات ومنع التلاعب.</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 text-center">
                <p className="font-bold text-slate-800 mb-1">جميع الحقوق محفوظة لشركة <span className="text-blue-600 font-black">CRO</span></p>
                <div className="inline-block px-3 py-1 bg-slate-100 rounded-full mt-2">
                  <p className="text-[10px] text-slate-500 font-mono tracking-wider">Developed by: Kazem Bashar Kazem</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* نافذة تجميد المنتجات */}
      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Snowflake className="w-5 h-5" />
              تحويل منتجات للتجميد
            </DialogTitle>
            <DialogDescription>
              نقل المخزون من المنتج الطازج إلى المنتج المجمد لتصحيح الجرد.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>المنتج الطازج (المصدر)</Label>
              <Select value={freezeSourceId} onValueChange={setFreezeSourceId}>
                <SelectTrigger><SelectValue placeholder="اختر المنتج الطازج..." /></SelectTrigger>
                <SelectContent dir="rtl">
                  {products.filter(p => p.categoryName === "الريان").map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} (المتوفر: {p.stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex justify-center">
              <ArrowRightLeft className="w-6 h-6 text-slate-400 rotate-90" />
            </div>

            <div className="space-y-2">
              <Label>المنتج المجمد (الهدف)</Label>
              <Select value={freezeTargetId} onValueChange={setFreezeTargetId}>
                <SelectTrigger><SelectValue placeholder="اختر المنتج المجمد..." /></SelectTrigger>
                <SelectContent dir="rtl">
                  {products.filter(p => p.categoryName !== "الريان").map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} (المتوفر: {p.stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الكمية المراد تجميدها</Label>
              <Input type="number" value={freezeQty} onChange={e => setFreezeQty(e.target.value)} placeholder="مثال: 10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>إلغاء</Button>
            <Button onClick={handleFreezeSubmit} disabled={freezeMutation.isPending} className="bg-blue-600 hover:bg-blue-700">تأكيد التحويل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة اختيار المنتج عند تكرار الباركود */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-[500px] z-[200]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-blue-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              باركود مشترك
            </DialogTitle>
            <DialogDescription>
              هذا الباركود مرتبط بأكثر من منتج. اختر المنتج الذي تريد بيعه:
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {duplicateProducts.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="h-auto py-4 px-4 flex justify-between items-center hover:bg-blue-50 border-slate-200"
                onClick={() => {
                  addToCart(p);
                  setShowDuplicateDialog(false);
                  setDuplicateProducts([]);
                  setTimeout(() => { if (barcodeInputRef.current) barcodeInputRef.current.focus(); }, 100);
                }}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-bold text-lg text-slate-800">{p.name}</span>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {p.categoryName || "بدون تصنيف"}
                  </Badge>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="font-bold text-blue-600 text-lg">{formatCurrency(p.price)} د.ع</span>
                  <span className={`text-xs ${p.stock > 0 ? "text-green-600" : "text-red-600"}`}>
                    المتوفر: {p.stock}
                  </span>
                </div>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              setShowDuplicateDialog(false);
              if (barcodeInputRef.current) barcodeInputRef.current.focus();
            }}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesInterface;
