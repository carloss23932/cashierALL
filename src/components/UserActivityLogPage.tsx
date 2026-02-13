import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, LogIn, LogOut } from "lucide-react";

const UserActivityLogPage = () => {
  const [dailyWageEnabled, setDailyWageEnabled] = useState(true);
  const [hourlyRate, setHourlyRate] = useState(1.875);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const resolveHourlyRate = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1.875;
  };

  const resolveDailyWageEnabled = (value: any) => {
    if (value === null || value === undefined) return true;
    return !(value === false || value === "false");
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

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["user-activity-logs", { dateFrom, dateTo }],
    queryFn: () => window.api.listUserActivityLogs({ dateFrom, dateTo }),
  });

  const getActionBadge = (action: string) => {
    if (action === "login") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
          <LogIn className="w-3 h-3 ml-1" />
          تسجيل دخول
        </Badge>
      );
    }
    if (action === "logout") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
          <LogOut className="w-3 h-3 ml-1" />
          تسجيل خروج
        </Badge>
      );
    }
    return <Badge variant="outline">{action}</Badge>;
  };

  const toDateKey = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const endOfDay = (value: Date) => {
    const end = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
    return end;
  };

  const startOfDay = (value: Date) => {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
  };

  const formatHours = (hours: number) => {
    return Number(hours || 0).toFixed(2);
  };

  const formatWage = (amount: number) => {
    return new Intl.NumberFormat("ar-IQ", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(amount || 0);
  };

  const dailyStats = useMemo(() => {
    if (!dailyWageEnabled || !logs || logs.length === 0) return new Map<string, { hours: number; wage: number }>();

    const rangeStart = dateFrom ? startOfDay(new Date(dateFrom)) : null;
    const rangeEnd = dateTo ? endOfDay(new Date(dateTo)) : new Date();
    const byUser = new Map<string, any[]>();

    logs.forEach((log: any) => {
      const userId = String(log.user?.id ?? log.userId ?? "");
      if (!userId) return;
      const list = byUser.get(userId) || [];
      list.push(log);
      byUser.set(userId, list);
    });

    const stats = new Map<string, { hours: number; wage: number }>();

    const addInterval = (userId: string, start: Date, end: Date) => {
      let current = new Date(start.getTime());
      while (current < end) {
        const dayEnd = endOfDay(current);
        const segmentEnd = end < dayEnd ? end : dayEnd;
        const hours = (segmentEnd.getTime() - current.getTime()) / 3600000;
        if (hours > 0) {
          const key = `${userId}-${toDateKey(current)}`;
          const prev = stats.get(key) || { hours: 0, wage: 0 };
          const nextHours = prev.hours + hours;
          stats.set(key, { hours: nextHours, wage: nextHours * hourlyRate });
        }
        current = new Date(segmentEnd.getTime() + 1);
      }
    };

    byUser.forEach((items, userId) => {
      const ordered = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      let lastLogin: Date | null = null;
      ordered.forEach((log: any) => {
        const ts = new Date(log.createdAt);
        if (log.action === "login") {
          if (lastLogin) {
            const start = rangeStart && lastLogin < rangeStart ? rangeStart : lastLogin;
            const end = ts > rangeEnd ? rangeEnd : ts;
            if (end > start) addInterval(userId, start, end);
          }
          lastLogin = ts;
          return;
        }
        if (log.action === "logout") {
          if (!lastLogin) return;
          const start = rangeStart && lastLogin < rangeStart ? rangeStart : lastLogin;
          const end = ts > rangeEnd ? rangeEnd : ts;
          if (end > start) addInterval(userId, start, end);
          lastLogin = null;
        }
      });

      if (lastLogin) {
        const start = rangeStart && lastLogin < rangeStart ? rangeStart : lastLogin;
        const end = rangeEnd;
        if (end > start) addInterval(userId, start, end);
      }
    });

    return stats;
  }, [logs, dateFrom, dateTo, dailyWageEnabled, hourlyRate]);

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-2xl font-bold text-blue-800">سجل نشاط المستخدمين</h2>

      <Card className="bg-white/60 backdrop-blur-sm border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <History className="w-6 h-6" />
            فلترة السجلات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="invisible">مسح</Label>
              <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); }} className="w-full">
                مسح الفلتر
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-blue-100">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">...يتم التحميل</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>لا توجد سجلات نشاط مطابقة للفلتر.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right">الإجراء</TableHead>
                  <TableHead className="text-right">التاريخ والوقت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.user?.name || log.user?.username || `مستخدم #${log.userId}`}
                    </TableCell>
                    <TableCell>
                      {getActionBadge(log.action)}
                      {dailyWageEnabled && log.action === "login" && (() => {
                        const userId = String(log.user?.id ?? log.userId ?? "");
                        const key = `${userId}-${toDateKey(new Date(log.createdAt))}`;
                        const stat = dailyStats.get(key);
                        if (!stat) return null;
                        return (
                          <div className="text-xs text-green-700 mt-1">
                            يومية اليوم: {formatWage(stat.wage)} د.ع · ساعات العمل: {formatHours(stat.hours)}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {new Date(log.createdAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserActivityLogPage;
