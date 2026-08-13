import React, { useEffect, useState } from "react";
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
  Bot,
  Send,
  Download,
  Upload,
  Layout,
  Zap,
  Type,
  Volume2,
  DollarSign,
  Package,
  Sparkles,
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
  posTheme: string;
  onPosThemeChange: (theme: string) => void;
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
  posTheme,
  onPosThemeChange,
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
  const [autoPricingEnabled, setAutoPricingEnabled] = useState(false);
  const [autoPricingMode, setAutoPricingMode] = useState("preserve");
  const [autoPricingUnitMarkupPercent, setAutoPricingUnitMarkupPercent] = useState("25");
  const [autoPricingBoxMarkupPercent, setAutoPricingBoxMarkupPercent] = useState("25");
  const [autoPricingRoundTo, setAutoPricingRoundTo] = useState("250");
  const [autoPricingRoundMode, setAutoPricingRoundMode] = useState("nearest");
  const [autoPricingPreventLoss, setAutoPricingPreventLoss] = useState(true);
  const [autoPricingApplyOnProductEdit, setAutoPricingApplyOnProductEdit] = useState(true);
  const [autoPricingMinCostChangePercent, setAutoPricingMinCostChangePercent] = useState("0");
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(false);
  const [autoArchiveRetentionDays, setAutoArchiveRetentionDays] = useState("15");
  const [isArchivingNow, setIsArchivingNow] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isFixingNegativeStock, setIsFixingNegativeStock] = useState(false);
  const [isZeroingAllStock, setIsZeroingAllStock] = useState(false);
  const [isChoosingReceiptBarcodeImage, setIsChoosingReceiptBarcodeImage] = useState(false);
  const [isRunningAutoPricing, setIsRunningAutoPricing] = useState(false);
  const [isCapturingAutoPricingProfiles, setIsCapturingAutoPricingProfiles] = useState(false);
  
  // --- Printer Settings State ---
  const [printerEncoding, setPrinterEncoding] = useState("windows-1256");
  const [receiptBarcodeEnabled, setReceiptBarcodeEnabled] = useState(true);
  const [receiptBarcodeImage, setReceiptBarcodeImage] = useState("qr.png");
  const [receiptTemplate, setReceiptTemplate] = useState("classic");
  // --- Cloud Sync Settings State ---
  const [cloudSettings, setCloudSettings] = useState({
    enabled: false,
    serverUrl: "http://localhost:4000",
    storeId: "",
    storeSecret: ""
  });
  const [aiSettings, setAiSettings] = useState({
    apiKey: "",
    model: "meta-llama/llama-3.2-3b-instruct:free"
  });
  const [cloudStatus, setCloudStatus] = useState<any>(null);
  const [telegramSettings, setTelegramSettings] = useState<any>({
    enabled: false,
    label: "نسخة الكاشير",
    botToken: "",
    cashierChatId: "",
    ownerChatId: "",
    cashierUserId: ""
  });
  const [testingTelegramTarget, setTestingTelegramTarget] = useState<"cashier" | "owner" | null>(null);
  const testingTelegramUserId = null;
  const updateTelegramUser = (_userId: number, _patch: any) => {};
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
      const receiptBarcodeEnabled = await window.api.getAppSetting('receiptBarcodeEnabled');
      const receiptBarcodeImage = await window.api.getAppSetting('receiptBarcodeImage');
      const receiptTemplateValue = await window.api.getAppSetting('receiptTemplate');
      const cloudServerUrl = await window.api.getAppSetting('cloudServerUrl');
      const cloudStoreId = await window.api.getAppSetting('cloudStoreId');
      const cloudStoreSecret = await window.api.getAppSetting('cloudStoreSecret');
      const cloudSyncEnabled = await window.api.getAppSetting('cloudSyncEnabled');
      const wageEnabled = await window.api.getAppSetting('dailyWageEnabled');
      const wageRate = await window.api.getAppSetting('dailyWageHourlyRate');
      const manualStockEdit = await window.api.getAppSetting('manualStockEditEnabled');
      const pricingEnabled = await window.api.getAppSetting('autoPricingEnabled');
      const pricingMode = await window.api.getAppSetting('autoPricingMode');
      const pricingUnitPercent = await window.api.getAppSetting('autoPricingUnitMarkupPercent');
      const pricingBoxPercent = await window.api.getAppSetting('autoPricingBoxMarkupPercent');
      const pricingRoundTo = await window.api.getAppSetting('autoPricingRoundTo');
      const pricingRoundMode = await window.api.getAppSetting('autoPricingRoundMode');
      const pricingPreventLoss = await window.api.getAppSetting('autoPricingPreventLoss');
      const pricingApplyOnProductEdit = await window.api.getAppSetting('autoPricingApplyOnProductEdit');
      const pricingMinCostChangePercent = await window.api.getAppSetting('autoPricingMinCostChangePercent');
      const autoArchiveEnabled = await window.api.getAppSetting('autoArchiveEnabled');
      const autoArchiveDays = await window.api.getAppSetting('autoArchiveRetentionDays');
      const aiApiKey = await window.api.getAppSetting('openRouterApiKey');
      const aiModel = await window.api.getAppSetting('openRouterModel');
      
      setStoreSettings({ 
        name: name || "CRO P", 
        address: address || "", 
        phone: phone || ""
      });
      if (encoding) setPrinterEncoding(encoding);
      setReceiptBarcodeEnabled(receiptBarcodeEnabled === null || receiptBarcodeEnabled === undefined ? true : receiptBarcodeEnabled !== 'false');
      setReceiptBarcodeImage(receiptBarcodeImage || "qr.png");
      setReceiptTemplate(["classic", "compact", "boxed"].includes(receiptTemplateValue) ? receiptTemplateValue : "classic");
      setCloudSettings({
        enabled: cloudSyncEnabled === 'true',
        serverUrl: cloudServerUrl || "http://localhost:4000",
        storeId: cloudStoreId || "",
        storeSecret: cloudStoreSecret || ""
      });
      setDailyWageEnabled(wageEnabled === null || wageEnabled === undefined ? true : wageEnabled === 'true');
      setDailyWageHourlyRate(wageRate || "1.875");
      setManualStockEditEnabled(manualStockEdit === null || manualStockEdit === undefined ? true : manualStockEdit === 'true');
      setAutoPricingEnabled(pricingEnabled === 'true');
      setAutoPricingMode(pricingMode === 'fixed' ? 'fixed' : 'preserve');
      setAutoPricingUnitMarkupPercent(pricingUnitPercent || "25");
      setAutoPricingBoxMarkupPercent(pricingBoxPercent || "25");
      setAutoPricingRoundTo(pricingRoundTo || "250");
      setAutoPricingRoundMode(pricingRoundMode === 'up' ? 'up' : 'nearest');
      setAutoPricingPreventLoss(pricingPreventLoss === null || pricingPreventLoss === undefined ? true : pricingPreventLoss === 'true');
      setAutoPricingApplyOnProductEdit(pricingApplyOnProductEdit === null || pricingApplyOnProductEdit === undefined ? true : pricingApplyOnProductEdit === 'true');
      setAutoPricingMinCostChangePercent(pricingMinCostChangePercent || "0");
      setAutoArchiveEnabled(autoArchiveEnabled === 'true');
      setAutoArchiveRetentionDays(autoArchiveDays || "15");
      setAiSettings({
        apiKey: aiApiKey || "",
        model: aiModel || "meta-llama/llama-3.2-3b-instruct:free"
      });
      return { name, address, phone, encoding, receiptBarcodeEnabled, receiptBarcodeImage };
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

  const { data: telegramUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => window.api.listUsers()
  });

  useQuery({
    queryKey: ["telegramBotSettings"],
    queryFn: async () => {
      const settings = await window.api.getTelegramBotSettings();
      const merged = {
        enabled: Boolean(settings?.enabled),
        label: settings?.label || "نسخة الكاشير",
        botToken: "",
        cashierChatId: settings?.cashierChatId || "",
        ownerChatId: settings?.ownerChatId || "",
        cashierUserId: settings?.cashierUserId ? String(settings.cashierUserId) : "",
        botTokenMasked: settings?.botTokenMasked || "",
        running: settings?.running,
        activeBots: settings?.activeBots,
        lastError: settings?.lastError,
        lastMessageAt: settings?.lastMessageAt
      };
      setTelegramSettings(merged);
      return merged;
    },
    refetchInterval: activeTab === "telegram" ? 10000 : false
  });

  const {
    data: managedBackupsData,
    isFetching: isManagedBackupsLoading,
    refetch: refetchManagedBackups
  } = useQuery({
    queryKey: ["managedBackups"],
    queryFn: async () => {
      const res = await window.api.backupList();
      if (res?.ok) return res;
      return { ok: false, files: [], dir: "" };
    }
  });
  const managedBackups = Array.isArray(managedBackupsData?.files) ? managedBackupsData.files : [];
  const managedBackupsDir = managedBackupsData?.dir || "";
  const [creatingBackupType, setCreatingBackupType] = useState<"all" | "products" | "debts" | null>(null);
  const [restoringManagedFile, setRestoringManagedFile] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "system") {
      refetchManagedBackups();
    }
  }, [activeTab, refetchManagedBackups]);

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
    const parsedUnitMarkup = Number(autoPricingUnitMarkupPercent);
    const parsedBoxMarkup = Number(autoPricingBoxMarkupPercent);
    const parsedRoundTo = Number(autoPricingRoundTo);
    const parsedMinCostChangePercent = Number(autoPricingMinCostChangePercent);
    const safeUnitMarkup = Number.isFinite(parsedUnitMarkup) ? parsedUnitMarkup : 25;
    const safeBoxMarkup = Number.isFinite(parsedBoxMarkup) ? parsedBoxMarkup : 25;
    const safeRoundTo = Number.isFinite(parsedRoundTo) ? Math.max(1, parsedRoundTo) : 250;
    const safeMinCostChangePercent = Number.isFinite(parsedMinCostChangePercent) ? Math.max(0, parsedMinCostChangePercent) : 0;
    await window.api.setAppSetting({ key: 'autoPricingEnabled', value: String(autoPricingEnabled) });
    await window.api.setAppSetting({ key: 'autoPricingMode', value: autoPricingMode === 'fixed' ? 'fixed' : 'preserve' });
    await window.api.setAppSetting({ key: 'autoPricingUnitMarkupPercent', value: String(safeUnitMarkup) });
    await window.api.setAppSetting({ key: 'autoPricingBoxMarkupPercent', value: String(safeBoxMarkup) });
    await window.api.setAppSetting({ key: 'autoPricingRoundTo', value: String(safeRoundTo) });
    await window.api.setAppSetting({ key: 'autoPricingRoundMode', value: autoPricingRoundMode === 'up' ? 'up' : 'nearest' });
    await window.api.setAppSetting({ key: 'autoPricingPreventLoss', value: String(autoPricingPreventLoss) });
    await window.api.setAppSetting({ key: 'autoPricingApplyOnProductEdit', value: String(autoPricingApplyOnProductEdit) });
    await window.api.setAppSetting({ key: 'autoPricingMinCostChangePercent', value: String(safeMinCostChangePercent) });
    setAutoPricingUnitMarkupPercent(String(safeUnitMarkup));
    setAutoPricingBoxMarkupPercent(String(safeBoxMarkup));
    setAutoPricingRoundTo(String(safeRoundTo));
    setAutoPricingMinCostChangePercent(String(safeMinCostChangePercent));
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

  const handleRunAutoPricingNow = async () => {
    setIsRunningAutoPricing(true);
    try {
      const res = await window.api.runAutoPricing();
      if (res?.ok) {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        toast({
          title: "تم تحديث الأسعار",
          description: `تمت إعادة تسعير ${res.updated || 0} منتج اعتماداً على إعدادات التسعير الذكي.`
        });
      } else {
        toast({
          title: "تعذر تحديث الأسعار",
          description: res?.error || "فشل تشغيل التسعير الذكي.",
          variant: "destructive"
        });
      }
    } catch (e: any) {
      toast({
        title: "تعذر تحديث الأسعار",
        description: e?.message || "فشل تشغيل التسعير الذكي.",
        variant: "destructive"
      });
    } finally {
      setIsRunningAutoPricing(false);
    }
  };

  const handleCaptureAutoPricingProfiles = async () => {
    setIsCapturingAutoPricingProfiles(true);
    try {
      const res = await window.api.captureAutoPricingProfiles();
      if (res?.ok) {
        toast({
          title: "تم حفظ النسب",
          description: `تم حفظ نسب التسعير الحالية لـ ${res.captured || 0} منتج.`
        });
      } else {
        toast({
          title: "تعذر حفظ النسب",
          description: res?.error || "فشل حفظ نسب التسعير الحالية.",
          variant: "destructive"
        });
      }
    } catch (e: any) {
      toast({
        title: "تعذر حفظ النسب",
        description: e?.message || "فشل حفظ نسب التسعير الحالية.",
        variant: "destructive"
      });
    } finally {
      setIsCapturingAutoPricingProfiles(false);
    }
  };

  const handleSavePrinterSettings = async () => {
    await window.api.setAppSetting({ key: 'printerEncoding', value: printerEncoding });
    await window.api.setAppSetting({ key: 'receiptBarcodeEnabled', value: String(receiptBarcodeEnabled) });
    await window.api.setAppSetting({ key: 'receiptBarcodeImage', value: receiptBarcodeImage || "qr.png" });
    await window.api.setAppSetting({ key: 'receiptTemplate', value: receiptTemplate });
    toast({ title: "تم الحفظ", description: "تم تحديث إعدادات الطابعة." });
  };

  const handleChooseReceiptBarcodeImage = async () => {
    setIsChoosingReceiptBarcodeImage(true);
    try {
      const res = await window.api.chooseReceiptBarcodeImage();
      if (res?.ok) {
        setReceiptBarcodeImage(res.fileName || "qr.png");
        setReceiptBarcodeEnabled(true);
        toast({ title: "تم اختيار الصورة", description: "تم حفظ صورة الباركود لاستخدامها في الوصل." });
      } else if (res?.error !== 'User cancelled') {
        toast({ title: "فشل اختيار الصورة", description: res?.error || "تعذر اختيار صورة الباركود.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل اختيار الصورة", description: e?.message || "تعذر اختيار صورة الباركود.", variant: "destructive" });
    } finally {
      setIsChoosingReceiptBarcodeImage(false);
    }
  };

  const handleSaveCloudSettings = async () => {
    await window.api.setAppSetting({ key: 'cloudServerUrl', value: cloudSettings.serverUrl });
    await window.api.setAppSetting({ key: 'cloudStoreId', value: cloudSettings.storeId });
    await window.api.setAppSetting({ key: 'cloudStoreSecret', value: cloudSettings.storeSecret });
    await window.api.setAppSetting({ key: 'cloudSyncEnabled', value: String(cloudSettings.enabled) });
    toast({ title: "تم الحفظ", description: "تم تحديث إعدادات المزامنة السحابية." });
    queryClient.invalidateQueries({ queryKey: ["cloudSyncStatus"] });
  };

  const handleSaveTelegramSettings = async () => {
    const payload = {
      enabled: Boolean(telegramSettings.enabled),
      label: String(telegramSettings.label || "").trim() || "نسخة الكاشير",
      botToken: String(telegramSettings.botToken || "").trim(),
      cashierChatId: String(telegramSettings.cashierChatId || "").trim(),
      ownerChatId: String(telegramSettings.ownerChatId || "").trim(),
      cashierUserId: telegramSettings.cashierUserId ? Number(telegramSettings.cashierUserId) : null
    };
    const res = await window.api.setTelegramBotSettings(payload);
    toast({
      title: res?.ok ? "تم حفظ إعدادات تيليگرام" : "تعذر حفظ إعدادات تيليگرام",
      description: res?.ok ? `البوتات النشطة: ${res.activeBots || 0}` : (res?.error || "حدث خطأ أثناء الحفظ."),
      variant: res?.ok ? undefined : "destructive"
    });
    queryClient.invalidateQueries({ queryKey: ["telegramBotSettings"] });
  };

  const handleTestTelegramBot = async (target: "cashier" | "owner") => {
    setTestingTelegramTarget(target);
    try {
      const res = await window.api.testTelegramBot({
        ...telegramSettings,
        target,
        botToken: String(telegramSettings.botToken || "").trim()
      });
      toast({
        title: res?.ok ? "تم إرسال رسالة الاختبار" : "فشل اختبار بوت تيليگرام",
        description: res?.ok ? "وصلت رسالة تجربة إلى المحادثة المحددة." : (res?.error || "تحقق من التوكن وChat ID."),
        variant: res?.ok ? undefined : "destructive"
      });
    } finally {
      setTestingTelegramTarget(null);
    }
  };

  const handleSaveAiSettings = async () => {
    const apiKey = aiSettings.apiKey.trim();
    const model = aiSettings.model.trim() || "meta-llama/llama-3.2-3b-instruct:free";
    await window.api.setAppSetting({ key: 'openRouterApiKey', value: apiKey });
    await window.api.setAppSetting({ key: 'openRouterModel', value: model });
    setAiSettings({ apiKey, model });
    toast({ title: "تم الحفظ", description: "تم تحديث إعدادات الذكاء الاصطناعي." });
    queryClient.invalidateQueries({ queryKey: ["appSettings"] });
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

  const handleDownloadUpdate = async () => {
    try {
      const res = await window.api.downloadUpdate();
      if (res?.reason === "dev") {
        toast({ title: "غير متاح في وضع التطوير", description: "ميزة التحديث تعمل في النسخ النهائية فقط." });
      } else if (res?.ok) {
        toast({ title: "بدأ التنزيل", description: "جارٍ تنزيل التحديث..." });
      } else {
        toast({ title: "فشل التنزيل", description: res?.error || "تعذر تنزيل التحديث.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل التنزيل", description: e?.message || "تعذر تنزيل التحديث.", variant: "destructive" });
    }
  };

  const handleInstallUpdate = async () => {
    try {
      const res = await window.api.installUpdate();
      if (res?.reason === "dev") {
        toast({ title: "غير متاح في وضع التطوير", description: "ميزة التحديث تعمل في النسخ النهائية فقط." });
      }
    } catch (e: any) {
      toast({ title: "فشل التثبيت", description: e?.message || "تعذر تثبيت التحديث.", variant: "destructive" });
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

  const formatBackupSize = (size: number) => {
    if (!Number.isFinite(size) || size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const backupTypeLabel = (type: string) => {
    if (type === "all") return "Full System Backup";
    if (type === "products") return "Products";
    if (type === "debts") return "Debts";
    return "Unknown";
  };

  const handleBackup = async (type: "all" | "products" | "debts") => {
    try {
      setCreatingBackupType(type);
      const res = await window.api.backupCreate({ type, actorRole: currentUser?.role });
      if (res?.ok) {
        toast({ title: "Backup Created", description: `Created ${backupTypeLabel(type)} successfully.` });
        refetchManagedBackups();
      } else if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Backup process failed.", variant: "destructive" });
    } finally {
      setCreatingBackupType(null);
    }
  };

  const handleRestoreManaged = async (file: string) => {
    if (!confirm("This will replace current data with the selected backup. Continue?")) return;
    try {
      setRestoringManagedFile(file);
      const res = await window.api.backupRestoreManaged({ file, actorRole: currentUser?.role });
      if (res?.ok) {
        toast({ title: "Restore Completed", description: "Selected backup restored successfully." });
        refetchManagedBackups();
      } else if (res?.message) {
        toast({ title: "Info", description: res.message });
      } else if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Restore failed.", variant: "destructive" });
    } finally {
      setRestoringManagedFile(null);
    }
  };

  const handleRestore = async () => {
    try {
      const res = await window.api.backupRestore({ actorRole: currentUser?.role });
      if (res?.ok) toast({ title: "Restore Completed", description: "Data restored successfully." });
      else if (res?.message) toast({ title: "Info", description: res.message });
      else if (res?.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    } catch (e) {
      toast({ title: "Error", description: "Restore process failed.", variant: "destructive" });
    }
  };

  const handleZeroNegativeStock = async () => {
    if (!confirm("سيتم تصفير جميع المنتجات ذات المخزون السالب إلى صفر. هل تريد المتابعة؟")) return;
    setIsFixingNegativeStock(true);
    try {
      const res = await window.api.zeroNegativeStock();
      if (res?.ok) {
        const count = Number(res?.updated || 0);
        toast({
          title: "تم التصحيح",
          description: count ? `تم تصفير ${count} منتجًا.` : "لا توجد قيم سالبة في المخزون."
        });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } else {
        toast({ title: "فشل العملية", description: res?.error || "تعذر تصفير المخزون السالب.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل العملية", description: e?.message || "تعذر تصفير المخزون السالب.", variant: "destructive" });
    } finally {
      setIsFixingNegativeStock(false);
    }
  };

  const handleZeroAllStock = async () => {
    if (!confirm("سيتم تصفير مخزون جميع المنتجات إلى صفر، وليس السالب فقط. هل تريد المتابعة؟")) return;
    if (!confirm("تأكيد نهائي: هذا الإجراء سيجعل مخزون كل المنتجات 0. هل أنت متأكد؟")) return;
    setIsZeroingAllStock(true);
    try {
      const res = await window.api.zeroAllStock();
      if (res?.ok) {
        const count = Number(res?.updated || 0);
        toast({
          title: "تم تصفير المخزون",
          description: count ? `تم تصفير ${count} منتج.` : "لا توجد منتجات لتصفير مخزونها."
        });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } else {
        toast({ title: "فشل العملية", description: res?.error || "تعذر تصفير كامل المخزون.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "فشل العملية", description: e?.message || "تعذر تصفير كامل المخزون.", variant: "destructive" });
    } finally {
      setIsZeroingAllStock(false);
    }
  };

  const tabs = [
    { id: "general", label: "عام", icon: Store },
    { id: "appearance", label: "المظهر", icon: Palette },
    { id: "printer", label: "الطابعة", icon: Printer },
    { id: "ai", label: "الذكاء الاصطناعي", icon: Sparkles },
    { id: "cloud", label: "المزامنة السحابية", icon: Server },
    { id: "telegram", label: "بوت تيليگرام", icon: Bot },
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

  const posThemes = [
    { id: "classic", name: "كلاسيكي (افتراضي)", desc: "هو التصميم الأصلي للنقطة.", preview: "bg-white border-slate-200" },
    { id: "focus", name: "تركيز الفاتورة", desc: "الفاتورة عريضة والمنتجات جانب ضيق.", preview: "bg-blue-50 border-blue-200" },
    { id: "stack", name: "مكدس", desc: "الفاتورة أعلى والمنتجات أسفل بعرض كامل.", preview: "bg-slate-50 border-slate-300" },
  ];

  const receiptTemplates = [
    { id: "classic", name: "كلاسيكي", desc: "واضح ومتوازن مع إطار لرأس الوصل وجدول كامل." },
    { id: "compact", name: "مختصر", desc: "أخف وأقصر، مناسب للطباعة السريعة وتوفير الورق." },
    { id: "boxed", name: "مفصل", desc: "إطارات أوضح للمجاميع ومعلومات الفاتورة." },
  ];

  const selectedReceiptTemplate = receiptTemplates.find((template) => template.id === receiptTemplate) || receiptTemplates[0];

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
                    placeholder="مثال: CRO P"
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

                <div className="rounded-xl border bg-slate-50/50 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-medium flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        التسعير الذكي المحلي
                      </div>
                      <p className="text-xs text-slate-500">
                        عند تغيّر سعر الشراء يتم تحديث سعر البيع تلقائياً حسب النسب المحددة هنا.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">{autoPricingEnabled ? "مفعل" : "معطل"}</span>
                      <Checkbox
                        checked={autoPricingEnabled}
                        onCheckedChange={(c) => setAutoPricingEnabled(Boolean(c))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>طريقة التسعير</Label>
                      <Select value={autoPricingMode} onValueChange={setAutoPricingMode} disabled={!autoPricingEnabled}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          <SelectItem value="preserve">الحفاظ على نسبة الربح الحالية</SelectItem>
                          <SelectItem value="fixed">اعتماد نسب ثابتة من الإعدادات</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>التقريب السعري</Label>
                      <Input
                        type="number"
                        min="1"
                        step="50"
                        value={autoPricingRoundTo}
                        onChange={(e) => setAutoPricingRoundTo(e.target.value)}
                        disabled={!autoPricingEnabled}
                        placeholder="مثال: 250"
                      />
                      <p className="text-xs text-slate-500">مثال: 250 يعني تقريب السعر إلى مضاعفات 250.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>طريقة التقريب</Label>
                      <Select value={autoPricingRoundMode} onValueChange={setAutoPricingRoundMode} disabled={!autoPricingEnabled}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          <SelectItem value="nearest">لأقرب قيمة</SelectItem>
                          <SelectItem value="up">للأعلى دائمًا</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">الوضع الافتراضي الآن هو لأقرب قيمة لتقليل القفزات غير المبررة بالسعر.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>نسبة ربح القطعة (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={autoPricingUnitMarkupPercent}
                        onChange={(e) => setAutoPricingUnitMarkupPercent(e.target.value)}
                        disabled={!autoPricingEnabled || autoPricingMode !== "fixed"}
                        placeholder="مثال: 25"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>نسبة ربح الكرتون (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={autoPricingBoxMarkupPercent}
                        onChange={(e) => setAutoPricingBoxMarkupPercent(e.target.value)}
                        disabled={!autoPricingEnabled || autoPricingMode !== "fixed"}
                        placeholder="مثال: 20"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>حد أدنى لتغيّر الكلفة (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={autoPricingMinCostChangePercent}
                        onChange={(e) => setAutoPricingMinCostChangePercent(e.target.value)}
                        disabled={!autoPricingEnabled}
                        placeholder="0 = أي تغيير"
                      />
                      <p className="text-xs text-slate-500">
                        إذا كان التغيّر أقل من هذه النسبة فلن يتم تعديل سعر البيع تلقائياً.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-white mt-7">
                      <div className="space-y-1">
                        <div className="font-medium text-sm">تشغيل الذكاء عند تعديل المنتج</div>
                        <p className="text-xs text-slate-500">تطبيق التسعير التلقائي عند تغيير كلفة الشراء من شاشة المنتجات.</p>
                      </div>
                      <Checkbox
                        checked={autoPricingApplyOnProductEdit}
                        onCheckedChange={(c) => setAutoPricingApplyOnProductEdit(Boolean(c))}
                        disabled={!autoPricingEnabled}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">منع البيع بأقل من الشراء</div>
                      <p className="text-xs text-slate-500">إذا سبّب التقريب أو النسبة سعراً أقل من التكلفة، يتم رفعه تلقائياً إلى تكلفة الشراء.</p>
                    </div>
                    <Checkbox
                      checked={autoPricingPreventLoss}
                      onCheckedChange={(c) => setAutoPricingPreventLoss(Boolean(c))}
                      disabled={!autoPricingEnabled}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={handleCaptureAutoPricingProfiles}
                      disabled={isCapturingAutoPricingProfiles}
                    >
                      {isCapturingAutoPricingProfiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      حفظ نسب المنتجات الحالية
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={handleRunAutoPricingNow}
                      disabled={!autoPricingEnabled || isRunningAutoPricing}
                    >
                      {isRunningAutoPricing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      تطبيق التسعير الآن
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      الأرشفة التلقائية للتقارير وفواتير البيع
                    </div>
                    <p className="text-xs text-slate-500">حفظ نسخة وحذف القديم لفواتير البيع مع الاحتفاظ بآخر يومين.</p>
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

                {/* POS Layout Theme */}
                <div className="space-y-3">
                  <Label>نمط واجهة نقطة البيع</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {posThemes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onPosThemeChange(t.id)}
                        className={`p-3 rounded-xl border text-right transition-all ${
                          posTheme === t.id
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg border ${t.preview}`} />
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-700">{t.name}</div>
                            <div className="text-xs text-slate-500">{t.desc}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">التغييرات تؤثر على شاشة نقطة البيع فقط.</p>
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
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 pt-2">
                  <div className="space-y-3">
                    <div>
                      <Label>شكل الوصل</Label>
                      <p className="text-xs text-slate-500 mt-1">اختر قالب الطباعة الافتراضي لفواتير البيع.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {receiptTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setReceiptTemplate(template.id)}
                          className={`text-right rounded-xl border p-4 transition-all ${
                            receiptTemplate === template.id
                              ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                              : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800">{template.name}</span>
                            <span className={`h-3 w-3 rounded-full ${receiptTemplate === template.id ? "bg-orange-500" : "bg-slate-200"}`} />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{template.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      القالب المختار حالياً: <span className="font-bold text-slate-800">{selectedReceiptTemplate.name}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-700">معاينة الوصل</div>
                        <div className="text-xs text-slate-500">فاتورة تجريبية</div>
                      </div>
                      <Layout className="w-5 h-5 text-orange-500" />
                    </div>
                    <div
                      className={`mx-auto w-[280px] bg-white text-black shadow-sm ${
                        receiptTemplate === "compact"
                          ? "p-3 text-[10px]"
                          : receiptTemplate === "boxed"
                          ? "p-4 text-[11px] border-2 border-black"
                          : "p-3 text-[11px]"
                      }`}
                      dir="rtl"
                    >
                      <div className={`${receiptTemplate === "classic" ? "border-2 border-black rounded p-2" : receiptTemplate === "boxed" ? "border-b-2 border-black pb-2" : "border-b border-black pb-1"} text-center`}>
                        <div className={`${receiptTemplate === "compact" ? "text-sm" : "text-base"} font-black`}>
                          {storeSettings.name || "CRO P"}
                        </div>
                        <div className="font-bold">{storeSettings.address || "العنوان"}</div>
                        <div className="font-mono">{storeSettings.phone || "07xx xxx xxxx"}</div>
                      </div>

                      <div className={`${receiptTemplate === "boxed" ? "my-2 grid grid-cols-2 gap-1 border border-black p-2" : "my-2 space-y-1"}`}>
                        <div className="flex justify-between"><span>رقم الفاتورة:</span><span className="font-bold">INV-1024</span></div>
                        <div className="flex justify-between"><span>الكاشير:</span><span>admin</span></div>
                        <div className="flex justify-between"><span>التاريخ:</span><span>2026-06-07</span></div>
                        <div className="flex justify-between"><span>الوقت:</span><span>12:30</span></div>
                      </div>

                      <table className="w-full border-collapse">
                        <thead>
                          <tr className={receiptTemplate === "compact" ? "border-y border-black" : "border border-black bg-slate-100"}>
                            <th className="py-1 text-center">الصنف</th>
                            <th className="py-1 text-center">الكمية</th>
                            <th className="py-1 text-center">السعر</th>
                            <th className="py-1 text-center">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ["منتج 1", "2", "1,000", "2,000"],
                            ["منتج 2", "1", "2,500", "2,500"],
                          ].map((row) => (
                            <tr key={row[0]} className={receiptTemplate === "boxed" ? "border border-black" : "border-b border-slate-300"}>
                              {row.map((cell) => (
                                <td key={cell} className="py-1 text-center font-semibold">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className={`${receiptTemplate === "boxed" ? "mt-2 border-2 border-black p-2" : "mt-2 border-t-2 border-black pt-2"} space-y-1`}>
                        <div className="flex justify-between"><span>المجموع:</span><span>4,500</span></div>
                        <div className="flex justify-between"><span>الخصم:</span><span>500</span></div>
                        <div className={`${receiptTemplate === "compact" ? "text-sm" : "text-base"} flex justify-between border-t border-black pt-1 font-black`}>
                          <span>الإجمالي:</span><span>4,000 د.ع</span>
                        </div>
                      </div>

                      {receiptBarcodeEnabled && (
                        <div className="mt-3 flex items-center justify-center gap-2 border-t border-dashed border-black pt-2">
                          <div className="h-12 w-12 border border-black bg-slate-100" />
                          <div className="text-[9px] font-bold leading-4">تابعونا<br />لمعرفة العروض</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-between gap-3 p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3 text-sm text-slate-600">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={receiptBarcodeEnabled}
                      onCheckedChange={(c) => setReceiptBarcodeEnabled(Boolean(c))}
                    />
                    <span>إظهار باركود الوصل</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={handleChooseReceiptBarcodeImage}
                    disabled={isChoosingReceiptBarcodeImage}
                  >
                    {isChoosingReceiptBarcodeImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    اختيار صورة الباركود
                  </Button>
                  <span className="text-xs break-all">{receiptBarcodeImage || "qr.png"}</span>
                </div>
                <Button onClick={handleSavePrinterSettings} className="bg-orange-600 hover:bg-orange-700 gap-2">
                  <Save className="w-4 h-4" /> حفظ الإعدادات
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* AI Settings */}
          {activeTab === "ai" && (
            <Card className="border-0 shadow-lg ring-1 ring-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                  إعدادات الذكاء الاصطناعي
                </CardTitle>
                <CardDescription>إدخال وتغيير مفتاح OpenRouter والموديل المستخدم في صفحة الذكاء الاصطناعي.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>OpenRouter API Key</Label>
                  <Input
                    type="password"
                    value={aiSettings.apiKey}
                    onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                    placeholder="sk-or-v1-..."
                    autoComplete="off"
                    dir="ltr"
                  />
                  <p className="text-xs text-slate-500">
                    يتم حفظ المفتاح محليًا داخل إعدادات التطبيق، ويمكن تغييره في أي وقت.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input
                    value={aiSettings.model}
                    onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                    placeholder="meta-llama/llama-3.2-3b-instruct:free"
                    dir="ltr"
                  />
                  <p className="text-xs text-slate-500">
                    اتركه على القيمة الافتراضية أو أدخل اسم أي موديل مدعوم من OpenRouter.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-end p-4">
                <Button onClick={handleSaveAiSettings} className="bg-violet-600 hover:bg-violet-700 gap-2">
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

          {/* Telegram Bot Settings */}
          {activeTab === "telegram" && (
            <Card className="border-0 shadow-lg ring-1 ring-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-sky-600" />
                  بوت تيليگرام للإدارة
                </CardTitle>
                <CardDescription>
                  اربط بوت تيليگرام مستقل لكل مستخدم. المدير يرى التقارير العامة، والكاشير يرى تقاريره فقط.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-sky-100 bg-sky-50/70 p-4">
                  <div>
                    <div className="font-bold text-slate-800">تشغيل بوتات تيليگرام</div>
                    <div className="text-xs text-slate-500 mt-1">
                      الخدمة تعمل من هذا الجهاز، لذلك يجب أن يكون التطبيق مفتوحاً حتى ترد البوتات.
                    </div>
                  </div>
                  <Checkbox
                    checked={Boolean(telegramSettings.enabled)}
                    onCheckedChange={(checked) => setTelegramSettings((prev: any) => ({ ...prev, enabled: Boolean(checked) }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-xs text-slate-500">الحالة</div>
                    <div className="font-bold text-slate-800">{telegramSettings?.running ? "يعمل" : "متوقف"}</div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-xs text-slate-500">البوتات النشطة</div>
                    <div className="font-bold text-slate-800">{telegramSettings?.activeBots || 0}</div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-xs text-slate-500">آخر رسالة</div>
                    <div className="text-xs font-medium text-slate-700">
                      {telegramSettings?.lastMessageAt ? new Date(telegramSettings.lastMessageAt).toLocaleString("ar-IQ") : "-"}
                    </div>
                  </div>
                </div>

                {telegramSettings?.lastError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                    {telegramSettings.lastError}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>اسم نسخة الكاشير</Label>
                      <Input
                        value={telegramSettings.label || ""}
                        onChange={(e) => setTelegramSettings((prev: any) => ({ ...prev, label: e.target.value }))}
                        placeholder="مثال: كاشير الفرع الرئيسي"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الكاشير المرتبط بهذه النسخة</Label>
                      <Select
                        value={telegramSettings.cashierUserId ? String(telegramSettings.cashierUserId) : "all"}
                        onValueChange={(value) => setTelegramSettings((prev: any) => ({ ...prev, cashierUserId: value === "all" ? "" : value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="كل مبيعات هذه النسخة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل مبيعات هذه النسخة</SelectItem>
                          {(telegramUsers || []).map((user: any) => (
                            <SelectItem key={user.id} value={String(user.id)}>
                              {user.name || user.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Bot Token</Label>
                      <Input
                        dir="ltr"
                        type="password"
                        value={telegramSettings.botToken || ""}
                        onChange={(e) => setTelegramSettings((prev: any) => ({ ...prev, botToken: e.target.value }))}
                        placeholder={telegramSettings.botTokenMasked || "123456:ABC..."}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Chat ID الكاشير</Label>
                      <div className="flex gap-2">
                        <Input
                          dir="ltr"
                          value={telegramSettings.cashierChatId || ""}
                          onChange={(e) => setTelegramSettings((prev: any) => ({ ...prev, cashierChatId: e.target.value }))}
                          placeholder="123456789"
                          className="font-mono text-xs"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => handleTestTelegramBot("cashier")} disabled={testingTelegramTarget === "cashier"}>
                          {testingTelegramTarget === "cashier" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Chat ID المالك</Label>
                      <div className="flex gap-2">
                        <Input
                          dir="ltr"
                          value={telegramSettings.ownerChatId || ""}
                          onChange={(e) => setTelegramSettings((prev: any) => ({ ...prev, ownerChatId: e.target.value }))}
                          placeholder="123456789"
                          className="font-mono text-xs"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => handleTestTelegramBot("owner")} disabled={testingTelegramTarget === "owner"}>
                          {testingTelegramTarget === "owner" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden rounded-xl border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                    <div className="col-span-2">المستخدم</div>
                    <div className="col-span-2">الدور</div>
                    <div className="col-span-4">Bot Token</div>
                    <div className="col-span-3">Chat ID</div>
                    <div className="col-span-1 text-center">تفعيل</div>
                  </div>
                  <div className="divide-y">
                    {(telegramSettings.users || []).map((user: any) => (
                      <div key={user.userId} className="grid grid-cols-12 gap-2 px-3 py-3 items-center">
                        <div className="col-span-2 min-w-0">
                          <div className="font-bold text-sm text-slate-800 truncate">{user.name || user.username}</div>
                          <div className="text-[11px] text-slate-500 truncate">@{user.username}</div>
                        </div>
                        <div className="col-span-2 text-xs text-slate-600">{user.role}</div>
                        <div className="col-span-4">
                          <Input
                            dir="ltr"
                            type="password"
                            value={user.botToken || ""}
                            onChange={(e) => updateTelegramUser(user.userId, { botToken: e.target.value })}
                            placeholder={user.botTokenMasked || "123456:ABC..."}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            dir="ltr"
                            value={user.chatId || ""}
                            onChange={(e) => updateTelegramUser(user.userId, { chatId: e.target.value })}
                            placeholder="مثال: 123456789"
                            className="font-mono text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex items-center justify-center gap-2">
                          <Checkbox
                            checked={user.enabled !== false}
                            onCheckedChange={(checked) => updateTelegramUser(user.userId, { enabled: Boolean(checked) })}
                          />
                        </div>
                        <div className="col-span-12 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleTestTelegramBot(user)}
                            disabled={testingTelegramUserId === Number(user.userId)}
                          >
                            {testingTelegramUserId === Number(user.userId) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            اختبار
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                  الأوامر المتاحة: /sales، /stock، /lowstock، /help. المدير فقط يمكنه استخدام /debts و /cashiers.
                  للحصول على Chat ID: أرسل أي رسالة للبوت ثم افتح الرابط:
                  <span className="mx-1 font-mono">https://api.telegram.org/botTOKEN/getUpdates</span>
                  واستبدل TOKEN بتوكن البوت.
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-end p-4">
                <Button onClick={handleSaveTelegramSettings} className="bg-sky-600 hover:bg-sky-700 gap-2">
                  <Save className="w-4 h-4" /> حفظ إعدادات تيليگرام
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
                          : updateStatus?.status === "downloading"
                          ? "جارٍ تنزيل التحديث"
                          : updateStatus?.status === "downloaded"
                          ? "جاهز للتثبيت"
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
                  {updateStatus?.status === "downloading" && (
                    <div className="text-xs text-blue-600">
                      جاري التنزيل... {updateStatus?.progress?.percent ?? 0}%
                    </div>
                  )}
                  {updateStatus?.error && (
                    <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">
                      {updateStatus.error}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex items-center justify-between p-4">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleCheckForUpdates} className="bg-blue-600 hover:bg-blue-700 gap-2" disabled={isCheckingUpdates}>
                      {isCheckingUpdates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      تحقق من التحديثات
                    </Button>
                    {updateStatus?.status === "available" && (
                      <Button onClick={handleDownloadUpdate} variant="outline" className="gap-2">
                        <Download className="w-4 h-4" />
                        تنزيل التحديث
                      </Button>
                    )}
                    {updateStatus?.status === "downloaded" && (
                      <Button onClick={handleInstallUpdate} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                        <Download className="w-4 h-4" />
                        تثبيت الآن
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>

              <Card className="border-0 shadow-lg ring-1 ring-slate-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    Backup & Restore
                  </CardTitle>
                  <CardDescription>Simplified backups saved automatically in one managed folder.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2 hover:bg-blue-50 hover:border-blue-200"
                      onClick={() => handleBackup("all")}
                      disabled={creatingBackupType !== null}
                    >
                      {creatingBackupType === "all" ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : <Server className="w-6 h-6 text-blue-600" />}
                      <div className="text-center">
                        <div className="font-bold text-slate-700">Full System Backup</div>
                        <div className="text-[10px] text-slate-400">Everything: sales, purchases, suppliers, debts, settings</div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2 hover:bg-emerald-50 hover:border-emerald-200"
                      onClick={() => handleBackup("products")}
                      disabled={creatingBackupType !== null}
                    >
                      {creatingBackupType === "products" ? <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /> : <Download className="w-6 h-6 text-emerald-600" />}
                      <div className="text-center">
                        <div className="font-bold text-slate-700">Products Backup</div>
                        <div className="text-[10px] text-slate-400">JSON file for products only</div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2 hover:bg-orange-50 hover:border-orange-200"
                      onClick={() => handleBackup("debts")}
                      disabled={creatingBackupType !== null}
                    >
                      {creatingBackupType === "debts" ? <Loader2 className="w-6 h-6 text-orange-600 animate-spin" /> : <Download className="w-6 h-6 text-orange-600" />}
                      <div className="text-center">
                        <div className="font-bold text-slate-700">Debts Backup</div>
                        <div className="text-[10px] text-slate-400">JSON file for debts and clients</div>
                      </div>
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => refetchManagedBackups()} disabled={isManagedBackupsLoading}>
                      {isManagedBackupsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                      Refresh Backups List
                    </Button>
                    <Button variant="outline" className="gap-2 hover:bg-purple-50 hover:border-purple-200" onClick={handleRestore}>
                      <Upload className="w-4 h-4 text-purple-600" />
                      Restore External File
                    </Button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
                    <div className="flex flex-col gap-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">Managed Backups Folder</span>
                      <span className="font-mono text-[11px] break-all">{managedBackupsDir || "-"}</span>
                    </div>

                    {managedBackups.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 text-center">
                        No backups found yet. Create your first backup from the buttons above.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {managedBackups.map((backup: any) => (
                          <div key={backup.file} className="rounded-lg border bg-white p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 truncate">{backup.file}</div>
                              <div className="text-xs text-slate-500 mt-1">
                                {backupTypeLabel(backup.type)} - {formatBackupSize(Number(backup.size || 0))} - {formatUpdateTime(backup.modifiedAt)}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => handleRestoreManaged(backup.file)}
                              disabled={restoringManagedFile === backup.file}
                            >
                              {restoringManagedFile === backup.file ? <Loader2 className="w-4 h-4 animate-spin" /> : "Restore"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg ring-1 ring-slate-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-amber-600" />
                    صيانة المخزون
                  </CardTitle>
                  <CardDescription>أدوات تصحيح الأخطاء في أرصدة المخزون.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4 border rounded-xl bg-slate-50/50">
                    <div>
                      <div className="font-bold text-slate-700">تصفير المخزون السالب</div>
                      <p className="text-xs text-slate-500 mt-1">
                        يقوم بتعديل جميع المنتجات ذات المخزون الأقل من صفر إلى 0 لحل أخطاء الجرد.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={handleZeroNegativeStock}
                      disabled={isFixingNegativeStock}
                    >
                      {isFixingNegativeStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                      تصفير الآن
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4 border rounded-xl bg-red-50/60 border-red-100">
                    <div>
                      <div className="font-bold text-red-700">تصفير كامل المخزون</div>
                      <p className="text-xs text-slate-500 mt-1">
                        يجعل مخزون جميع المنتجات 0، سواء كان موجباً أو سالباً.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={handleZeroAllStock}
                      disabled={isZeroingAllStock}
                    >
                      {isZeroingAllStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                      تصفير الكل
                    </Button>
                  </div>
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
