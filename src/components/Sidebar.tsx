﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "./ui/button";
import { 
  LayoutDashboard, 
  Package, 
  BarChart2, 
  Receipt, 
  Users, 
  Activity, 
  Tag, 
  History,
  Wallet,
  Utensils, 
  BookOpen, 
  Settings, 
  Database, 
  Download, 
  Upload, 
  LogOut,
  Truck,
  Archive,
  Sparkles
} from "lucide-react";
import DailyNotes from "./DailyNotes";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { to: "/", text: "نقطة البيع", icon: LayoutDashboard, roles: ["admin", "cashier"] },
  { to: "/products", text: "إدارة المنتجات", icon: Package, roles: ["admin", "cashier"] },
  { to: "/reports", text: "التقارير", icon: BarChart2, roles: ["admin", "cashier"] },
  { to: "/invoices", text: "الفواتير", icon: Receipt, roles: ["admin", "cashier"] },
  { to: "/users", text: "الموظفين", icon: Users, roles: ["admin"] },
  { to: "/activity-log", text: "سجل النشاط", icon: Activity, roles: ["admin"] },
  { to: "/pricing-logs", text: "سجل التسعيرات", icon: Tag, roles: ["admin"] },
  { to: "/invoice-logs", text: "سجل التعديلات", icon: History, roles: ["admin"] },
  { to: "/center-cashbox", text: "قاصة المركز", icon: Wallet, roles: ["admin", "cashier"] },
  { to: "/chicken-legs", text: "دجاج الأرجل", icon: Utensils, roles: ["admin", "cashier"] },
  { to: "/debts", text: "سجل الديون", icon: BookOpen, roles: ["admin", "cashier"] },
  { to: "/suppliers", text: "سجل الموردين", icon: Truck, roles: ["admin", "cashier"] },
  { to: "/archives", text: "الأرشيفات", icon: Archive, roles: ["admin"] },
  { to: "/ai-chat", text: "الذكاء الاصطناعي", icon: Sparkles, roles: ["admin"] },
  { to: "/settings", text: "الإعدادات", icon: Settings, roles: ["admin"] },
];

const Sidebar = ({
  currentUser,
  onLogout,
  onToggleRamadan,
  updateStatus
}: {
  currentUser: any,
  onLogout: () => void,
  onToggleRamadan?: () => void,
  updateStatus?: any
}) => {
  const isAdmin = currentUser?.role === "admin";
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const { toast } = useToast();
  const [clickCount, setClickCount] = useState(0);
  const [dailyStats, setDailyStats] = useState({ hours: 0, wage: 0 });
  const [dailyWageEnabled, setDailyWageEnabled] = useState(true);
  const [hourlyRate, setHourlyRate] = useState(1.875);

  const resolveHourlyRate = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1.875;
  };

  const resolveDailyWageEnabled = (value: any) => {
    if (value === null || value === undefined) return true;
    return !(value === false || value === "false");
  };

  const formatHours = (value: number) => Number(value || 0).toFixed(2);
  const formatWage = (value: number) =>
    new Intl.NumberFormat("ar-IQ", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value || 0);

  const toDateInput = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const enabledRaw = await window.api.getAppSetting("dailyWageEnabled");
        const rateRaw = await window.api.getAppSetting("dailyWageHourlyRate");
        if (!active) return;
        setDailyWageEnabled(resolveDailyWageEnabled(enabledRaw));
        setHourlyRate(resolveHourlyRate(rateRaw));
      } catch (e) {
        if (!active) return;
        setDailyWageEnabled(true);
        setHourlyRate(1.875);
      }
    };

    const handleSettingsUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setDailyWageEnabled(resolveDailyWageEnabled(detail.enabled));
      setHourlyRate(resolveHourlyRate(detail.hourlyRate));
    };

    loadSettings();
    window.addEventListener("daily-wage-settings", handleSettingsUpdate as EventListener);
    return () => {
      active = false;
      window.removeEventListener("daily-wage-settings", handleSettingsUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!dailyWageEnabled || !currentUser?.id || typeof window.api?.listUserActivityLogs !== "function") {
      setDailyStats({ hours: 0, wage: 0 });
      return;
    }

    let timer: number | undefined;

    const loadDailyStats = async () => {
      try {
        const today = new Date();
        const dateKey = toDateInput(today);
        const logs = await window.api.listUserActivityLogs({ dateFrom: dateKey, dateTo: dateKey });
        const userLogs = (logs || []).filter((log: any) =>
          String(log.user?.id ?? log.userId ?? "") === String(currentUser.id)
        );
        userLogs.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        let lastLogin: Date | null = null;
        let totalMs = 0;
        const now = new Date();

        for (const log of userLogs) {
          const ts = new Date(log.createdAt);
          if (log.action === "login") {
            if (lastLogin) {
              totalMs += Math.max(0, ts.getTime() - lastLogin.getTime());
            }
            lastLogin = ts;
          } else if (log.action === "logout") {
            if (lastLogin) {
              totalMs += Math.max(0, ts.getTime() - lastLogin.getTime());
              lastLogin = null;
            }
          }
        }

        if (lastLogin) {
          totalMs += Math.max(0, now.getTime() - lastLogin.getTime());
        }

        const hours = totalMs / 3600000;
        const wage = hours * hourlyRate;
        setDailyStats({ hours, wage });
      } catch (e) {
        setDailyStats({ hours: 0, wage: 0 });
      }
    };

    loadDailyStats();
    timer = window.setInterval(loadDailyStats, 60000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [currentUser?.id, dailyWageEnabled, hourlyRate]);


  const handleSecretClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount === 5) {
      if (onToggleRamadan) onToggleRamadan();
      setClickCount(0);
      toast({ title: "🌙", description: "تم تبديل الوضع الرمضاني", duration: 2000 });
    }
  };

  return (
    <aside 
      className={`bg-white shadow-xl flex flex-col border-l border-slate-100 h-screen sticky top-0 font-sans transition-all duration-300 ease-in-out overflow-hidden ${
        isExpanded ? "w-64" : "w-24"
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Header */}
      <div className={`p-4 bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md transition-all duration-300 ${isExpanded ? "p-6" : "p-4"}`}>
        {isExpanded ? (
          <>
            <h2 className="text-2xl font-bold mb-1 tracking-tight">نقطة البيع</h2>
            <div className="flex items-center gap-2 opacity-90 text-sm font-medium">
              {/* الزر المخفي هنا: النقطة الخضراء */}
              <div
                className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)] cursor-pointer hover:scale-150 transition-transform"
                onClick={handleSecretClick}
                title="Online"
              />
              {updateStatus?.available && (
                <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full">
                  تحديث متاح
                </span>
              )}
              <div className="flex flex-col leading-tight">
                <span>مرحباً, {currentUser.name || currentUser.username}</span>
                {dailyWageEnabled && (
                  <span className="text-xs text-blue-100/90">
                    يومية اليوم: {formatWage(dailyStats.wage)} د.ع · {formatHours(dailyStats.hours)} ساعة
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex justify-center">
            <div
              className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)] cursor-pointer hover:scale-150 transition-transform"
              onClick={handleSecretClick}
              title="Online"
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto py-4 custom-scrollbar transition-all duration-300" style={{ paddingLeft: isExpanded ? "12px" : "6px", paddingRight: isExpanded ? "12px" : "6px" }}>
        {navItems.map((item) =>
          item.roles.includes(currentUser.role) ? (
            <NavLink
              key={item.to}
              to={item.to}
              title={!isExpanded ? item.text : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 transition-all duration-200 font-medium group rounded-xl ${
                  isExpanded ? "px-4 py-3" : "px-3 py-3 justify-center"
                } ${
                  isActive
                    ? "bg-blue-50 text-blue-700 shadow-sm translate-x-[-4px]"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:translate-x-[-2px]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 shrink-0 transition-colors ${isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                  {isExpanded && <span className="whitespace-nowrap">{item.text}</span>}
                </>
              )}
            </NavLink>
          ) : null
        )}
      </nav>

      {/* Footer Actions */}
      <div className={`border-t border-slate-100 bg-slate-50/50 space-y-2 transition-all duration-300 ${isExpanded ? "p-3" : "p-2"}`}>
        {isExpanded && <DailyNotes currentUser={currentUser} />}
        
        {isAdmin && (
          <div className="relative">
            <Button
              variant="ghost"
              title={!isExpanded ? "النسخ الاحتياطية" : undefined}
              className={`w-full gap-3 text-slate-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all ${
                isExpanded ? "justify-start" : "justify-center p-0"
              }`}
              onClick={() => setBackupMenuOpen((v) => !v)}
            >
              <Database className="w-5 h-5 text-indigo-500 shrink-0" />
              {isExpanded && <span>النسخ الاحتياطية</span>}
            </Button>
            {backupMenuOpen && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
                <div className="p-2 space-y-1">
                <button
                  className="w-full px-3 py-2 hover:bg-blue-50 text-slate-700 rounded-lg flex items-center gap-2 text-sm transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    setBackupMenuOpen(false);
                    try {
                      const res = await window.api.backupCreate({ type: "all", actorRole: currentUser?.role });
                      if (res?.ok) toast({ title: "تم الإنشاء", description: "تم إنشاء نسخة كاملة تشمل كل بيانات النظام." });
                    } catch (err: any) {
                      toast({ title: "خطأ", description: err?.message || "تعذر إنشاء النسخة الاحتياطية.", variant: "destructive" });
                    }
                  }}
                >
                  <Download className="w-4 h-4 text-blue-500" /> نسخة كاملة لكل البيانات
                </button>
                <button
                  className="w-full px-3 py-2 hover:bg-blue-50 text-slate-700 rounded-lg flex items-center gap-2 text-sm transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    setBackupMenuOpen(false);
                    try {
                      const res = await window.api.backupCreate({ type: "products", actorRole: currentUser?.role });
                      if (res?.ok) toast({ title: "تم الإنشاء", description: "تم حفظ نسخة احتياطية للمنتجات." });
                    } catch (err: any) {
                      toast({ title: "خطأ", description: err?.message || "تعذر إنشاء نسخة المنتجات.", variant: "destructive" });
                    }
                  }}
                >
                  <Download className="w-4 h-4 text-green-500" /> نسخة المنتجات
                </button>
                <button
                  className="w-full px-3 py-2 hover:bg-blue-50 text-slate-700 rounded-lg flex items-center gap-2 text-sm transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    setBackupMenuOpen(false);
                    try {
                      const res = await window.api.backupCreate({ type: "debts", actorRole: currentUser?.role });
                      if (res?.ok) toast({ title: "تم الإنشاء", description: "تم حفظ نسخة احتياطية للديون." });
                    } catch (err: any) {
                      toast({ title: "خطأ", description: err?.message || "تعذر إنشاء نسخة الديون.", variant: "destructive" });
                    }
                  }}
                >
                  <Download className="w-4 h-4 text-orange-500" /> نسخة الديون
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <button
                  className="w-full px-3 py-2 hover:bg-red-50 text-slate-700 rounded-lg flex items-center gap-2 text-sm transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    setBackupMenuOpen(false);
                    try {
                      const res = await window.api.backupRestore({ actorRole: currentUser?.role });
                      if (res?.ok) {
                        toast({ title: "تم الاسترجاع", description: "تم استرجاع النسخة الاحتياطية بنجاح." });
                      } else if (res && res.message) {
                        toast({ title: "تم الإلغاء", description: res.message, variant: "default" });
                      }
                    } catch (err: any) {
                      toast({ title: "خطأ", description: err?.message || "تعذر الاسترجاع.", variant: "destructive" });
                    }
                  }}
                >
                  <Upload className="w-4 h-4 text-red-500" /> استرجاع نسخة
                </button>
              </div>
              </div>
            )}
          </div>
        )}

        <Button 
          variant="ghost"
          title={!isExpanded ? "تسجيل الخروج" : undefined}
          className={`w-full gap-3 text-red-600 hover:bg-red-50 hover:text-red-700 border border-transparent hover:border-red-100 transition-all ${
            isExpanded ? "justify-start" : "justify-center p-0"
          }`}
          onClick={onLogout}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {isExpanded && <span>تسجيل الخروج</span>}
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
