import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, BarChart3, FileText, Wallet, Receipt, Package, Plus, ShoppingCart, Shield, Upload, History } from "lucide-react";
import SalesInterface from "@/components/SalesInterface";
import ProductManagement from "@/components/ProductManagement";
import ReportsSection from "@/components/ReportsSection";
import SalesInvoices from "@/components/SalesInvoices";
import Cashiers from "@/components/Cashiers";
import Login from "@/components/Login";
import DebtsPage from "./debts";
import DailyNotes from "@/components/DailyNotes";
import ChickenLegs from "@/components/ChickenLegs";
import InvoiceChangeLogs from "@/components/InvoiceChangeLogs";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [activeTab, setActiveTab] = useState("sales");
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const { toast } = useToast();

  const isAdmin = useMemo(() => currentUser?.role === "admin", [currentUser]);

  const handleLogin = (user: any) => {
    setCurrentUser(user);
    try {
      localStorage.setItem("currentUser", JSON.stringify(user));
    } catch {
      /* ignore */
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem("currentUser");
    } catch {
      /* ignore */
    }
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50" dir="rtl">
      {/* Header مصغّر */}
      <div className="bg-white/85 backdrop-blur-sm border-b border-blue-100 sticky top-0 z-50 text-sm">
        <div className="container mx-auto px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent leading-tight">
                  نظام المبيعات والمخزون
                </h1>
                <p className="text-[11px] text-gray-600">إدارة كاملة للمبيعات والمخزون</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 text-[11px] py-0.5">
                  متصل
                </Badge>
                <Badge variant="outline" className="text-blue-600 border-blue-200 text-[11px] py-0.5">
                  مركز الخدمة الشاملة
                </Badge>
              </div>
            <div className="flex items-center gap-2 text-xs">
              <DailyNotes />
              {isAdmin && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={() => setBackupMenuOpen((v) => !v)}
                    onBlur={() => setTimeout(() => setBackupMenuOpen(false), 150)}
                  >
                    <Shield className="w-4 h-4" />
                    النسخ الاحتياطية
                  </Button>
                  {backupMenuOpen && (
                    <div className="absolute left-0 mt-2 w-60 bg-white border border-gray-200 shadow-lg rounded-md z-50 text-right text-sm">
                      <button
                        className="w-full px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={async () => {
                          setBackupMenuOpen(false);
                          try {
                            const res = await window.api.backupRestore({ actorRole: currentUser?.role });
                            if (res?.ok) toast({ title: "تم الاسترجاع", description: "تم استرجاع النسخة الاحتياطية." });
                          } catch (err: any) {
                            toast({ title: "خطأ", description: err?.message || "تعذر الاسترجاع.", variant: "destructive" });
                          }
                        }}
                      >
                        <Upload className="w-4 h-4" /> استرجاع نسخة
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="text-gray-700">مرحباً، {currentUser.name || currentUser.username}</div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                تسجيل خروج
              </Button>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-3 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-8 bg-white/60 backdrop-blur-sm border border-blue-100 h-12 text-sm" dir="rtl">
            <TabsTrigger
              value="invoice-logs"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <History className="w-4 h-4" />
              <span className="text-[11px]">سجل التعديلات</span>
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="text-[11px]">التقارير</span>
            </TabsTrigger>
            <TabsTrigger
              value="chicken-legs"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <FileText className="w-4 h-4" />
              <span className="text-[11px]">دجاج الأرجل</span>
            </TabsTrigger>
            <TabsTrigger
              value="debts"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <Wallet className="w-4 h-4" />
              <span className="text-[11px]">الديون</span>
            </TabsTrigger>
            <TabsTrigger
              value="sales-invoices"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <Receipt className="w-4 h-4" />
              <span className="text-[11px]">فواتير المبيعات</span>
            </TabsTrigger>
            <TabsTrigger
              value="products"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <Package className="w-4 h-4" />
              <span className="text-[11px]">المنتجات</span>
            </TabsTrigger>
            <TabsTrigger
              value="cashiers"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[11px]">الكاشيرات</span>
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="flex-col gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="text-[11px]">نقطة البيع</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="m-0">
            <SalesInterface currentUser={currentUser} />
          </TabsContent>
          <TabsContent value="invoice-logs" className="m-0">
            <InvoiceChangeLogs />
          </TabsContent>
          <TabsContent value="products" className="m-0">
            <ProductManagement />
          </TabsContent>
          <TabsContent value="cashiers" className="m-0">
            <Cashiers />
          </TabsContent>
          <TabsContent value="sales-invoices" className="m-0">
            <SalesInvoices />
          </TabsContent>
          <TabsContent value="chicken-legs" className="m-0">
            <ChickenLegs />
          </TabsContent>
          <TabsContent value="debts" className="m-0">
            <DebtsPage />
          </TabsContent>
          <TabsContent value="reports" className="m-0">
            <ReportsSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
