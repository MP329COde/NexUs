import { createContext, useContext, useMemo, useState } from 'react';
import { DOMAINS } from '../config/domains.js';
import { useAuth } from './AuthContext.jsx';

const PREFS_KEY = 'nexus-nav-prefs';

// Préférences de navigation 100% côté client (localStorage, par navigateur —
// même convention que nexus-nav-collapsed) : quels éléments sont masqués,
// lesquels sont déplacés dans l'en-tête plutôt que la barre latérale, leur
// ordre, et les liens personnalisés ajoutés par l'utilisateur. Rien de
// serveur ici : c'est une préférence d'affichage, pas une donnée métier.
//
// Contexte (plutôt qu'un hook indépendant appelé séparément par DomainNav et
// Header) : les deux ont besoin de lire EXACTEMENT le même état — un hook
// dupliqué sans état partagé désynchronise silencieusement l'un des deux
// tant que la page n'est pas rechargée (trouvé en testant réellement le
// déplacement d'un élément vers l'en-tête : DomainNav le retirait bien,
// Header ne le recevait jamais).
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      header: Array.isArray(parsed.header) ? parsed.header : [],
      custom: Array.isArray(parsed.custom) ? parsed.custom : []
    };
  } catch {
    return { order: [], hidden: [], header: [], custom: [] };
  }
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

const NavPrefsContext = createContext(null);

export function NavPrefsProvider({ children }) {
  const { user, homeRestrictedToAdmins, hasPermission } = useAuth();
  const [prefs, setPrefs] = useState(loadPrefs);

  const SETTINGS_DOMAINS = ['settings', 'identity', 'users', 'inventory'];
  const builtins = DOMAINS.filter((d) => {
    if (d.id === 'home' && homeRestrictedToAdmins) return user?.role === 'admin';
    if (d.id === 'adm') return user?.role === 'admin' || SETTINGS_DOMAINS.some((domain) => hasPermission(domain, 'read'));
    return !d.adminOnly || user?.role === 'admin';
  });

  const allItems = useMemo(() => {
    const custom = (prefs.custom || []).map((c) => ({ ...c, isCustom: true }));
    return [...builtins, ...custom];
  }, [builtins, prefs.custom]);

  const orderedIds = useMemo(() => {
    const known = allItems.map((i) => i.id);
    const ordered = (prefs.order || []).filter((id) => known.includes(id));
    const missing = known.filter((id) => !ordered.includes(id));
    return [...ordered, ...missing];
  }, [allItems, prefs.order]);

  const ordered = orderedIds.map((id) => allItems.find((i) => i.id === id)).filter(Boolean);

  const hiddenSet = new Set(prefs.hidden || []);
  const headerSet = new Set(prefs.header || []);

  const sidebarItems = ordered.filter((i) => !hiddenSet.has(i.id) && !headerSet.has(i.id));
  const headerItems = ordered.filter((i) => !hiddenSet.has(i.id) && headerSet.has(i.id));

  function update(next) {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      savePrefs(merged);
      return merged;
    });
  }

  function toggleHidden(id) {
    const hidden = new Set(prefs.hidden || []);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    update({ hidden: [...hidden] });
  }

  function toggleLocation(id) {
    const header = new Set(prefs.header || []);
    if (header.has(id)) header.delete(id); else header.add(id);
    update({ header: [...header] });
  }

  function move(id, dir) {
    const ids = orderedIds.slice();
    const idx = ids.indexOf(id);
    const swapWith = idx + dir;
    if (idx === -1 || swapWith < 0 || swapWith >= ids.length) return;
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    update({ order: ids });
  }

  function addCustom(item) {
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    update({ custom: [...(prefs.custom || []), { ...item, id }] });
  }

  function removeCustom(id) {
    update({
      custom: (prefs.custom || []).filter((c) => c.id !== id),
      order: (prefs.order || []).filter((x) => x !== id),
      hidden: (prefs.hidden || []).filter((x) => x !== id),
      header: (prefs.header || []).filter((x) => x !== id)
    });
  }

  function resetAll() {
    const empty = { order: [], hidden: [], header: [], custom: [] };
    setPrefs(empty);
    savePrefs(empty);
  }

  const value = { ordered, sidebarItems, headerItems, hiddenSet, headerSet, toggleHidden, toggleLocation, move, addCustom, removeCustom, resetAll };
  return <NavPrefsContext.Provider value={value}>{children}</NavPrefsContext.Provider>;
}

export function useNavItems() {
  const ctx = useContext(NavPrefsContext);
  if (!ctx) throw new Error('useNavItems doit être utilisé sous NavPrefsProvider');
  return ctx;
}
