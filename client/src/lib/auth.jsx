import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, SUPPORT_KEY } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [impersonatedBy, setImpersonatedBy] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    const support = Boolean(sessionStorage.getItem(SUPPORT_KEY));
    api
      .get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        setTenant(r.data.tenant || null);
        setImpersonatedBy(r.data.impersonatedBy || null);
      })
      .catch(() => (support ? sessionStorage.removeItem(SUPPORT_KEY) : localStorage.removeItem('eb_token')))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    localStorage.setItem('eb_token', r.data.token);
    setUser(r.data.user);
    setTenant(r.data.tenant || null);
    return r.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('eb_token');
    sessionStorage.removeItem(SUPPORT_KEY);
    setUser(null);
    setTenant(null);
    setImpersonatedBy(null);
  }, []);

  const value = useMemo(() => ({ user, tenant, impersonatedBy, loading, login, logout }), [user, tenant, impersonatedBy, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
