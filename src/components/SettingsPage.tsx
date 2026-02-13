import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Store, 
  Printer, 
  Palette, 
  Database, 
  Archive,
  Save, 
  Moon, 
  Info, 
  Server, 
  Activity,
  ShieldAlert,
  Download,
  Upload,
  Layout,
  Zap,
  Type,
  Volume2,
  DollarSign,
  Package,
  Loader2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SettingsPageProps {
  currentUser: any;
  isRamadanMode: boolean;
  onToggleRamadan: () => void;
  themeColor: string;
  onThemeChange: (color: string) => void;
  compactMode: boolean;
  onCompactModeChange: (compact: boolean) => void;
  reduceAnimations: boolean;
  onAnimationsChange: (reduce: boolean) => void;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  allowPriceEdit: boolean;
  onAllowPriceEditChange: (allow: boolean) => void;
  purchaseMode: string;
  onPurchaseModeChange: (mode: string) => void;
  updateStatus: any;
}

const SettingsPage = ({ 
  currentUser, 
  isRamadanMode, 
  onToggleRamadan,
  themeColor,
  onThemeChange,
  compactMode,
  onCompactModeChange,
  reduceAnimations,
  onAnimationsChange,
  fontSize,
  onFontSizeChange,
  soundEnabled,
  onSoundEnabledChange,
  allowPriceEdit,
  onAllowPriceEditChange,
  purchaseMode,
  onPurchaseModeChange,
  updateStatus
}: SettingsPageProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");

  // --- Store Settings State ---
  const [storeSettings, setStoreSettings] = useState({ name: "", address: "", phone: "" });
  const [dailyWageEnabled, setDailyWageEnabled] = useState(true);
  const [dailyWageHourlyRate, setDailyWageHourlyRate] = useState("1.875");
  const [manualStockEditEnabled, setManualStockEditEnabled] = useState(true);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(false);
  const [autoArchiveRetentionDays, setAutoArchiveRetentionDays] = useState("15");
  const [isArchivingNow, setIsArchivingNow] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  
  // --- Printer Settings State ---
  const [printerEncoding, setPrinterEncoding] = useState("windows-1256");
  // --- Cloud Sync Settings State ---
  const [cloudSettings, setCloudSettings] = useState({
    enabled: false,
    serverUrl: "http://localhost:4000",
    storeId: "",
    storeSecret: ""
  });
  const [cloudStatus, setCloudStatus] = useState<any>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncDialogStatus, setSyncDialogStatus] = useState<"loading" | "success" | "error">("loading");
  const [syncDialogMessage, setSyncDialogMessage] = useState("");

  // --- Fetch Initial Data ---
  useQuery({
    queryKey: ["appSettings"],
    queryFn: async () => {
      const name = await window.api.getAppSetting('storeName');
      const address = await window.api.getAppSetting('storeAddress');
      const phone = await window.api.getAppSetting('storePhone');
      const encoding = await window.api.getAppSetting('printerEncoding');
      const cloudServerUrl = await window.api.getAppSetting('cloudServerUrl');
      const cloudStoreId = await window.api.getAppSetting('cloudStoreId');
      const cloudStoreSecret = await window.api.getAppSetting('cloudStoreSecret');
      const cloudSyncEnabled = await window.api.getAppSetting('cloudSyncEnabled');
      const wageEnabled = await window.api.getAppSetting('dailyWageEnabled');
      const wageRate = await window.api.getAppSetting('dailyWageHourlyRate');
      const manualStockEdit = await window.api.getAppSetting('manualStockEditEnabled');
      const autoArchiveEnabled = await window.api.getAppSetting('autoArchiveEnabled');
      const autoArchiveDays = await window.api.getAppSetting('autoArchiveRetentionDays');
      
      setStoreSettings({ 
        name: name || "مركز الجمجمة", 
        address: address || "", 
        phone: phone || ""
      });
      if (encoding) setPrinterEncoding(encoding);
      setCloudSettings({
        enabled: cloudSyncEnabled === 'true',
        serverUrl: cloudServerUrl || "http://localhost:4000",
        storeId: cloudStoreId || "",
        storeSecret: cloudStoreSecret || ""
      });
      setDailyWageEnabled(wageEnabled === null || wageEnabled === undefined ? true : wageEnabled === 'true');
      setDailyWageHourlyRate(wageRate || "1.875");
      setManualStockEditEnabled(manualStockEdit === null || manualStockEdit === undefined ? true : manualStockEdit === 'true');
      setAutoArchiveEnabled(autoArchiveEnabled === 'true');
      setAutoArchiveRetentionDays(autoArchiveDays || "15");
      return { name, address, phone, encoding };
    }
  });

  useQuery({
    queryKey: ["cloudSyncStatus"],
    queryFn: async () => {
      const status = await window.api.cloudSyncStatus();
      setCloudStatus(status);
      return status;
    },
    refetchInterval: 10000
  });

  // --- Handlers ---
  const handleSaveStoreSettings = async () => {
    await window.api.setAppSetting({ key: 'storeName', value: storeSettings.name });
    await window.api.setAppSetting({ key: 'storeAddress', value: storeSettings.address });
    await window.api.setAppSetting({ key: 'storePhone', value: storeSettings.phone });
    const parsedRate = Number(dailyWageHourlyRate);
    const safeRate = Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : 1.875;
    await window.api.setAppSetting({ key: 'dailyWageEnabled', value: String(dailyWageEnabled) });
    await window.api.setAppSetting({ key: 'dailyWageHourlyRate', value: String(safeRate) });
    setDailyWageHourlyRate(String(safeRate));
    window.dispatchEvent(new CustomEvent("daily-wage-settings", { detail: { enabled: dailyWageEnabled, hourlyRate: safeRate } }));
    await window.api.setAppSetting({ key: 'manualStockEditEnabled', value: String(manualStockEditEnabled) });
    const parsedArchiveDays = Number(autoArchiveRetentionDays);
    const safeArchiveDays = Number.isFinite(parsedArchiveDays)
      ? Math.max(2, parsedArchiveDays)
      : 15;
    await window.api.setAppSetting({ key: 'autoArchiveEnabled', value: String(autoArchiveEnabled) });
    await window.api.setAppSetting({ key: 'autoArchiveRetentionDays', value: String(safeArchiveDays) });
    setAutoArchiveRetentionDays(String(safeArchiveDays));
    window.dispatchEvent(new CustomEvent("manual-stock-edit-settings", { detail: { enabled: manualStockEditEnabled } }));
    toast({ title: "تم الحفظ", description: "تم تحديث معلومات المتجر بنجاح." });
    queryClient.invalidateQueries({ queryKey: ["appSettings"] });
  };

  const handleSavePrinterSettings = async () => {
    await window.api.setAppSetting({ key: 'printerEncoding', value: printerEncoding });
    toast({ title: "تم الحفظ", description: "تم تحديث إعدادات الطابعة." });
  };

  const handleSaveCloudSettings = async () => {
    await window.api.setAppSetting({ key: 'cloudServerUrl', value: cloudSettings.serverUrl });
    await window.api.setAppSetting({ key: 'cloudStoreId', value: cloudSettings.storeId });
    await window.api.setAppSetting({ key: 'cloudStoreSecret', value: cloudSettings.storeSecret });
    await window.api.setAppSetting({ key: 'cloudSyncEnabled', value: String(cloudSettings.enabled) });
    toast({ title: "تم الحفظ", description: "تم تحديث إعدادات المزامنة السحابية." });
    queryClient.invalidateQueries({ queryKey: ["cloudSyncStatus"] });
  };

  const handleRunArchiveNow = async () => {
    setIsArchivingNow(true);
    try {
      const res = await window.api.runArchiveNow();
      if (res?.ok) {
        toast({ title: "تمت الأرشفة", description: "تم تشغيل الأرشفة يدويًا بنجاح." });
      } else {
        toast({ title: "فشل الأرشفة", description: res?.error || "تعذر تشغيل الأرشفة.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل الأرشفة", description: e?.message || "تعذر تشغيل الأرشفة.", variant: "destructive" });
    } finally {
      setIsArchivingNow(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const res = await window.api.checkForUpdates();
      if (res?.reason === "dev") {
        toast({ title: "غير متاح في وضع التطوير", description: "ميزة التحديث تعمل في النسخ النهائية فقط." });
      } else if (res?.ok) {
        const versionLabel = res?.updateInfo?.version ? `آخر إصدار متاح: ${res.updateInfo.version}` : "تم التحقق من التحديثات.";
        toast({ title: "تم التحقق", description: versionLabel });
      } else {
        toast({ title: "فشل التحقق", description: res?.error || "تعذر التحقق من التحديثات.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل التحقق", description: e?.message || "تعذر التحقق من التحديثات.", variant: "destructive" });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const formatUpdateTime = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("ar-IQ");
    } catch {
      return value;
    }
  };

  const handleCloudSyncNow = async () => {
    setSyncDialogOpen(true);
    setSyncDialogStatus("loading");
    setSyncDialogMessage("جارٍ رفع جميع بيانات المركز...");
    try {
      const res = await window.api.cloudSyncNow();
      queryClient.invalidateQueries({ queryKey: ["cloudSyncStatus"] });
      setSyncDialogStatus("success");
      setSyncDialogMessage(`تم رفع ${res?.count || 0} سجل بنجاح.`);
      toast({ title: "تم الإرسال", description: "تم إرسال جميع بيانات المركز الحالية." });
    } catch (e: any) {
      setSyncDialogStatus("error");
      setSyncDialogMessage(e?.message || "فشل رفع البيانات.");
    }
  };

  const handleCloudSyncFull = async () => {
    setSyncDialogOpen(true);
    setSyncDialogStatus("loading");
    setSyncDialogMessage("جارٍ تجهيز ورفع جميع البيانات...");
    try {
      const res = await window.api.cloudSyncFull();
      queryClient.invalidateQueries({ queryKey: ["cloudSyncStatus"] });
      setSyncDialogStatus("success");
      setSyncDialogMessage(`تم تجهيز ورفع ${res?.count || 0} سجل.`);
      toast({ title: "تمت المزامنة الكاملة", description: `تم تجهيز ${res?.count || 0} سجل للإرسال.` });
    } catch (e: any) {
      setSyncDialogStatus("error");
      setSyncDialogMessage(e?.message || "فشل رفع البيانات.");
    }
  };

  const handleFactoryReset = async () => {
    if (confirm("تحذير هام جداً!\n\nهل أنت متأكد من حذف كافة بيانات التطبيق؟\nسيتم حذف جميع الفواتير، المنتجات، الديون، والعملاء.\n\nسيتم إعادة تشغيل التطبيق كأنه جديد.")) {
      if (confirm("تأكيد نهائي: هل أنت متأكد؟ لا يمكن التراجع عن هذه العملية.")) {
        await window.api.factoryReset();
      }
    }
  };

  const handleBackup = async (type: 'all' | 'products' | 'debts') => {
    try {
      let res;
      if (type === 'all') res = await window.api.backupAll({ actorRole: currentUser?.role });
      else if (type === 'products') res = await window.api.backupProducts({ actorRole: currentUser?.role });
      else if (type === 'debts') res = await window.api.backupDebts({ actorRole: currentUser?.role });

      if (res?.ok) toast({ title: "تم النسخ", description: `تم إنشاء النسخة الاحتياطية (${type}) بنجاح.` });
      else if (res?.error) toast({ title: "خطأ", description: res.error, variant: "destructive" });
    } catch (e) {
      toast({ title: "خطأ", description: "فشلت عملية النسخ الاحتياطي", variant: "destructive" });
    }
  };

  const handleRestore = async () => {
    try {
      const res = await window.api.backupRestore({ actorRole: currentUser?.role });
      if (res?.ok) toast({ title: "تم الاسترجاع", description: "تم استرجاع البيانات بنجاح." });
      else if (res?.message) toast({ title: "معلومة", description: res.message });
      else if (res?.error) toast({ title: "خطأ", description: res.error, variant: "destructive" });
    } catch (e) {
      toast({ title: "خطأ", description: "فشلت عملية الاسترجاع", variant: "destructive" });
    }
  };

  const tabs = [
    { id: "general", label: "عام", icon: Store },
    { id: "appearance", label: "المظهر", icon: Palette },
    { id: "printer", label: "الطابعة", icon: Printer },
    { id: "cloud", label: "المزامنة السحابية", icon: Server },
    { id: "system", label: "النظام والبيانات", icon: Database },
  ];
  const isSyncLoading = syncDialogStatus === "loading";

  const colors = [
    { id: "blue", name: "أزرق (الافتراضي)", bg: "bg-blue-600" },
    { id: "green", name: "زمردي", bg: "bg-emerald-600" },
    { id: "purple", name: "بنفسجي", bg: "bg-violet-600" },
    { id: "orange", name: "برتقالي", bg: "bg-orange-600" },
    { id: "red", name: "وردي", bg: "bg-rose-600" },
    { id: "slate", name: "رمادي", bg: "bg-slate-600" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 font-sans" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">الإعدادات</h1>
          <p className="text-slate-500 mt-1">إدارة تفضيلات التطبيق والنظام</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="flex flex-col gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "bg-white text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200"
                }`}
              >
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? "text-white" : "text-slate-400"}`} />
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Developer Credits */}
          <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100">
              <Info className="w-6 h-6 text-blue-500" />
            </div>
            <p className="text-xs text-slate-500 font-medium">نظام نقاط البيع</p>
            <p className="text-[10px] text-slate-400 mt-1">الإصدار 1.0.0</p>
            <div className="my-3 h-px bg-slate-200 w-1/2 mx-auto"></div>
            <p className="text-[10px] text-slate-400">Developed by</p>
            <p className="text-xs font-bold text-slate-700 font-mono mt-0.5">Kazem Bashar Kazem</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1">
          {/* General Settings */}
          {activeTab === "general" && (
            <Card className="border-0 shadow-lg ring-1 ring-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-blue-600" />
                  إعدادات عامة والمبيعات
                </CardTitle>
                <CardDescription>معلومات المتجر وخيارات نقطة البيع.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>اسم المتجر / المركز</Label>
                  <Input 
                    value={storeSettings.name} 
                    onChange={(e) => setStoreSettings({...storeSettings, name: e.target.value})} 
                    placeholder="مثال: مركز الجمجمة"
                  />
                </div>
                <div className="space-y-2">
                  <Label>العنوان</Label>
                  <Input 
                    value={storeSettings.address} 
                    onChange={(e) => setStoreSettings({...storeSettings, address: e.target.value})} 
                    placeholder="مثال: بغداد - شارع فلسطين"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهاتف</Label>
                  <Input 
                    value={storeSettings.phone} 
                    onChange={(e) => setStoreSettings({...storeSettings, phone: e.target.value})} 
                    placeholder="مثال: 07700000000"
                  />
                </div>

                <div className="h-px bg-slate-100 my-4" />

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-blue-500" />
                      تعديل السعر في السلة
                    </div>
                    <p className="text-xs text-slate-500">السماح للكاشير بتغيير سعر المنتج يدوياً أثناء البيع.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{allowPriceEdit ? "مفعل" : "معطل"}</span>
                    <Checkbox 
                      checked={allowPriceEdit} 
                      onCheckedChange={(c) => onAllowPriceEditChange(Boolean(c))}
                    />
                  </div>
                </div>

                

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      تعديل المخزون اليدوي
                    </div>
                    <p className="text-xs text-slate-500">السماح بتعديل كمية المخزون يدويًا من شاشة المنتجات.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{manualStockEditEnabled ? "مفعل" : "معطل"}</span>
                    <Checkbox
                      checked={manualStockEditEnabled}
                      onCheckedChange={(c) => setManualStockEditEnabled(Boolean(c))}
                    />
                  </div>
                </div>

                
                
                
                
                
                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      الأرشفة التلقائية للتقارير والفواتير
                    </div>
                    <p className="text-xs text-slate-500">حفظ نسخة وحذف القديم مع الاحتفاظ بآخر يومين.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{autoArchiveEnabled ? "مفعل" : "معطل"}</span>
                    <Checkbox
                      checked={autoArchiveEnabled}
                      onCheckedChange={(c) => setAutoArchiveEnabled(Boolean(c))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>مدة الاحتفاظ (بالأيام)</Label>
                  <Input
                    type="number"
                    min="2"
                    value={autoArchiveRetentionDays}
                    onChange={(e) => setAutoArchiveRetentionDays(e.target.value)}
                    disabled={!autoArchiveEnabled}
                    placeholder="مثال: 15"
                  />
                  <p className="text-xs text-slate-500">سيتم حذف الأقدم مع حفظ نسخة أرشيفية تلقائية.</p>

                  <Button variant="outline" className="gap-2 w-fit" onClick={handleRunArchiveNow} disabled={isArchivingNow}>
                    {isArchivingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                    تشغيل الأرشفة الآن
                  </Button>
                </div>

<div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      نظام إدخال المشتريات
                    </div>
                    <p className="text-xs text-slate-500">اختر طريقة إدخال الكميات في فواتير الشراء.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={purchaseMode} onValueChange={onPurchaseModeChange}>
                      <SelectTrigger className="w-[150px] h-9 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="units">بالقطعة (Units)</SelectItem>
                        <SelectItem value="boxes">بالكرتون (Boxes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-4" />

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      إظهار يومية الموظف في الشريط
                    </div>
                    <p className="text-xs text-slate-500">عرض ساعات العمل واليومية بجانب اسم الكاشير.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{dailyWageEnabled ? "مفعل" : "معطل"}</span>
                    <Checkbox
                      checked={dailyWageEnabled}
                      onCheckedChange={(c) => setDailyWageEnabled(Boolean(c))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>سعر الساعة (يومية الكاشير)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={dailyWageHourlyRate}
                    onChange={(e) => setDailyWageHourlyRate(e.target.value)}
                    placeholder="مثال: 1.875"
                  />
                  <p className="text-xs text-slate-500">يمكنك تغيير قيمة الساعة حسب الاتفاق.</p>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-end p-4">
                <Button onClick={handleSaveStoreSettings} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  <Save className="w-4 h-4" /> حفظ التغييرات
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Appearance Settings */}
          {activeTab === "appearance" && (
            <Card className="border-0 shadow-lg ring-1 ring-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-purple-600" />
                  المظهر والسمات
                </CardTitle>
                <CardDescription>تخصيص شكل التطبيق وتجربة المستخدم.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Theme Color */}
                <div className="space-y-3">
                  <Label>لون التطبيق الرئيسي</Label>
                  <div className="flex flex-wrap gap-3">
                    {colors.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onThemeChange(c.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                          themeColor === c.id 
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" 
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${c.bg}`} />
                        <span className="text-sm text-slate-700">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Font Size */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-slate-500" />
                    حجم الخط
                  </Label>
                  <div className="flex gap-2">
                    {[
                      { id: "small", label: "صغير" },
                      { id: "medium", label: "متوسط (الافتراضي)" },
                      { id: "large", label: "كبير" }
                    ].map((size) => (
                      <Button
                        key={size.id}
                        variant={fontSize === size.id ? "default" : "outline"}
                        onClick={() => onFontSizeChange(size.id)}
                        className="flex-1"
                      >
                        {size.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-blue-500" />
                      المؤثرات الصوتية
                    </div>
                    <p className="text-xs text-slate-500">تشغيل أصوات عند مسح الباركود وإتمام العمليات.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{soundEnabled ? "مفعل" : "معطل"}</span>
                    <Checkbox 
                      checked={soundEnabled} 
                      onCheckedChange={(c) => onSoundEnabledChange(Boolean(c))}
                    />
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Moon className="w-4 h-4 text-indigo-500" />
                      الوضع الرمضاني
                    </div>
                    <p className="text-xs text-slate-500">تفعيل ثيم خاص بشهر رمضان المبارك (ألوان خضراء وزخارف).</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{isRamadanMode ? "مفعل" : "معطل"}</span>
                    <Checkbox 
                      checked={isRamadanMode} 
                      onCheckedChange={onToggleRamadan}
                      className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Layout className="w-4 h-4 text-blue-500" />
                      الوضع المضغوط (Compact Mode)
                    </div>
                    <p className="text-xs text-slate-500">تقليل المسافات والهوامش لعرض المزيد من البيانات في الشاشة.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{compactMode ? "مفعل" : "معطل"}</span>
                    <Checkbox 
                      checked={compactMode} 
                      onCheckedChange={(c) => onCompactModeChange(Boolean(c))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4 text-orange-500" />
                      تقليل الحركة (Performance)
                    </div>
                    <p className="text-xs text-slate-500">إيقاف التأثيرات البصرية لتسريع التطبيق على الأجهزة القديمة.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{reduceAnimations ? "مفعل" : "معطل"}</span>
                    <Checkbox 
                      checked={reduceAnimations} 
                      onCheckedChange={(c) => onAnimationsChange(Boolean(c))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Printer Settings */}
          {activeTab === "printer" && (
            <Card className="border-0 shadow-lg ring-1 ring-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-orange-600" />
                  إعدادات الطابعة
                </CardTitle>
                <CardDescription>ضبط ترميز النصوص للطابعات الحرارية.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>ترميز الطابعة (Encoding)</Label>
                  <Select value={printerEncoding} onValueChange={setPrinterEncoding}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="اختر الترميز" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="windows-1256">Windows-1256 (العربية القياسية)</SelectItem>
                      <SelectItem value="cp864">CP864 (IBM Arabic)</SelectItem>
                      <SelectItem value="cp720">CP720 (DOS Arabic)</SelectItem>
                      <SelectItem value="utf8">UTF-8 (Unicode)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    * جرب تغيير هذا الإعداد إذا كانت النصوص العربية تظهر كرموز غير مفهومة في الوصل.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-end p-4">
                <Button onClick={handleSavePrinterSettings} className="bg-orange-600 hover:bg-orange-700 gap-2">
                  <Save className="w-4 h-4" /> حفظ الإعدادات
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Cloud Sync Settings */}
          {activeTab === "cloud" && (
            <Card className="border-0 shadow-lg ring-1 ring-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-emerald-600" />
                  إعدادات المزامنة السحابية
                </CardTitle>
                <CardDescription>ربط هذا المركز بالخادم المركزي لمتابعة البيانات لحظيًا.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>عنوان الخادم (Server URL)</Label>
                  <Input
                    value={cloudSettings.serverUrl}
                    onChange={(e) => setCloudSettings({ ...cloudSettings, serverUrl: e.target.value })}
                    placeholder="http://localhost:4000"
                  />
                  <p className="text-xs text-slate-500">مثال محلي: http://localhost:4000</p>
                </div>

                <div className="space-y-2">
                  <Label>Store ID</Label>
                  <Input
                    value={cloudSettings.storeId}
                    onChange={(e) => setCloudSettings({ ...cloudSettings, storeId: e.target.value })}
                    placeholder="يتم نسخه من لوحة الإدارة"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Store Secret</Label>
                  <Input
                    type="password"
                    value={cloudSettings.storeSecret}
                    onChange={(e) => setCloudSettings({ ...cloudSettings, storeSecret: e.target.value })}
                    placeholder="يتم نسخه من لوحة الإدارة"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-500" />
                      تفعيل المزامنة السحابية
                    </div>
                    <p className="text-xs text-slate-500">عند التفعيل سيتم إرسال البيانات تلقائيًا للخادم.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{cloudSettings.enabled ? "مفعل" : "معطل"}</span>
                    <Checkbox
                      checked={cloudSettings.enabled}
                      onCheckedChange={(c) => setCloudSettings({ ...cloudSettings, enabled: Boolean(c) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border bg-white">
                    <div className="text-xs text-slate-500">قائمة الانتظار</div>
                    <div className="text-lg font-bold text-slate-700">{cloudStatus?.queueLength ?? 0}</div>
                  </div>
                  <div className="p-3 rounded-xl border bg-white">
                    <div className="text-xs text-slate-500">آخر مزامنة ناجحة</div>
                    <div className="text-sm font-medium text-slate-700">
                      {cloudStatus?.lastSuccessAt ? new Date(cloudStatus.lastSuccessAt).toLocaleString('ar-IQ') : "—"}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-white">
                    <div className="text-xs text-slate-500">آخر خطأ</div>
                    <div className="text-xs font-medium text-rose-600 break-words">
                      {cloudStatus?.lastError || "—"}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-between p-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCloudSyncNow}>
                    مزامنة الآن
                  </Button>
                  <Button variant="outline" onClick={handleCloudSyncFull}>
                    مزامنة كاملة
                  </Button>
                </div>
                <Button onClick={handleSaveCloudSettings} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  <Save className="w-4 h-4" /> حفظ الإعدادات
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* System Settings */}
          {activeTab === "system" && (
            <div className="space-y-6">
              <Card className="border-0 shadow-lg ring-1 ring-slate-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-600" />
                    تحديثات التطبيق
                  </CardTitle>
                  <CardDescription>تحقق يدوي من آخر إصدار وإظهار حالة التحديث.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl border bg-white">
                      <div className="text-xs text-slate-500">الإصدار الحالي</div>
                      <div className="font-bold text-slate-700">{updateStatus?.currentVersion || "—"}</div>
                    </div>
                    <div className="p-3 rounded-xl border bg-white">
                      <div className="text-xs text-slate-500">آخر إصدار</div>
                      <div className="font-bold text-slate-700">{updateStatus?.version || "—"}</div>
                    </div>
                    <div className="p-3 rounded-xl border bg-white">
                      <div className="text-xs text-slate-500">آخر تحقق</div>
                      <div className="font-bold text-slate-700">{formatUpdateTime(updateStatus?.lastCheckedAt)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      الحالة:{" "}
                      <span className="font-medium text-slate-700">
                        {updateStatus?.status === "checking"
                          ? "جارٍ التحقق"
                          : updateStatus?.status === "available"
                          ? "تحديث متاح"
                          : updateStatus?.status === "not-available"
                          ? "أنت على آخر إصدار"
                          : updateStatus?.status === "error"
                          ? "خطأ في التحقق"
                          : updateStatus?.status === "dev"
                          ? "وضع التطوير"
                          : "غير معروف"}
                      </span>
                    </div>
                    {updateStatus?.available && (
                      <span className="text-xs bg-amber-500 text-white px-2 py-1 rounded-full">
                        تحديث متاح
                      </span>
                    )}
                  </div>
                  {updateStatus?.error && (
                    <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">
                      {updateStatus.error}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex items-center justify-between p-4">
                  <Button onClick={handleCheckForUpdates} className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={isCheckingUpdates}>
                    {isCheckingUpdates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    تحقق من التحديثات
                  </Button>
                </CardFooter>
              </Card>

              <Card className="border-0 shadow-lg ring-1 ring-slate-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    النسخ الاحتياطي والاسترجاع
                  </CardTitle>
                  <CardDescription>حماية البيانات وتصديرها.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-blue-50 hover:border-blue-200" onClick={() => handleBackup('all')}>
                    <Server className="w-6 h-6 text-blue-600" />
                    <div className="text-center">
                      <div className="font-bold text-slate-700">نسخة كاملة</div>
                      <div className="text-[10px] text-slate-400">قاعدة البيانات بالكامل (.db)</div>
                    </div>
                  </Button>

                  <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-emerald-50 hover:border-emerald-200" onClick={() => handleBackup('products')}>
                    <Download className="w-6 h-6 text-emerald-600" />
                    <div className="text-center">
                      <div className="font-bold text-slate-700">تصدير المنتجات</div>
                      <div className="text-[10px] text-slate-400">ملف JSON للمنتجات فقط</div>
                    </div>
                  </Button>

                  <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-orange-50 hover:border-orange-200" onClick={() => handleBackup('debts')}>
                    <Download className="w-6 h-6 text-orange-600" />
                    <div className="text-center">
                      <div className="font-bold text-slate-700">تصدير الديون</div>
                      <div className="text-[10px] text-slate-400">ملف JSON للديون والعملاء</div>
                    </div>
                  </Button>

                  <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-purple-50 hover:border-purple-200" onClick={handleRestore}>
                    <Upload className="w-6 h-6 text-purple-600" />
                    <div className="text-center">
                      <div className="font-bold text-slate-700">استرجاع نسخة</div>
                      <div className="text-[10px] text-slate-400">استيراد ملف (.db أو .json)</div>
                    </div>
                  </Button>
                </CardContent>
              </Card>

              {(currentUser?.role === 'admin' || currentUser?.username === 'admin') && (
                <Card className="border-0 shadow-lg ring-1 ring-red-100 bg-red-50/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-700">
                      <ShieldAlert className="w-5 h-5" />
                      منطقة الخطر
                    </CardTitle>
                    <CardDescription>إجراءات حساسة لا يمكن التراجع عنها.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 bg-white border border-red-100 rounded-xl">
                      <div>
                        <div className="font-bold text-red-700">إعادة ضبط المصنع</div>
                        <p className="text-xs text-slate-500 mt-1">حذف جميع البيانات (المنتجات، الفواتير، العملاء) وإعادة التطبيق لحالته الأصلية.</p>
                      </div>
                      <Button variant="destructive" onClick={handleFactoryReset}>
                        حذف كل شيء
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Dialog
            open={syncDialogOpen}
            onOpenChange={(open) => {
              if (!isSyncLoading) setSyncDialogOpen(open);
            }}
          >
            <DialogContent className={`max-w-md ${isSyncLoading ? "[&>button]:hidden" : ""}`} dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {syncDialogStatus === "loading" && <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />}
                  {syncDialogStatus === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  {syncDialogStatus === "error" && <XCircle className="w-5 h-5 text-red-600" />}
                  حالة المزامنة
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  {syncDialogMessage || "جارٍ تنفيذ المزامنة..."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-2">
                <Button
                  variant="outline"
                  onClick={() => setSyncDialogOpen(false)}
                  disabled={isSyncLoading}
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
