import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/apiClient.js';
import { STATIC_SEARCH_ITEMS } from '../../config/searchIndex.js';
import { fuzzyScore, queryTerms } from '../../lib/fuzzyMatch.js';
import { contextualActions, contextLabel, globalActions } from './contextualActions.js';
import Icon from '../ui/Icon.jsx';
import './CommandPalette.css';

// Command Center : ⌘K / ⌘⇧F ouvrent la même palette. Sans contexte, c'est une
// recherche plate sur les pages et données de la plateforme (proxies, hôtes,
// dépôts...). Ouverte depuis l'icône "⋯" d'une ressource précise (pod,
// deployment...), elle affiche en plus, épinglées en tête, les actions qui
// n'ont de sens que pour cette ressource — pas de liste statique unique :
// `contextualActions()` construit la liste selon context.type.
export default function CommandPalette({ open, onClose, context }) {
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
      // Projets Nexus : liste déjà filtrée côté backend selon l'appartenance
      // de l'utilisateur (voir routes/projects.routes.js) — pas de risque de
      // faire apparaître dans la recherche un projet auquel il n'a pas accès.
      try {
        const res = await api.get('/projects');
        for (const p of res.items || []) {
          items.push({ label: p.name, group: 'Projets', path: `/deployments/projects/${p.id}`, keywords: `projet ${p.name} ${p.description || ''}`, icon: 'folder' });
        }
      } catch { /* projets non disponibles */ }
      // Incidents ouverts et changements en attente sur les projets de
      // l'utilisateur (même endpoint que MyProjectsOverviewPanel, déjà
      // scopé côté backend à ses propres projets) — réservé aux comptes
      // non-admin : un admin voit déjà tout via AdminOverviewPanel, inutile
      // de dupliquer un appel potentiellement lourd (tous les projets).
      if (user?.role !== 'admin') {
        try {
          const res = await api.get('/projects/mine/overview');
          for (const i of res.openIncidents || []) {
            items.push({ label: `${i.projectName} — ${i.title}`, group: 'Incidents', path: `/deployments/projects/${i.projectId}`, keywords: `incident ${i.severity} ${i.title} ${i.projectName}`, icon: 'alertTriangle' });
          }
          for (const c of res.pendingChanges || []) {
            items.push({ label: `${c.projectName} — ${c.title}`, group: 'Changements', path: `/deployments/projects/${c.projectId}`, keywords: `changement ${c.title} ${c.projectName}`, icon: 'gitBranch' });
          }
        } catch { /* socle relationnel non disponible */ }
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
      // Organisations et équipes de l'utilisateur (socle relationnel) :
      // mêmes endpoints "mine" que OrganizationsPage/TeamWorkspacePage,
      // aucune nouvelle route.
      let myOrgs = [];
      try {
        const res = await api.get('/organizations');
        myOrgs = res.items || [];
        for (const o of myOrgs) {
          items.push({ label: o.name, group: 'Organisations', path: `/deployments/organizations/${o.id}`, keywords: `organisation ${o.name} ${o.slug || ''}`, icon: 'users' });
        }
      } catch { /* socle organisations non disponible */ }
      try {
        const res = await api.get('/teams/mine');
        for (const t of res.items || []) {
          items.push({ label: t.name, group: 'Équipes', path: `/deployments/organizations/${t.org_id}`, keywords: `équipe team ${t.name}` });
        }
      } catch { /* équipes non disponibles */ }
      // Tâches assignées : même endpoint que "Mon travail".
      try {
        const res = await api.get('/projects/mine/tasks');
        for (const t of res.items || []) {
          items.push({ label: `${t.projectName} — ${t.title}`, group: 'Tâches', path: `/deployments/projects/${t.projectId}`, keywords: `tâche task ${t.title} ${t.projectName}`, icon: 'check' });
        }
      } catch { /* tâches non disponibles */ }
      // Environnements de preview sur mes projets : même endpoint que "Mon travail".
      try {
        const res = await api.get('/projects/mine/environments');
        for (const e of res.items || []) {
          items.push({ label: `${e.projectName} — ${e.name}`, group: 'Environnements', path: `/deployments/projects/${e.projectId}`, keywords: `environnement preview ${e.name} ${e.source_branch || ''} ${e.projectName}`, icon: 'gitBranch' });
        }
      } catch { /* environnements non disponibles */ }
      // Pages du wiki d'équipe : une organisation à la fois (endpoint exige
      // orgId), limité aux organisations de l'utilisateur — pas de nouvel
      // endpoint, juste un appel par organisation déjà connue ci-dessus.
      try {
        const wikiLists = await Promise.all(myOrgs.map((o) => api.get(`/wiki?orgId=${o.id}`).then((r) => (r.items || []).map((page) => ({ ...page, orgName: o.name }))).catch(() => [])));
        for (const page of wikiLists.flat()) {
          items.push({ label: page.title, group: 'Documents', path: `/deployments/organizations/${page.org_id}/wiki`, keywords: `document wiki page ${page.title} ${page.orgName}`, icon: 'book' });
        }
      } catch { /* wiki non disponible */ }
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

  const actions = useMemo(() => (query.trim() ? [] : contextualActions(context, navigate, onClose)), [context, query, navigate, onClose]);
  // Actions globales ("Créer un projet"...) : seulement quand la palette
  // n'est pas ouverte pour une ressource précise — un contexte de ressource
  // (pod, deployment...) reste prioritaire et sans ambiguïté sur ce qu'on
  // peut y faire.
  const globals = useMemo(() => (query.trim() || context ? [] : globalActions(navigate, onClose)), [context, query, navigate, onClose]);
  const combined = useMemo(() => [
    ...actions.map((a) => ({ ...a, __action: true, group: contextLabel(context) })),
    ...globals.map((a) => ({ ...a, __action: true, group: 'Actions rapides' })),
    ...results
  ], [actions, globals, results, context]);

  useEffect(() => setActiveIndex(0), [query]);

  function go(item) {
    if (!item) return;
    if (item.__action) { item.run(); return; }
    onClose();
    navigate(item.path);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, combined.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); go(combined[activeIndex]); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, combined, activeIndex]);

  if (!open) return null;

  let lastGroup = null;

  return (
    <div
      onClick={onClose}
      className="cmdp-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card cmdp-card"
      >
        <div className="cmdp-input-row">
          <Icon name="search" size={16} className="cmdp-input-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={context ? `Actions sur ${contextLabel(context)}, ou rechercher…` : 'Rechercher une page, une action, un proxy, un hôte, un dépôt…'}
            className="cmdp-input"
          />
          <span className="cmdp-escape-hint">Échap</span>
        </div>

        <div className="cmdp-results">
          {combined.length === 0 && (
            <div className="cmdp-empty">Aucun résultat</div>
          )}
          {combined.map((item, idx) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={`${item.group}-${item.label}-${idx}`}>
                {showGroup && (
                  <div className="cmdp-group-label">
                    {item.group}
                  </div>
                )}
                <div
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => go(item)}
                  className={`cmdp-item ${idx === activeIndex ? 'cmdp-item-active' : (item.tone === 'crit' ? 'cmdp-item-crit' : '')}`}
                >
                  {item.icon && <Icon name={item.icon} size={14} className="cmdp-item-icon" />}
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
