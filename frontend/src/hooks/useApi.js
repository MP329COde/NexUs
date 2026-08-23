import { useCallback, useEffect, useState } from 'react';
import { markBackground } from '../lib/apiClient.js';

// Charge une ressource API et expose { data, error, loading, reload }.
// pollMs > 0 relance automatiquement l'appel (utilisé pour le dashboard temps réel).
export function useApi(fetcher, deps = [], { pollMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    // Un rechargement silencieux (déclenché par pollMs, jamais par une
    // action de l'utilisateur) est marqué "arrière-plan" pour le prochain
    // appel api.* déclenché par `fetcher()` juste en dessous — voir
    // lib/apiClient.js#markBackground : le backend ne le compte pas comme
    // activité pour la déconnexion sur inactivité (Lot B3).
    if (silent) markBackground();
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      // status vient d'apiClient.js (attaché aux erreurs HTTP) — permet à
      // l'UI de distinguer "trop de requêtes" (429) d'une session expirée
      // (401) plutôt qu'un message générique.
      setError({ status: err.status, message: err.message });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load(false);
    if (!pollMs) return undefined;
    const id = setInterval(() => load(true), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, pollMs]);

  return { data, error, loading, reload: () => load(false) };
}
