import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler, tokenStorage } from '../lib/api-client';
import type { AuthUser, LoginResponse, Permission } from '../types/api';

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the stored token is being validated on first paint. */
  isInitialising: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  /**
   * Mirrors the backend permission matrix. UX only — the API enforces the same
   * rules, so hiding a control is convenience, never security.
   */
  can: (...permissions: Permission[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  // The API client calls this whenever a request comes back 401, so an expired
  // token drops the user to the login screen instead of showing broken pages.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStorage.clear();
      setUser(null);
    });
  }, []);

  // Rehydrate the session from the stored token on first load.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStorage.get()) {
        if (!cancelled) setIsInitialising(false);
        return;
      }
      try {
        const { data } = await api.get<{ user: AuthUser }>('/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        tokenStorage.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsInitialising(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<LoginResponse>(
      '/auth/login',
      { email, password },
      { skipAuthRedirect: true },
    );
    tokenStorage.set(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const can = useCallback(
    (...permissions: Permission[]) => {
      if (!user) return false;
      return permissions.every((permission) => user.permissions.includes(permission));
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitialising,
      isAuthenticated: Boolean(user),
      login,
      logout,
      can,
    }),
    [user, isInitialising, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
