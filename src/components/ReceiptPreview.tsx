import React, { useState } from "react";

const AVAILABLE_ENCODINGS = ["windows-1256", "cp720", "cp864", "utf8"];

export default function ReceiptPreview() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [hex, setHex] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<string>("windows-1256");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File) => {
    setError(null);
    setLoading(true);
    setText(null);
    setHex(null);
    setFileName(file.name);
    try {
      const ab = await file.arrayBuffer();
      const u8 = new Uint8Array(ab);
      // hex preview
      const hx = Array.from(u8).slice(0, 512).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      setHex(hx);
      // base64 (browser-safe)
      let binary = "";
      for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
      const b64 = window.btoa(binary);
      const res: any = await window.api.decodeReceipt({ dataBase64: b64, encoding });
      if (res?.ok) {
        setText(res.text);
      } else {
        setError(res?.error || "فشل فك الترميز");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept="*/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
          }}
        />
        <select value={encoding} onChange={(e) => setEncoding(e.target.value)} className="border rounded p-1">
          {AVAILABLE_ENCODINGS.map((enc) => (
            <option key={enc} value={enc}>
              {enc}
            </option>
          ))}
        </select>
        <button
          className="px-3 py-1 bg-blue-600 text-white rounded"
          onClick={async () => {
            setError(null);
            setLoading(true);
            try {
              const val = await window.api.getAppSetting("printerEncoding");
              if (val) setEncoding(val);
            } catch (e) {
              setError("تعذر جلب الإعداد");
            } finally {
              setLoading(false);
            }
          }}
        >
          جلب من الإعدادات
        </button>
      </div>

      {fileName && <div className="mt-2 text-sm text-gray-600">ملف: {fileName}</div>}
      {loading && <div className="mt-2 text-sm">جاري فك الترميز...</div>}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      {hex && (
        <div className="mt-2">
          <div className="text-xs text-gray-500">معاينة البايت (HEX)</div>
          <pre className="text-xs p-2 bg-gray-100 rounded overflow-auto" style={{ maxHeight: 120 }}>{hex}</pre>
        </div>
      )}
      {text && (
        <div className="mt-2">
          <div className="text-xs text-gray-500">النص المفكوك</div>
          <pre className="p-2 bg-white border rounded whitespace-pre-wrap break-words" style={{ maxHeight: 300, overflow: 'auto' }}>{text}</pre>
        </div>
      )}
    </div>
  );
}
