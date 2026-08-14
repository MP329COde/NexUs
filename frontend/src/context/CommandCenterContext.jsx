import { createContext, useContext, useMemo, useState } from 'react';

const CommandCenterContext = createContext(null);

// État partagé du Command Center (⌘K / ⌘⇧F) : n'importe quelle page peut
// l'ouvrir avec un contexte précis (ex. "ce pod") sans passer par des props
// qui traverseraient toute l'arborescence jusqu'à Shell.jsx.
export function CommandCenterProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState(null);

  const value = useMemo(() => ({
    open,
    context,
    openPalette: (ctx = null) => { setContext(ctx); setOpen(true); },
    closePalette: () => { setOpen(false); setContext(null); }
  }), [open, context]);

  return <CommandCenterContext.Provider value={value}>{children}</CommandCenterContext.Provider>;
}

export function useCommandCenter() {
  const ctx = useContext(CommandCenterContext);
  if (!ctx) throw new Error('useCommandCenter doit être utilisé sous CommandCenterProvider');
  return ctx;
}
