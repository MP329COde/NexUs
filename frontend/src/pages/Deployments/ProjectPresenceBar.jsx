import { useEffect } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

// Présence temps quasi-réel (todo.md item 3) : ping toutes les 20s pendant
// que la fiche projet est ouverte, lecture toutes les 15s — "présent" =
// vu dans la dernière minute côté serveur (projectPresenceService.js).
// Pas de WebSocket (aucune infrastructure de ce type ici) : polling,
// cohérent avec le reste de l'app.
export default function ProjectPresenceBar({ projectId, userName }) {
  const { user } = useAuth();
  const presence = useApi(() => api.get(`/projects/${projectId}/presence`), [projectId], { pollMs: 15000 });

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      if (cancelled) return;
      try { await api.post(`/projects/${projectId}/presence`); } catch { /* best-effort */ }
    }
    ping();
    const interval = setInterval(ping, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectId]);

  const others = (presence.data?.items || []).filter((p) => p.user_id !== user?.id);
  if (others.length === 0) return null;

  return (
    <div className="pd-row" style={{ marginBottom: 12 }}>
      <span className="faint">Actuellement sur cette fiche :</span>
      {others.map((p) => (
        <span key={p.user_id} className="badge badge-ok"><span className="dot" />{userName(p.user_id)}</span>
      ))}
    </div>
  );
}
