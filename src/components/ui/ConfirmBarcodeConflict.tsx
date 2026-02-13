import React, { useState } from "react";

type Product = {
	id?: number;
	_id?: string;
	name?: string;
	barcode?: string;
};

type Props = {
	open: boolean;
	product: Product | null;
	onChoose: (choice: "delete" | "edit" | "abort") => void;
};

export default function ConfirmBarcodeConflict({ open, product, onChoose }: Props) {
	const [confirmCancel, setConfirmCancel] = useState(false);

	if (!open || !product) return null;

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.4)",
				zIndex: 1000
			}}
		>
			<div style={{ width: 520, maxWidth: "95%", background: "#fff", borderRadius: 8, padding: 20 }} dir="rtl">
				<h3 style={{ margin: 0 }}>تعارض في الباركود</h3>
				<p style={{ marginTop: 8 }}>
					الباركود <strong>{product.barcode}</strong> مرتبط بالمنتج:
					<br />
					<strong>{product.name || "منتج بدون اسم"}</strong>
				</p>

				{!confirmCancel ? (
					<>
						<p>اختر الإجراء المطلوب:</p>
						<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
							<button
								onClick={() => setConfirmCancel(true)}
								style={{ padding: "8px 12px", background: "#d9534f", color: "#fff", border: "none", borderRadius: 4 }}
							>
								حذف المنتج الحالي ومتابعة إضافة الجديد
							</button>
							<button
								onClick={() => onChoose("edit")}
								style={{ padding: "8px 12px", background: "#0275d8", color: "#fff", border: "none", borderRadius: 4 }}
							>
								الانتقال لتعديل المنتج الحالي
							</button>
							<button
								onClick={() => onChoose("abort")}
								style={{ padding: "8px 12px", background: "#6c757d", color: "#fff", border: "none", borderRadius: 4 }}
							>
								إلغاء الإضافة
							</button>
						</div>
					</>
				) : (
					<>
						<p style={{ marginTop: 8, color: "#a94442" }}>
							تنبيه: سيتم حذف المنتج الحالي (<strong>{product.name || "منتج بدون اسم"}</strong>) نهائياً قبل إضافة
							المنتج الجديد. هل أنت متأكد؟
						</p>
						<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
							<button
								onClick={() => onChoose("delete")}
								style={{ padding: "8px 12px", background: "#c9302c", color: "#fff", border: "none", borderRadius: 4 }}
							>
								تأكيد الحذف والاستمرار
							</button>
							<button
								onClick={() => setConfirmCancel(false)}
								style={{ padding: "8px 12px", background: "#f0ad4e", color: "#fff", border: "none", borderRadius: 4 }}
							>
								رجوع
							</button>
							<button
								onClick={() => onChoose("abort")}
								style={{ padding: "8px 12px", background: "#6c757d", color: "#fff", border: "none", borderRadius: 4 }}
							>
								إلغاء الإضافة
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
