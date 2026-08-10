import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type QueryParams } from '../lib/api-client';
import type { PaginationMeta } from '../types/api';

interface ResourceState<T> {
  data: T | null;
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: ApiError | null;
}

/**
 * Fetch a single resource or a list, exposing the loading / error / empty
 * states the UI needs. In-flight requests are aborted when the inputs change so
 * a slow response can never overwrite a newer one.
 */
export function useApiResource<T>(
  path: string | null,
  params?: QueryParams,
): ResourceState<T> & { refetch: () => void } {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    meta: null,
    isLoading: Boolean(path),
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  // Serialising the params gives a stable dependency without re-fetching on
  // every render just because the caller passed a fresh object literal.
  const paramsKey = params ? JSON.stringify(params) : '';
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!path) {
      setState({ data: null, meta: null, isLoading: false, error: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({ ...current, isLoading: true, error: null }));

    api
      .get<T>(path, paramsKey ? (JSON.parse(paramsKey) as QueryParams) : undefined, controller.signal)
      .then(({ data, meta }) => {
        if (controller.signal.aborted) return;
        setState({ data, meta: meta ?? null, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          data: null,
          meta: null,
          isLoading: false,
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, 'UNKNOWN_ERROR', 'Something went wrong loading this page.'),
        });
      });

    return () => controller.abort();
  }, [path, paramsKey, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, refetch };
}

/** Debounce a rapidly-changing value (used for search-as-you-type). */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
