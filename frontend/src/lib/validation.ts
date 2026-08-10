/**
 * Small client-side validation helpers.
 *
 * These exist purely for fast, inline UX feedback. The backend re-validates
 * everything with Zod and remains the authority — see README → "Validation".
 */

export type FieldErrors<T> = Partial<Record<keyof T | string, string>>;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MOBILE_PATTERN = /^[0-9]{10,15}$/;
export const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,31}$/;

export function required(value: string | undefined | null, label: string): string | undefined {
  return value && value.trim() ? undefined : `${label} is required`;
}

export function maxLength(value: string | undefined, limit: number, label: string): string | undefined {
  if (!value) return undefined;
  return value.length <= limit ? undefined : `${label} must be at most ${limit} characters`;
}

export function validEmail(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  return EMAIL_PATTERN.test(value.trim()) ? undefined : 'Enter a valid email address';
}

export function validMobile(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return 'Mobile number is required';
  const digits = value.replace(/[\s()+-]/g, '');
  return MOBILE_PATTERN.test(digits) ? undefined : 'Mobile number must contain 10 to 15 digits';
}

export function validGst(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  return GST_PATTERN.test(value.trim().toUpperCase())
    ? undefined
    : 'Enter a valid 15-character GSTIN (e.g. 27AAPFU0939F1ZV)';
}

export function validSku(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return 'SKU is required';
  return SKU_PATTERN.test(value.trim().toUpperCase())
    ? undefined
    : 'Use 2–32 letters, digits, dot, underscore or hyphen';
}

export function nonNegativeNumber(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value.trim() === '') return `${label} is required`;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return `${label} must be a number`;
  if (parsed < 0) return `${label} cannot be negative`;
  return undefined;
}

export function nonNegativeInteger(value: string | undefined, label: string): string | undefined {
  const base = nonNegativeNumber(value, label);
  if (base) return base;
  return Number.isInteger(Number(value)) ? undefined : `${label} must be a whole number`;
}

/** Drop keys whose value is undefined, so callers can test `hasErrors`. */
export function compact<T>(errors: FieldErrors<T>): FieldErrors<T> {
  const result: FieldErrors<T> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (message) result[key as keyof T] = message as string;
  }
  return result;
}

export function hasErrors<T>(errors: FieldErrors<T>): boolean {
  return Object.keys(compact(errors)).length > 0;
}
