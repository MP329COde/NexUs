import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { INTEGRATION_FORMS, INTEGRATION_ORDER } from '../../config/integrationForms.js';
import IntegrationPanel from './IntegrationPanel.jsx';
import InfrastructureStatusPanel from './InfrastructureStatusPanel.jsx';
import UsersPanel from './UsersPanel.jsx';
import GroupsPanel from './GroupsPanel.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import PlatformPanel from './PlatformPanel.jsx';
import PluginsPanel from './PluginsPanel.jsx';
import EnvironmentBlueprintsPanel from './EnvironmentBlueprintsPanel.jsx';
import PoliciesPanel from './PoliciesPanel.jsx';
import IdentityPanel from './IdentityPanel.jsx';
import GitServicesPanel from './GitServicesPanel.jsx';
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
  { id: 'plugins', label: 'Plugins', domain: 'plugins', level: 'read' },
  { id: 'environment-blueprints', label: "Blueprints d'environnement", domain: 'settings', level: 'admin' },
  { id: 'policies', label: 'Policies', domain: 'settings', level: 'admin' },
  { id: 'identity', label: 'Connexion & identité', domain: 'identity', level: 'admin' },
  { id: 'git', label: 'Services Git', adminOnly: true },
  { id: 'system', label: 'Système', adminOnly: true },
  { id: 'audit', label: 'Journal', adminOnly: true }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = visibleTabs.some((t) => t.id === tabParam) ? tabParam : (visibleTabs[0]?.id || null);
  const setTab = (id) => setSearchParams(id === visibleTabs[0]?.id ? {} : { tab: id }, { replace: true });

  return (
    <>
      <PageHeader
        title="Paramètres d'administration"
        sub="Utilisateurs, permissions, plateforme et intégrations. Réservé aux administrateurs — les secrets sont chiffrés au repos et ne sont jamais renvoyés au navigateur."
        actions={(
          <div className="settings-tabs">
            {visibleTabs.map((t) => (
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
          {INTEGRATION_ORDER.map((key) => (
            <IntegrationPanel
              key={key}
              integrationKey={key}
              schema={INTEGRATION_FORMS[key]}
              initial={data?.integrations[key]}
              allIntegrations={data?.integrations}
              onSaved={reload}
            />
          ))}
        </div>
      )}
      {tab === 'users' && <UsersPanel />}
      {tab === 'groups' && <GroupsPanel />}
      {tab === 'inventory' && <InventoryPanel />}
      {tab === 'platform' && <PlatformPanel data={data} error={error} reload={reload} />}
      {tab === 'plugins' && <PluginsPanel />}
      {tab === 'environment-blueprints' && <EnvironmentBlueprintsPanel />}
      {tab === 'policies' && <PoliciesPanel />}
      {tab === 'identity' && <IdentityPanel />}
      {tab === 'git' && <GitServicesPanel />}
      {tab === 'system' && <SystemPanel />}
      {tab === 'audit' && <AuditPanel />}
    </>
  );
}
