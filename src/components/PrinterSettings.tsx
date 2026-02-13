import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ReceiptPreview from "./ReceiptPreview";

const AVAILABLE_ENCODINGS = ["windows-1256", "cp720", "cp864", "utf8"];

const PrinterSettings: React.FC = () => {
  const { toast } = useToast();
  const [encoding, setEncoding] = useState<string>("windows-1256");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const val = await window.api.getAppSetting("printerEncoding");
        if (val) setEncoding(val);
      } catch (e) {
        console.warn("Could not read printerEncoding", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    try {
      await window.api.setAppSetting({ key: "printerEncoding", value: encoding });
      toast({ title: "تم حفظ إعداد الطابعة" });
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e?.message || String(e), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات الطابعة</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">ترميز الطابعة</Label>
            <div className="flex gap-2 items-center mt-2">
              <select value={encoding} onChange={(e) => setEncoding(e.target.value)} className="border rounded p-2">
                {AVAILABLE_ENCODINGS.map((enc) => (
                  <option key={enc} value={enc}>
                    {enc}
                  </option>
                ))}
              </select>
              <Button onClick={save} disabled={loading}>حفظ</Button>
            </div>
          </div>
          <div className="text-sm text-gray-500">اختَر الترميز الذي يعرض الإيصالات العربية بشكل صحيح.</div>
        </div>
      </CardContent>
      <CardContent>
        <div className="mt-4">
          <h3 className="font-semibold mb-2">معاينة الإيصالات</h3>
          <div className="text-sm text-gray-600 mb-2">ارفع ملف إيصال خام (raw) لرؤية النص المفكوك باستخدام الترميز المختار.</div>
          {/* Lazy-load ReceiptPreview to keep file small */}
          <ReceiptPreview />
        </div>
      </CardContent>
    </Card>
  );
};

export default PrinterSettings;
