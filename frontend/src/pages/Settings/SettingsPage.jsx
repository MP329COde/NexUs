import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { INTEGRATION_FORMS, INTEGRATION_ORDER, INTEGRATION_CATEGORIES } from '../../config/integrationForms.js';
import IntegrationPanel from './IntegrationPanel.jsx';
import K8sClustersPanel from './K8sClustersPanel.jsx';
import InfrastructureStatusPanel from './InfrastructureStatusPanel.jsx';
import UsersPanel from './UsersPanel.jsx';
import GroupsPanel from './GroupsPanel.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import PlatformPanel from './PlatformPanel.jsx';
import NetworkPanel from './NetworkPanel.jsx';
import PluginsPanel from './PluginsPanel.jsx';
import FeatureFlagsPanel from './FeatureFlagsPanel.jsx';
import EnvironmentBlueprintsPanel from './EnvironmentBlueprintsPanel.jsx';
import PoliciesPanel from './PoliciesPanel.jsx';
import IdentityPanel from './IdentityPanel.jsx';
import GitServicesPanel from './GitServicesPanel.jsx';
import CertificatesPanel from './CertificatesPanel.jsx';
import SystemPanel from './SystemPanel.jsx';
import AuditPanel from './AuditPanel.jsx';
import './SettingsPage.css';

// domain/level : permission RBAC (voir store/groupsStore.js) requise pour
// voir l'onglet — un compte "admin" de plateforme passe toujours (bypass
// implicite, voir lib/permissions.js). Les onglets sans domain restent
// réservés au rôle admin (leurs routes backend n'ont pas été branchées sur
// le nouveau moteur de permissions dans cette itération).
const TABS = [
  { id: 'integrations', label: 'Intégrations & outils', domain: 'settings', level: 'admin' },
  { id: 'users', label: 'Utilisateurs', domain: 'users', level: 'admin' },
  { id: 'groups', label: 'Groupes & permissions', domain: 'users', level: 'admin' },
  { id: 'inventory', label: 'Inventaire', domain: 'inventory', level: 'admin', primaryAdminOnly: true },
  { id: 'platform', label: 'Plateforme', domain: 'settings', level: 'admin' },
  { id: 'network', label: 'Réseau', domain: 'settings', level: 'admin' },
  { id: 'plugins', label: 'Plugins', domain: 'plugins', level: 'read' },
  { id: 'feature-flags', label: 'Feature flags', adminOnly: true },
  { id: 'environment-blueprints', label: "Blueprints d'environnement", domain: 'settings', level: 'admin' },
  { id: 'policies', label: 'Policies', domain: 'settings', level: 'admin' },
  { id: 'identity', label: 'Connexion & identité', domain: 'identity', level: 'admin' },
  { id: 'git', label: 'Services Git', adminOnly: true },
  { id: 'certificates', label: 'Certificats', domain: 'settings', level: 'admin' },
  { id: 'system', label: 'Système', adminOnly: true },
  { id: 'audit', label: 'Journal', adminOnly: true }
];

// Regroupement purement visuel des 13 onglets ci-dessus (ids/routes/permissions
// inchangés — `?tab=` continue de cibler les mêmes ids) : la barre d'onglets à
// plat mélangeait des destinations très différentes (gouvernance, plateforme,
// intégrations, identité...), un développeur devait déjà savoir dans quel
// onglet chercher. Catégories reprises du plan de refonte de navigation.
const TAB_CATEGORIES = [
  { label: 'Général', tabIds: ['platform', 'network', 'inventory'] },
  { label: 'Identité & accès', tabIds: ['users', 'groups', 'identity'] },
  { label: 'Intégrations', tabIds: ['integrations', 'git', 'certificates'] },
  { label: 'Plateforme', tabIds: ['plugins', 'feature-flags', 'environment-blueprints'] },
  { label: 'Policies & audit', tabIds: ['policies', 'audit'] },
  { label: 'Système', tabIds: ['system'] }
];

export default function SettingsPage() {
  const { data, error, reload } = useApi(() => api.get('/settings'), []);
  const { user, hasPermission } = useAuth();
  const canSeeTab = (t) => {
    if (t.primaryAdminOnly) return user?.isPrimaryAdmin || hasPermission(t.domain, t.level);
    if (t.adminOnly) return user?.role === 'admin';
    return hasPermission(t.domain, t.level);
  };
  const visibleTabs = TABS.filter(canSeeTab);
  const visibleIds = new Set(visibleTabs.map((t) => t.id));
  const visibleCategories = TAB_CATEGORIES
    .map((c) => ({ ...c, tabs: c.tabIds.map((id) => visibleTabs.find((t) => t.id === id)).filter(Boolean) }))
    .filter((c) => c.tabs.length > 0);
  // Filet de sécurité : si un onglet est un jour ajouté à TABS sans être
  // rattaché à TAB_CATEGORIES, il reste visible (non perdu silencieusement)
  // plutôt que de disparaître de la barre.
  const uncategorized = visibleTabs.filter((t) => !TAB_CATEGORIES.some((c) => c.tabIds.includes(t.id)));
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  // Onglet par défaut (sans ?tab=) : "Plateforme" si l'admin y a accès, sinon
  // repli sur le premier onglet visible — un admin qui clique sur
  // "Paramètres" doit arriver directement sur Plateforme, pas sur le premier
  // onglet de TABS (qui était "Intégrations & outils" par accident d'ordre).
  const defaultTabId = visibleIds.has('platform') ? 'platform' : (visibleTabs[0]?.id || null);
  const tab = visibleIds.has(tabParam) ? tabParam : defaultTabId;
  const setTab = (id) => setSearchParams(id === defaultTabId ? {} : { tab: id }, { replace: true });

  return (
    <>
      <PageHeader
        title="Paramètres d'administration"
        sub="Utilisateurs, permissions, plateforme et intégrations. Réservé aux administrateurs — les secrets sont chiffrés au repos et ne sont jamais renvoyés au navigateur."
        actions={(
          <div className="settings-tabs settings-tabs-grouped">
            {visibleCategories.map((c) => (
              <div key={c.label} className="settings-tab-group">
                <span className="faint settings-tab-group-label">{c.label}</span>
                {c.tabs.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`settings-tab${tab === t.id ? ' settings-tab-active' : ''}`}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            ))}
            {uncategorized.map((t) => (
              <div
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`settings-tab${tab === t.id ? ' settings-tab-active' : ''}`}
              >
                {t.label}
              </div>
            ))}
          </div>
        )}
      />

      {!tab && (
        <div className="faint settings-no-tab">
          Aucune permission ne vous donne accès à un onglet des paramètres d'administration.
        </div>
      )}

      {tab === 'integrations' && (
        <div className="settings-integrations-grid">
          <div className="settings-integrations-full"><InfrastructureStatusPanel /></div>
          <div className="settings-integrations-full"><K8sClustersPanel /></div>
          {INTEGRATION_CATEGORIES.map((cat) => {
            const keys = cat.keys.filter((k) => INTEGRATION_ORDER.includes(k));
            if (keys.length === 0) return null;
            return (
              <FragmentWithLabel key={cat.label} label={cat.label}>
                {keys.map((key) => (
                  <IntegrationPanel
                    key={key}
                    integrationKey={key}
                    schema={INTEGRATION_FORMS[key]}
                    initial={data?.integrations[key]}
                    allIntegrations={data?.integrations}
                    onSaved={reload}
                  />
                ))}
              </FragmentWithLabel>
            );
          })}
        </div>
      )}
      {tab === 'users' && <UsersPanel />}
      {tab === 'groups' && <GroupsPanel />}
      {tab === 'inventory' && <InventoryPanel />}
      {tab === 'platform' && <PlatformPanel data={data} error={error} reload={reload} />}
      {tab === 'network' && <NetworkPanel />}
      {tab === 'plugins' && <PluginsPanel />}
      {tab === 'feature-flags' && <FeatureFlagsPanel />}
      {tab === 'environment-blueprints' && <EnvironmentBlueprintsPanel />}
      {tab === 'policies' && <PoliciesPanel />}
      {tab === 'identity' && <IdentityPanel />}
      {tab === 'git' && <GitServicesPanel />}
      {tab === 'certificates' && <CertificatesPanel />}
      {tab === 'system' && <SystemPanel />}
      {tab === 'audit' && <AuditPanel />}
    </>
  );
}

// Rend un libellé de catégorie en pleine largeur suivi de ses cartes,
// tout en gardant chaque carte comme enfant direct de la grille CSS
// parente (`.settings-integrations-grid`) — un wrapper <div> autour du
// groupe casserait la mise en colonnes automatique du grid.
function FragmentWithLabel({ label, children }) {
  return (
    <>
      <div className="settings-integrations-category">{label}</div>
      {children}
    </>
  );
}
