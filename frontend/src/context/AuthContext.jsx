import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { hasPermission } from '../lib/permissions.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [homeRestrictedToAdmins, setHomeRestrictedToAdmins] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      setHomeRestrictedToAdmins(Boolean(data.homeRestrictedToAdmins));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Peut renvoyer soit { user }, soit { mfaRequired: true, mfaToken } si le
  // compte a activé le MFA (voir routes/auth.routes.js) — dans ce second cas,
  // aucune session n'est encore établie et l'appelant (LoginPage.jsx) doit
  // poursuivre avec POST /auth/mfa/verify avant que `user` ne soit renseigné.
  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    if (data.user) setUser(data.user);
    return data;
  }, []);

  const setUserFromSession = useCallback((u) => setUser(u), []);

  const logout = useCallback(async () => {
    // La session côté serveur peut déjà être invalide (cookie expiré, révoquée
    // ailleurs) — /auth/logout répond alors 401. On déconnecte quand même
    // localement dans tous les cas.
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const data = await api.put('/auth/profile', patch);
    setUser(data.user);
    return data.user;
  }, []);

  const completeOnboarding = useCallback(async (patch) => {
    const data = await api.put('/auth/onboarding/complete', patch);
    setUser(data.user);
    return data.user;
  }, []);

  const checkPermission = useCallback((domain, minLevel) => hasPermission(user, domain, minLevel), [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateProfile, completeOnboarding, refresh, setUserFromSession, homeRestrictedToAdmins, hasPermission: checkPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
