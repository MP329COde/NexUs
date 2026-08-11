import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../lib/apiClient.js';

// Vérifie une fois par navigation si la console a déjà un administrateur.
// Sinon, verrouille toute la console sur /setup ; une fois configurée, /setup
// redirige vers /login pour empêcher de recréer un compte admin par la suite.
export default function SetupGate() {
  const location = useLocation();
  const [needsSetup, setNeedsSetup] = useState(null);

  useEffect(() => {
    api.get('/setup/status').then((data) => setNeedsSetup(data.needsSetup)).catch(() => setNeedsSetup(false));
  }, []);

  if (needsSetup === null) return null;
  if (needsSetup && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (!needsSetup && location.pathname === '/setup') return <Navigate to="/login" replace />;
  return <Outlet />;
}
