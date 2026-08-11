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

/**
 * Token storage backing "Remember me".
 *
 * `remember: true` writes to `localStorage`, which survives closing the
 * browser. `remember: false` writes to `sessionStorage`, which the browser
 * clears when the tab closes — a genuine difference in behaviour, not a
 * decorative checkbox. `get`/`clear` touch both stores so a session started
 * either way is found and fully torn down on logout.
 */
export const tokenStorage = {
  get(): string | null {
    try {
      return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string, remember = true): void {
    try {
      if (remember) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      /* storage unavailable (private mode) — the session simply won't persist */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
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

/**
 * Download a binary endpoint (currently the challan PDF) and hand it to the
 * browser as a file.
 *
 * A plain anchor href cannot be used because the endpoint requires the
 * `Authorization` header, so the response is fetched, turned into an object URL
 * and clicked programmatically. On failure the JSON error envelope is parsed so
 * the caller still gets a normal `ApiError`.
 */
async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const token = tokenStorage.get();

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Please try again.');
  }

  if (!response.ok) {
    if (response.status === 401) onUnauthorized();
    let code = 'UNKNOWN_ERROR';
    let message = `Download failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: { code?: string; message?: string } };
      code = payload.error?.code ?? code;
      message = payload.error?.message ?? message;
    } catch {
      /* the error body was not JSON — keep the generic message */
    }
    throw new ApiError(response.status, code, message);
  }

  // Prefer the server-provided filename from Content-Disposition.
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/**
 * PUT a file straight to object storage using a presigned URL.
 *
 * Deliberately bypasses the normal client: the request goes to S3, not the API,
 * so it must carry no Authorization header, and the Content-Type must match the
 * one that was signed or storage rejects the upload.
 */
async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: 'PUT', headers, body: file });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the storage service.');
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      'UPLOAD_FAILED',
      `The file could not be uploaded to storage (status ${response.status}).`,
    );
  }
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'GET', params, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  download: downloadFile,
  uploadToPresignedUrl,
};

export { API_BASE_URL };
