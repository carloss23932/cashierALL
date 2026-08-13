export const POS_PENDING_EDIT_SALE_KEY = "pos_pending_edit_sale";

export interface PendingSaleEditItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  barcode?: string | null;
}

export interface PendingSaleEditPayload {
  saleId: number;
  discount: number;
  paymentMethod: string;
  clientId: number | null;
  clientName: string;
  amountReceived?: number;
  items: PendingSaleEditItem[];
}
