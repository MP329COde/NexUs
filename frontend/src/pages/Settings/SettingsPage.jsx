import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { INTEGRATION_FORMS, INTEGRATION_ORDER } from '../../config/integrationForms.js';
import IntegrationPanel from './IntegrationPanel.jsx';
import UsersPanel from './UsersPanel.jsx';
import GroupsPanel from './GroupsPanel.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import PlatformPanel from './PlatformPanel.jsx';
import IdentityPanel from './IdentityPanel.jsx';
import GitServicesPanel from './GitServicesPanel.jsx';
import SystemPanel from './SystemPanel.jsx';
import AuditPanel from './AuditPanel.jsx';

const TABS = [
  { id: 'integrations', label: 'Intégrations & outils' },
  { id: 'users', label: 'Utilisateurs' },
  { id: 'groups', label: 'Groupes & permissions' },
  { id: 'inventory', label: 'Inventaire' },
  { id: 'platform', label: 'Plateforme' },
  { id: 'identity', label: 'Connexion & identité' },
  { id: 'git', label: 'Services Git' },
  { id: 'system', label: 'Système' },
  { id: 'audit', label: 'Journal' }
];

export default function SettingsPage() {
  const { data, reload } = useApi(() => api.get('/settings'), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'integrations';
  const setTab = (id) => setSearchParams(id === 'integrations' ? {} : { tab: id }, { replace: true });

  return (
    <>
      <PageHeader
        title="Paramètres d'administration"
        sub="Utilisateurs, permissions, plateforme et intégrations. Réservé aux administrateurs — les secrets sont chiffrés au repos et ne sont jamais renvoyés au navigateur."
        actions={(
          <div style={{ display: 'flex', background: 'var(--border-soft)', borderRadius: 9, padding: 3, gap: 2, overflowX: 'auto', maxWidth: '100%' }}>
            {TABS.map((t) => (
              <div
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? 'var(--text)' : 'var(--text-muted)', background: tab === t.id ? 'var(--surface)' : 'transparent', boxShadow: tab === t.id ? 'var(--shadow-card)' : 'none', cursor: 'pointer', transition: 'all .15s ease', whiteSpace: 'nowrap' }}
              >
                {t.label}
              </div>
            ))}
          </div>
        )}
      />

      {tab === 'integrations' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))', gap: 16 }}>
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
      {tab === 'platform' && <PlatformPanel />}
      {tab === 'identity' && <IdentityPanel />}
      {tab === 'git' && <GitServicesPanel />}
      {tab === 'system' && <SystemPanel />}
      {tab === 'audit' && <AuditPanel />}
    </>
  );
}
