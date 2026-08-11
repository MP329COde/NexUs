import { useCallback, useEffect, useState } from 'react';

// Charge une ressource API et expose { data, error, loading, reload }.
// pollMs > 0 relance automatiquement l'appel (utilisé pour le dashboard temps réel).
export function useApi(fetcher, deps = [], { pollMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
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
