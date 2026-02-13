import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, LogIn, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ملاحظة: إذا كان لديك صورة الشعار في مجلد public باسم logo.png، يمكنك استخدامها مباشرة

const Login = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [storeName, setStoreName] = useState("مركز الجمجمة");
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    const loadStoreName = async () => {
      const name = await window.api.getAppSetting('storeName');
      if (name) setStoreName(name);
    };
    loadStoreName();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await window.api.authenticateUser({ username, password });
      if (result.ok) {
        onLogin(result.user);
      } else {
        toast({
          title: "خطأ في تسجيل الدخول",
          description: result.error || "اسم المستخدم أو كلمة المرور غير صحيحة",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "خطأ",
        description: "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100/50 font-sans relative overflow-hidden" dir="rtl">
      {/* خلفية جمالية متحركة */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-blue-100/40 blur-3xl animate-pulse" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-100/40 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <Card className="w-full max-w-md border-0 shadow-2xl bg-white/90 backdrop-blur-md relative z-10 rounded-3xl overflow-hidden ring-1 ring-slate-900/5">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500" />
        
        <CardHeader className="space-y-2 text-center pb-2 pt-10">
          <div className="mx-auto bg-white p-4 rounded-2xl w-24 h-24 flex items-center justify-center mb-4 shadow-lg ring-1 ring-slate-100">
             {/* مكان الشعار: يمكنك استبدال الأيقونة بوسم الصورة أدناه */}
             {!logoError ? (
               <img 
                 src="logo.png" 
                 alt="Logo" 
                 className="w-full h-full object-contain" 
                 onError={() => setLogoError(true)}
               />
             ) : (
               <Store className="w-12 h-12 text-blue-600" />
             )}
          </div>
          <CardTitle className="text-3xl font-bold text-slate-800 tracking-tight">{storeName}</CardTitle>
          <CardDescription className="text-slate-500 text-base">
            نظام إدارة نقاط البيع المتكامل
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 px-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700 font-bold text-sm">اسم المستخدم</Label>
              <div className="relative group">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-focus-within:bg-blue-50 group-focus-within:text-blue-500 transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <Input
                  id="username"
                  type="text"
                  placeholder="أدخل اسم المستخدم"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pr-12 h-12 bg-slate-50 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl transition-all font-medium"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-bold text-sm">كلمة المرور</Label>
              <div className="relative group">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-focus-within:bg-blue-50 group-focus-within:text-blue-500 transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12 h-12 bg-slate-50 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl transition-all font-medium"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all hover:-translate-y-0.5 active:translate-y-0 mt-2"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري التحقق...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  تسجيل الدخول
                  <LogIn className="w-5 h-5" />
                </span>
              )}
            </Button>
          </form>
        </CardContent>
        
        <CardFooter className="flex justify-center pb-8 pt-2">
          <p className="text-xs text-slate-400 font-medium">
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;