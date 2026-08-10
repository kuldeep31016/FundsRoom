import type { PaginationMeta } from '../types/api';

const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api/v1'
).replace(/\/+$/, '');

const TOKEN_STORAGE_KEY = 'erp_crm_token';

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * Normalised representation of every failed request, so UI code can branch on
 * `status`/`code` instead of parsing messages.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldIssue[];
  readonly meta?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: FieldIssue[] = [],
    meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.meta = meta;
  }

  /** Field name -> message, for inline form validation feedback. */
  get fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const issue of this.details) {
      // Turn "items.0.quantity" into "items" so nested issues still surface.
      const key = issue.field.split('.')[0] ?? issue.field;
      if (!map[key]) map[key] = issue.message;
    }
    return map;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export const tokenStorage = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* storage unavailable (private mode) — the session simply won't persist */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* no-op */
    }
  },
};

/** Called when the API reports the session is no longer valid. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => undefined;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: QueryParams;
  signal?: AbortSignal;
  /** Skip the automatic logout on 401 (used by the login call itself). */
  skipAuthRedirect?: boolean;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: PaginationMeta }> {
  const { method = 'GET', body, params, signal, skipAuthRedirect } = options;
  const token = tokenStorage.get();

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Unable to reach the server. Check your connection and that the API is running.',
    );
  }

  // 204/205 carry no body.
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = (payload as { error?: { code?: string; message?: string; details?: FieldIssue[]; meta?: Record<string, unknown> } } | null)?.error;

    if (response.status === 401 && !skipAuthRedirect) {
      onUnauthorized();
    }

    throw new ApiError(
      response.status,
      errorBody?.code ?? 'UNKNOWN_ERROR',
      errorBody?.message ?? `Request failed with status ${response.status}.`,
      errorBody?.details ?? [],
      errorBody?.meta,
    );
  }

  const successBody = payload as { data: T; meta?: PaginationMeta } | null;
  return { data: (successBody?.data ?? null) as T, meta: successBody?.meta };
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'GET', params, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
};

export { API_BASE_URL };
