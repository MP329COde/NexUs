import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/apiClient.js';
import { STATIC_SEARCH_ITEMS } from '../../config/searchIndex.js';
import { fuzzyScore, queryTerms } from '../../lib/fuzzyMatch.js';
import Icon from '../ui/Icon.jsx';

export default function CommandPalette({ open, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [dynamicItems, setDynamicItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  // Résultats dynamiques (proxies, hôtes) chargés une seule fois à l'ouverture,
  // en échouant silencieusement si l'intégration n'est pas configurée (409/403).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 10);

    let cancelled = false;
    async function loadDynamic() {
      const items = [];
      try {
        const res = await api.get('/proxies');
        for (const p of res.items || []) {
          items.push({ label: `${p.domain} → ${p.targetHost}:${p.targetPort}`, group: 'Proxies', path: '/network/proxies', keywords: `proxy ${p.domain} ${p.targetHost}` });
        }
      } catch { /* proxies non disponibles */ }
      if (user?.role === 'admin') {
        try {
          const res = await api.get('/hosts');
          for (const h of res.items || []) {
            items.push({ label: `${h.name} (${h.address})`, group: 'Hôtes', path: '/infrastructure/hosts', keywords: `hôte ssh ${h.name} ${h.address}` });
          }
        } catch { /* hôtes non disponibles */ }
      }
      // Dépôts Git (GitLab/GitHub) : mêmes endpoints que le panneau Projets de
      // Développement, pour que la recherche globale couvre aussi les dépôts.
      try {
        const res = await api.get('/gitlab/projects');
        for (const p of res.items || []) {
          items.push({ label: p.name, group: 'Dépôts', path: '/deployments', keywords: `dépôt repo gitlab git ${p.path || ''}` });
        }
      } catch { /* gitlab non disponible */ }
      try {
        const res = await api.get('/github/repos');
        for (const p of res.items || []) {
          items.push({ label: p.fullName || p.name, group: 'Dépôts', path: '/deployments', keywords: `dépôt repo github git ${p.fullName || ''}` });
        }
      } catch { /* github non disponible */ }
      // Données personnelles / plateforme : les entrées "Mon compte" et
      // "Paramètres — Plateforme" existent déjà en statique, on enrichit juste
      // leurs mots-clés avec les valeurs réelles (nom, e-mail, organisation)
      // pour que taper son propre nom ou le nom de l'organisation les trouve.
      if (user?.name || user?.email) {
        items.push({ label: 'Mon compte', group: 'Pages', path: '/account', keywords: `profil compte personnel données personnelles ${user?.name || ''} ${user?.email || ''}`, __dedupeKey: 'account-enriched' });
      }
      try {
        const res = await api.get('/console');
        if (res?.name) {
          items.push({ label: 'Paramètres — Plateforme', group: 'Administration', path: '/settings?tab=platform', keywords: `organisation plateforme fuseau horaire langue ${res.name}`, adminOnly: true, __dedupeKey: 'platform-enriched' });
        }
      } catch { /* console non disponible */ }
      if (!cancelled) setDynamicItems(items);
    }
    loadDynamic();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, user?.role, user?.name, user?.email]);

  const allItems = useMemo(() => {
    const dedupeKeys = new Set(dynamicItems.filter((i) => i.__dedupeKey).map((i) => i.__dedupeKey));
    const staticFiltered = STATIC_SEARCH_ITEMS.filter((i) => {
      if (i.adminOnly && user?.role !== 'admin') return false;
      if (i.path === '/account' && dedupeKeys.has('account-enriched')) return false;
      if (i.path === '/settings?tab=platform' && dedupeKeys.has('platform-enriched')) return false;
      return true;
    });
    return [...staticFiltered, ...dynamicItems.filter((i) => !i.adminOnly || user?.role === 'admin')];
  }, [dynamicItems, user?.role]);

  const results = useMemo(() => {
    const terms = queryTerms(query);
    if (terms.length === 0) return allItems.slice(0, 40);
    return allItems
      .map((item) => ({ item, score: fuzzyScore(`${item.label} ${item.keywords || ''}`, terms) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((r) => r.item);
  }, [allItems, query]);

  useEffect(() => setActiveIndex(0), [query]);

  function go(item) {
    if (!item) return;
    onClose();
    navigate(item.path);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); go(results[activeIndex]); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, activeIndex]);

  if (!open) return null;

  let lastGroup = null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 0', animation: 'fadeIn .12s ease both' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 560, boxShadow: 'var(--shadow-pop)', overflow: 'hidden', animation: 'popIn .15s ease both' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <Icon name="search" size={16} style={{ color: 'var(--text-faint)', flex: 'none' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une page, un proxy, un hôte, un dépôt…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-faintest)', flex: 'none' }}>Échap</span>
        </div>

        <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun résultat</div>
          )}
          {results.map((item, idx) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={`${item.group}-${item.label}-${idx}`}>
                {showGroup && (
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faintest)', padding: '8px 10px 4px' }}>
                    {item.group}
                  </div>
                )}
                <div
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => go(item)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: idx === activeIndex ? 600 : 500,
                    color: idx === activeIndex ? 'var(--primary)' : 'var(--text)',
                    background: idx === activeIndex ? 'var(--primary-soft)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
