import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3,
  BadgeCheck,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";

const appLogo = "/favicon.ico";

const Login = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState("CRO P");
  const [logoError, setLogoError] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadStoreName = async () => {
      if (!window.api?.getAppSetting) return;
      const name = await window.api.getAppSetting("storeName");
      if (name) setStoreName(name);
    };

    loadStoreName();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!window.api?.authenticateUser) {
        toast({
          title: "تطبيق سطح المكتب غير متصل",
          description: "شغل التطبيق عبر Electron لتسجيل الدخول الفعلي.",
          variant: "destructive",
        });
        return;
      }

      const result = await window.api.authenticateUser({ username, password });
      if (result.ok) {
        onLogin(result.user);
      } else {
        toast({
          title: "خطأ في تسجيل الدخول",
          description:
            result.error || "اسم المستخدم أو كلمة المرور غير صحيحة",
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

  const year = new Date().getFullYear();

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#eef3ef] text-[#161816]"
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(14,75,61,0.10),transparent_42%),linear-gradient(240deg,rgba(143,31,43,0.12),transparent_38%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(22,24,22,0.045)_1px,transparent_1px),linear-gradient(0deg,rgba(22,24,22,0.045)_1px,transparent_1px)] bg-[size:36px_36px]" />
      <div className="absolute right-0 top-0 h-full w-[36%] bg-[#0b3b31] max-lg:hidden" />

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-8 px-5 py-8 lg:grid-cols-[1fr_0.82fr] lg:px-10">
        <div className="order-2 hidden lg:block">
          <div className="relative overflow-hidden rounded-lg bg-[#0f4a3d] p-8 text-white shadow-[0_34px_90px_rgba(8,39,33,0.35)]">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(244,196,87,0.30),transparent_24%),linear-gradient(315deg,rgba(255,255,255,0.14),transparent_32%)]" />
            <div className="absolute left-8 top-8 h-24 w-24 rounded-lg border border-white/15" />
            <div className="absolute bottom-8 right-8 h-32 w-32 rounded-lg border border-[#f4c457]/30" />

            <div className="relative flex min-h-[680px] flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white p-2 shadow-xl">
                    {!logoError ? (
                      <img
                        src={appLogo}
                        alt={storeName}
                        className="h-full w-full object-contain"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <Store className="h-7 w-7 text-[#0f4a3d]" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/65">
                      CRO POS
                    </p>
                    <h1 className="text-2xl font-black tracking-normal">
                      {storeName}
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white">
                  <ShieldCheck className="h-4 w-4 text-[#f4c457]" />
                  بوابة آمنة
                </div>
              </div>

              <div className="py-10">
                <p className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#f4c457] px-4 py-2 text-sm font-black text-[#17211d]">
                  <BadgeCheck className="h-4 w-4" />
                  لوحة بيع فاخرة وسريعة
                </p>
                <h2 className="max-w-2xl text-6xl font-black leading-tight tracking-normal">
                  دخول أنيق لنظام يليق بإدارة مركزك.
                </h2>
              </div>

              <div className="rounded-md border border-white/12 bg-white/10 p-5 text-sm font-bold leading-7 text-white/75 backdrop-blur">
                نظام مخصص لإدارة البيع، الفواتير، المخزون، التقارير، وحركة
                المستخدمين من شاشة واحدة.
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 flex justify-center lg:justify-start">
          <div className="w-full max-w-[460px]">
            <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white p-2 shadow-lg">
                {!logoError ? (
                  <img
                    src={appLogo}
                    alt={storeName}
                    className="h-full w-full object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <Store className="h-7 w-7 text-[#0f4a3d]" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-[#0f4a3d]">
                  نظام نقاط البيع
                </p>
                <h1 className="text-xl font-black">{storeName}</h1>
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-7 shadow-[0_28px_80px_rgba(17,24,39,0.18)] sm:p-9">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-3 inline-flex items-center gap-2 rounded-md bg-[#eef8f4] px-3 py-2 text-sm font-black text-[#0f4a3d] ring-1 ring-[#cbe7dd]">
                    <BarChart3 className="h-4 w-4" />
                    دخول الموظفين
                  </p>
                  <h2 className="text-4xl font-black tracking-normal">
                    تسجيل الدخول
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    أدخل بياناتك للوصول إلى البيع، الفواتير، المخزون والتقارير.
                  </p>
                </div>
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#8f1f2b] text-white shadow-lg shadow-[#8f1f2b]/25 sm:flex">
                  <LockKeyhole className="h-6 w-6" />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-sm font-black text-zinc-800"
                  >
                    اسم المستخدم
                  </Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      id="username"
                      type="text"
                      autoComplete="username"
                      placeholder="مثال: admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-[54px] rounded-md border-zinc-200 bg-[#f8faf8] pr-12 text-base font-bold shadow-inner shadow-black/[0.03] placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#0f4a3d]/20"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-black text-zinc-800"
                  >
                    كلمة المرور
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="أدخل كلمة المرور"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-[54px] rounded-md border-zinc-200 bg-[#f8faf8] pr-12 text-base font-bold shadow-inner shadow-black/[0.03] placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-[#0f4a3d]/20"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-[54px] w-full rounded-md bg-[#0f4a3d] text-base font-black text-white shadow-xl shadow-[#0f4a3d]/24 transition-all hover:-translate-y-0.5 hover:bg-[#8f1f2b] hover:shadow-[#8f1f2b]/25 active:translate-y-0 disabled:translate-y-0"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جار التحقق...
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      دخول النظام
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-7 flex items-center justify-between border-t border-zinc-100 pt-5 text-xs font-bold text-zinc-400">
                <span>نسخة سطح المكتب</span>
                <span>© {year} جميع الحقوق محفوظة</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;
