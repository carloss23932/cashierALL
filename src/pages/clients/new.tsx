import React, { useState } from "react";
import { useRouter } from "next/router";

export default function NewClientPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [debt, setDebt] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert("الاسم مطلوب");
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), debt: debt === "" ? 0 : Number(debt) }),
      });
      if (res.ok) {
        alert("تمت إضافة العميل بنجاح");
        router.push("/debts");
      } else {
        const err = await res.json();
        alert("خطأ: " + (err?.error || "تعذر إنشاء العميل"));
      }
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء الحفظ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }} dir="rtl">
      <h1 style={{ marginBottom: 12 }}>إضافة عميل جديد</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 400, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>الاسم *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>رقم الهاتف</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>الدين الابتدائي (اختياري)</span>
          <input
            type="number"
            value={debt}
            onChange={(e) => setDebt(e.target.value === "" ? "" : Number(e.target.value))}
            min={0}
            step={0.01}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={loading}>
            {loading ? "جارٍ الحفظ..." : "حفظ العميل"}
          </button>
          <button type="button" onClick={() => router.push("/debts")}>عودة لصفحة الديون</button>
        </div>
      </form>
    </div>
  );
}
