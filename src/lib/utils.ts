import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | string | undefined | null) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return String(value ?? "0");
  const whole = Math.trunc(n);
  return whole.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
