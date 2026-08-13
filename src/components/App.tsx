﻿﻿﻿import { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "./Login";
import Sidebar from "./Sidebar";
import SalesInterface from "./SalesInterface";
import ProductManagement from "./ProductManagement";
import ReportsSection from "./ReportsSection";
import SalesInvoices from "./SalesInvoices";
import Cashiers from "./Cashiers";
import ChickenLegs from "./ChickenLegs"; 
import DebtsPage from "./Debts";
import UserActivityLogPage from "./UserActivityLogPage";
import PricingLogsPage from "./PricingLogsPage";
import CenterCashboxPage from "./CenterCashboxPage";
import SettingsPage from "./SettingsPage";
import Suppliers from "./Suppliers";
import ArchivesPage from "./ArchivesPage";
import InvoiceChangeLogs from "./InvoiceChangeLogs";
import AIChatPage from "./AIChatPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: false,
    },
    mutations: {
      networkMode: "always",
    },
  },
});
const POS_THEMES = ["classic", "focus", "stack"];

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isRamadanMode, setIsRamadanMode] = useState(() => localStorage.getItem("ramadanMode") === "true");
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem("themeColor") || "blue");
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem("compactMode") === "true");
  const [reduceAnimations, setReduceAnimations] = useState(() => localStorage.getItem("reduceAnimations") === "true");
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("fontSize") || "medium");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("soundEnabled") !== "false"); // الافتراضي مفعل
  const [allowPriceEdit, setAllowPriceEdit] = useState(() => localStorage.getItem("allowPriceEdit") === "true");
  const [purchaseMode, setPurchaseMode] = useState(() => localStorage.getItem("purchaseMode") || "units");
  const [posTheme, setPosTheme] = useState(() => {
    const stored = localStorage.getItem("posTheme") || "classic";
    return POS_THEMES.includes(stored) ? stored : "classic";
  });
  const [showLanterns, setShowLanterns] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<any>({ status: "idle", available: false });

  const handleLogin = (user: any) => {
    localStorage.setItem("currentUser", JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    if (currentUser && (currentUser as any).id) {
      try {
        await window.api.createUserActivityLog({
          userId: (currentUser as any).id,
          action: "logout",
        });
      } catch (err) {
        console.error("Failed to log logout activity:", err);
      }
    }
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
  };

  const toggleRamadanMode = () => {
    const newState = !isRamadanMode;
    setIsRamadanMode(newState);
    localStorage.setItem("ramadanMode", String(newState));
    // حفظ الإعداد في قاعدة البيانات لضمان بقائه بعد إعادة التشغيل
    window.api.setAppSetting({ key: "ramadanMode", value: String(newState) });
  };

  const handleThemeChange = (color: string) => {
    setThemeColor(color);
    localStorage.setItem("themeColor", color);
    window.api.setAppSetting({ key: "themeColor", value: color });
  };

  const handleCompactModeChange = (isCompact: boolean) => {
    setCompactMode(isCompact);
    localStorage.setItem("compactMode", String(isCompact));
    window.api.setAppSetting({ key: "compactMode", value: String(isCompact) });
  };

  const handleAnimationsChange = (reduce: boolean) => {
    setReduceAnimations(reduce);
    localStorage.setItem("reduceAnimations", String(reduce));
    window.api.setAppSetting({ key: "reduceAnimations", value: String(reduce) });
  };

  const handleFontSizeChange = (size: string) => {
    setFontSize(size);
    localStorage.setItem("fontSize", size);
    window.api.setAppSetting({ key: "fontSize", value: size });
  };

  const handleSoundEnabledChange = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem("soundEnabled", String(enabled));
    window.api.setAppSetting({ key: "soundEnabled", value: String(enabled) });
  };

  const handleAllowPriceEditChange = (allow: boolean) => {
    setAllowPriceEdit(allow);
    localStorage.setItem("allowPriceEdit", String(allow));
    window.api.setAppSetting({ key: "allowPriceEdit", value: String(allow) });
  };

  const handlePurchaseModeChange = (mode: string) => {
    setPurchaseMode(mode);
    localStorage.setItem("purchaseMode", mode);
    window.api.setAppSetting({ key: "purchaseMode", value: mode });
  };

  const handlePosThemeChange = (theme: string) => {
    const next = POS_THEMES.includes(theme) ? theme : "classic";
    setPosTheme(next);
    localStorage.setItem("posTheme", next);
    window.api.setAppSetting({ key: "posTheme", value: next });
  };

  const handleMoonClick = () => {
    if (!showLanterns) {
      setShowLanterns(true);
      setTimeout(() => setShowLanterns(false), 5000);
    }
  };

  useEffect(() => {
    // استرجاع الإعداد من قاعدة البيانات عند فتح التطبيق
    const loadRamadanSetting = async () => {
      try {
        const savedMode = await window.api.getAppSetting("ramadanMode");
        const savedColor = await window.api.getAppSetting("themeColor");
        const savedCompact = await window.api.getAppSetting("compactMode");
        const savedAnimations = await window.api.getAppSetting("reduceAnimations");
        const savedFontSize = await window.api.getAppSetting("fontSize");
        const savedSound = await window.api.getAppSetting("soundEnabled");
        const savedAllowPriceEdit = await window.api.getAppSetting("allowPriceEdit");
        const savedPurchaseMode = await window.api.getAppSetting("purchaseMode");
        const savedPosTheme = await window.api.getAppSetting("posTheme");

        if (savedMode !== null && savedMode !== undefined) {
          const isEnabled = savedMode === "true";
          setIsRamadanMode(isEnabled);
          localStorage.setItem("ramadanMode", String(isEnabled));
        }
        if (savedColor) { setThemeColor(savedColor); localStorage.setItem("themeColor", savedColor); }
        if (savedCompact !== null) { 
          setCompactMode(savedCompact === "true"); localStorage.setItem("compactMode", savedCompact);
          setReduceAnimations(savedAnimations === "true"); localStorage.setItem("reduceAnimations", savedAnimations || "false");
        }
        if (savedFontSize) { setFontSize(savedFontSize); localStorage.setItem("fontSize", savedFontSize); }
        if (savedSound !== null) { 
          setSoundEnabled(savedSound === "true"); 
          localStorage.setItem("soundEnabled", savedSound); 
        }
        if (savedAllowPriceEdit !== null) {
          setAllowPriceEdit(savedAllowPriceEdit === "true");
          localStorage.setItem("allowPriceEdit", savedAllowPriceEdit);
        }
        if (savedPurchaseMode) { setPurchaseMode(savedPurchaseMode); localStorage.setItem("purchaseMode", savedPurchaseMode); }
        if (savedPosTheme && POS_THEMES.includes(savedPosTheme)) {
          setPosTheme(savedPosTheme);
          localStorage.setItem("posTheme", savedPosTheme);
        } else if (savedPosTheme) {
          setPosTheme("classic");
          localStorage.setItem("posTheme", "classic");
        }
      } catch (e) {
        console.error("Failed to load ramadan mode setting", e);
      }
    };
    loadRamadanSetting();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadUpdateStatus = async () => {
      try {
        if (typeof window.api?.getUpdateStatus === "function") {
          const status = await window.api.getUpdateStatus();
          if (status) setUpdateStatus(status);
        }
      } catch (e) {
        setUpdateStatus({ status: "error", available: false });
      }
    };

    loadUpdateStatus();
    if (typeof window.api?.onUpdateStatus === "function") {
      unsubscribe = window.api.onUpdateStatus((status) => {
        if (status) setUpdateStatus(status);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isRamadanMode) {
      document.body.classList.add("ramadan-mode");
    } else {
      document.body.classList.remove("ramadan-mode");
    }

    if (compactMode) document.body.classList.add("compact-mode");
    else document.body.classList.remove("compact-mode");

    if (reduceAnimations) document.body.classList.add("reduce-animations");
    else document.body.classList.remove("reduce-animations");

    document.documentElement.classList.remove("font-small", "font-medium", "font-large");
    document.documentElement.classList.add(`font-${fontSize}`);

    document.body.classList.remove("pos-theme-classic", "pos-theme-focus", "pos-theme-stack");
    document.body.classList.add(`pos-theme-${posTheme}`);
  }, [isRamadanMode, compactMode, reduceAnimations, fontSize, posTheme]);

  if (!currentUser) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Login onLogin={handleLogin} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // تعريف الألوان للثيمات المختلفة
  const getThemeStyles = () => {
    if (isRamadanMode) return ""; // الوضع الرمضاني له أولوية وستايل خاص
    if (themeColor === "blue") return ""; // الافتراضي

    const colors: any = {
      green: { primary: "#059669", hover: "#047857", light: "#ecfdf5", border: "#a7f3d0", text: "#064e3b" },
      purple: { primary: "#7c3aed", hover: "#6d28d9", light: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" },
      orange: { primary: "#ea580c", hover: "#c2410c", light: "#fff7ed", border: "#fed7aa", text: "#9a3412" },
      red: { primary: "#e11d48", hover: "#be123c", light: "#fff1f2", border: "#fecdd3", text: "#9f1239" },
      slate: { primary: "#475569", hover: "#334155", light: "#f8fafc", border: "#e2e8f0", text: "#1e293b" },
    };

    const c = colors[themeColor];
    if (!c) return "";

    return `
      .bg-blue-600 { background-color: ${c.primary} !important; border-color: ${c.hover}; }
      .hover\\:bg-blue-700:hover { background-color: ${c.hover} !important; }
      .text-blue-600 { color: ${c.primary} !important; }
      .text-blue-700 { color: ${c.primary} !important; }
      .text-blue-800 { color: ${c.text} !important; }
      .bg-blue-50 { background-color: ${c.light} !important; }
      .border-blue-100 { border-color: ${c.border} !important; }
      .border-blue-200 { border-color: ${c.border} !important; }
      .bg-gradient-to-br.from-blue-600.to-blue-800 { 
        background-image: linear-gradient(135deg, ${c.hover} 0%, ${c.primary} 100%) !important;
      }
      .bg-gradient-to-r.from-blue-600.to-blue-700 {
        background-image: linear-gradient(to right, ${c.primary}, ${c.hover}) !important;
      }
      /* Ring colors for inputs */
      .focus\\:ring-blue-500\\/10:focus { --tw-ring-color: ${c.primary}20 !important; }
      .focus\\:border-blue-500:focus { border-color: ${c.primary} !important; }
    `;
  };

  const compactStyles = `
    .compact-mode .p-4 { padding: 0.75rem !important; }
    .compact-mode .p-6 { padding: 1rem !important; }
    .compact-mode .gap-4 { gap: 0.75rem !important; }
    .compact-mode .gap-6 { gap: 1rem !important; }
    .compact-mode .h-10 { height: 2.25rem !important; }
    .compact-mode .h-12 { height: 2.5rem !important; }
    .compact-mode .text-lg { font-size: 1rem !important; }
    .compact-mode .text-xl { font-size: 1.125rem !important; }
    .compact-mode .text-2xl { font-size: 1.25rem !important; }
    .compact-mode .text-3xl { font-size: 1.5rem !important; }
    .compact-mode table td, .compact-mode table th { padding: 0.25rem 0.5rem !important; }
  `;

  const animationStyles = `
    .reduce-animations *, .reduce-animations *::before, .reduce-animations *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  `;

  const fontStyles = `
    html.font-small { font-size: 14px; }
    html.font-medium { font-size: 16px; }
    html.font-large { font-size: 18px; }
  `;

  const posThemeStyles = `
    /* POS Themes (scope: .pos-root) */
    @media (min-width: 1024px) {
      .pos-theme-focus .pos-root {
        flex-direction: row !important;
      }
      .pos-theme-focus .pos-root > main {
        order: 1 !important;
        flex: 1 1 auto !important;
      }
      .pos-theme-focus .pos-root > aside {
        order: 2 !important;
        width: 260px !important;
      }
    }

    .pos-theme-stack .pos-root {
      flex-direction: column !important;
    }
    .pos-theme-stack .pos-root > main {
      order: 1 !important;
      flex: 1 1 auto !important;
      height: auto !important;
    }
    .pos-theme-stack .pos-root > aside {
      order: 2 !important;
      width: 100% !important;
      height: auto !important;
      flex: 0 0 auto !important;
    }
    .pos-theme-stack .pos-root > aside .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  `;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router>
          <style>{getThemeStyles()}</style>
          <style>{compactStyles}</style>
          <style>{animationStyles}</style>
          <style>{fontStyles}</style>
          <style>{posThemeStyles}</style>
          {isRamadanMode && (
            <style>{`
              /* الألوان الأساسية: زمردي وذهبي */
              .ramadan-mode .bg-blue-600 { 
                background-color: #059669 !important; 
                border: 1px solid #047857;
                box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2);
              }
              .ramadan-mode .hover\\:bg-blue-700:hover { background-color: #047857 !important; }
              
              /* النصوص والخلفيات */
              .ramadan-mode .text-blue-800 { color: #064e3b !important; } /* emerald-900 */
              .ramadan-mode .text-blue-700 { color: #059669 !important; }
              .ramadan-mode .text-blue-600 { color: #059669 !important; }
              .ramadan-mode .bg-blue-50 { background-color: #ecfdf5 !important; } /* emerald-50 */
              .ramadan-mode .border-blue-100 { border-color: #a7f3d0 !important; }
              .ramadan-mode .border-blue-200 { border-color: #6ee7b7 !important; }
              
              /* التدرجات اللونية */
              .ramadan-mode .bg-gradient-to-br.from-blue-600.to-blue-800 { 
                  background-image: linear-gradient(135deg, #064e3b 0%, #059669 100%) !important;
                  border-bottom: 3px solid #fbbf24; /* خط ذهبي أسفل الهيدر */
              }
              .ramadan-mode .bg-gradient-to-r.from-blue-600.to-blue-700 {
                  background-image: linear-gradient(to right, #059669, #047857) !important;
              }
              
              /* خلفية التطبيق المزخرفة */
              .ramadan-mode .bg-gray-100 {
                background-color: #f0fdf4 !important;
                background-image: radial-gradient(#10b981 0.5px, transparent 0.5px), radial-gradient(#10b981 0.5px, #f0fdf4 0.5px);
                background-size: 20px 20px;
                background-position: 0 0, 10px 10px;
              }

              /* لمسات إضافية */
              .ramadan-mode .text-orange-600 { color: #d97706 !important; }
              
              /* زينة رمضان المتحركة */
              .ramadan-decoration-moon {
                position: fixed;
                top: 15px;
                left: 20px;
                font-size: 45px;
                z-index: 9999;
                filter: drop-shadow(0 0 5px rgba(251, 191, 36, 0.5));
                animation: float 6s ease-in-out infinite;
                pointer-events: auto;
                cursor: pointer;
                transition: transform 0.2s;
              }
              .ramadan-decoration-moon:active {
                transform: scale(0.9);
              }
              
              @keyframes float { 0% { transform: translateY(0px) rotate(10deg); } 50% { transform: translateY(10px) rotate(-5deg); } 100% { transform: translateY(0px) rotate(10deg); } }
              @keyframes swing { 0% { transform: rotate(5deg); } 50% { transform: rotate(-5deg); } 100% { transform: rotate(5deg); } }
              
              @keyframes fall {
                0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
                100% { transform: translateY(110vh) rotate(20deg); opacity: 0; }
              }
              .lantern {
                position: fixed;
                top: -60px;
                z-index: 10000;
                user-select: none;
                pointer-events: none;
              }
            `}</style>
          )}
          {isRamadanMode && <div className="ramadan-decoration-moon" onClick={handleMoonClick} title="اضغط لتساقط الفوانيس">🌙</div>}
          {showLanterns && Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="lantern"
              style={{
                left: `${Math.random() * 100}vw`,
                animation: `fall ${3 + Math.random() * 4}s linear forwards`, // حركة أبطأ قليلاً للاستمتاع بالشكل
                animationDelay: `${Math.random() * 2}s`,
                width: `${40 + Math.random() * 40}px` // حجم أكبر وأوضح
              }}
            >
              {/* رسم فانوس رمضاني SVG بدلاً من الإيموجي */}
              <svg viewBox="0 0 100 100" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))' }}>
                {/* الحلقة العلوية */}
                <path d="M50 2 V15" stroke="#b45309" strokeWidth="2" />
                <circle cx="50" cy="2" r="2" stroke="#b45309" strokeWidth="2" fill="none" />
                {/* القبة */}
                <path d="M40 15 L50 5 L60 15 Z" fill="#f59e0b" />
                <rect x="35" y="15" width="30" height="5" fill="#b45309" rx="1" />
                {/* جسم الفانوس الزجاجي */}
                <path d="M35 20 L25 60 H75 L65 20 Z" fill="rgba(255, 251, 235, 0.9)" stroke="#d97706" strokeWidth="1.5" />
                {/* الضوء الداخلي */}
                <circle cx="50" cy="40" r="6" fill="#fbbf24" className="animate-pulse" />
                {/* القاعدة */}
                <path d="M25 60 L35 75 H65 L75 60 Z" fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
                <rect x="40" y="75" width="20" height="3" fill="#b45309" rx="1" />
                {/* زخرفة */}
                <path d="M35 20 L65 60 M65 20 L35 60" stroke="#d97706" strokeWidth="0.5" opacity="0.4" />
              </svg>
            </div>
          ))}
          <div className="flex h-screen bg-gray-100" dir="rtl">
            <Sidebar currentUser={currentUser} onLogout={handleLogout} onToggleRamadan={toggleRamadanMode} updateStatus={updateStatus} />
            <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
              <Routes>
                <Route path="/" element={<SalesInterface currentUser={currentUser} soundEnabled={soundEnabled} allowPriceEdit={allowPriceEdit} />} />
                <Route path="/products" element={<ProductManagement currentUser={currentUser} purchaseMode={purchaseMode} />} />
                <Route path="/reports" element={<ReportsSection currentUser={currentUser} />} />
                <Route path="/invoices" element={<SalesInvoices currentUser={currentUser} />} />
                <Route path="/users" element={<Cashiers />} />
                <Route path="/chicken-legs" element={<ChickenLegs />} />
                <Route path="/debts" element={<DebtsPage />} />
                <Route path="/suppliers" element={<Suppliers currentUser={currentUser} />} />
                <Route path="/archives" element={<ArchivesPage />} />
                <Route path="/ai-chat" element={<AIChatPage currentUser={currentUser} />} />
                <Route path="/activity-log" element={<UserActivityLogPage />} />
                <Route path="/pricing-logs" element={<PricingLogsPage />} />
                <Route path="/invoice-logs" element={<InvoiceChangeLogs />} />
                <Route path="/center-cashbox" element={<CenterCashboxPage currentUser={currentUser} />} />
                <Route path="/settings" element={
                  <SettingsPage 
                    currentUser={currentUser} 
                    isRamadanMode={isRamadanMode} 
                    onToggleRamadan={toggleRamadanMode}
                    themeColor={themeColor}
                    onThemeChange={handleThemeChange}
                    posTheme={posTheme}
                    onPosThemeChange={handlePosThemeChange}
                    compactMode={compactMode}
                    onCompactModeChange={handleCompactModeChange}
                    reduceAnimations={reduceAnimations}
                    onAnimationsChange={handleAnimationsChange}
                    fontSize={fontSize}
                    onFontSizeChange={handleFontSizeChange}
                    soundEnabled={soundEnabled}
                    onSoundEnabledChange={handleSoundEnabledChange}
                    allowPriceEdit={allowPriceEdit}
                    onAllowPriceEditChange={handleAllowPriceEditChange}
                    purchaseMode={purchaseMode}
                    onPurchaseModeChange={handlePurchaseModeChange}
                    updateStatus={updateStatus}
                  />
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <Toaster />
            </main>
          </div>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
