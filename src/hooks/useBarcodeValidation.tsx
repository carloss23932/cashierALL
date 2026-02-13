import React, { useCallback, useRef, useState } from "react";
import ConfirmBarcodeConflict from "@/components/ui/ConfirmBarcodeConflict";

type Product = {
	id?: number;
	_id?: string;
	name?: string;
	barcode?: string;
	[key: string]: any;
};

type ValidationResult =
	| { status: "ok" }
	| { status: "delete" | "edit" | "abort"; product: Product };

export function useBarcodeValidation() {
	const [conflictProduct, setConflictProduct] = useState<Product | null>(null);
	const resolverRef = useRef<((choice: ValidationResult) => void) | null>(null);
	const conflictProductRef = useRef<Product | null>(null);

	const validate = useCallback(
		async (barcode: string, fetchByBarcode: (b: string) => Promise<Product | null>): Promise<ValidationResult> => {
			if (!barcode) return { status: "ok" };
			const existing = await fetchByBarcode(barcode);
			if (!existing) return { status: "ok" };

			return await new Promise<ValidationResult>((resolve) => {
				conflictProductRef.current = existing;
				resolverRef.current = resolve;
				setConflictProduct(existing);
			});
		},
		[]
	);

	const handleChoice = useCallback((choice: "delete" | "edit" | "abort") => {
		if (resolverRef.current && conflictProductRef.current) {
			resolverRef.current({ status: choice, product: conflictProductRef.current });
			resolverRef.current = null;
		}
		conflictProductRef.current = null;
		setConflictProduct(null);
	}, []);

	const ConflictDialog = (
		<ConfirmBarcodeConflict open={!!conflictProduct} product={conflictProduct} onChoose={handleChoice} />
	);

	return { validate, ConflictDialog };
}

export default useBarcodeValidation;
