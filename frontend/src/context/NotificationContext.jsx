import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import ToastStack from '../components/ui/ToastStack.jsx';
import { setGlobalErrorHandler } from '../lib/apiClient.js';

const NotificationContext = createContext(null);
let idSeq = 0;

// notify(message, { type: 'ok'|'warn'|'crit'|'info', title }) affiche un toast
// (auto-disparition) ET conserve l'entrée dans l'historique consulté depuis la
// cloche du header — remplace les alert() bloquants utilisés initialement.
export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, opts = {}) => {
    const entry = { id: ++idSeq, type: opts.type || 'info', title: opts.title, message, time: new Date().toISOString() };
    setToasts((cur) => [...cur, entry]);
    setHistory((cur) => [entry, ...cur].slice(0, 50));
    setTimeout(() => dismiss(entry.id), opts.durationMs ?? 6000);
    return entry.id;
  }, [dismiss]);

  const clearHistory = useCallback(() => setHistory([]), []);

  // Toute erreur API réseau/serveur (pas les 4xx attendus, cf. apiClient.js)
  // remonte automatiquement en toast, sur toutes les pages, sans que chacune
  // ait à appeler notify() explicitement.
  useEffect(() => {
    setGlobalErrorHandler((message) => notify(message, { type: 'crit', title: 'Erreur' }));
    return () => setGlobalErrorHandler(null);
  }, [notify]);

  return (
    <NotificationContext.Provider value={{ notify, history, clearHistory }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications doit être utilisé dans <NotificationProvider>');
  return ctx;
}

export function useNotify() {
  return useNotifications().notify;
}
