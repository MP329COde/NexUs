import PageHeader from '../../components/ui/PageHeader.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { INTEGRATION_FORMS, INTEGRATION_ORDER } from '../../config/integrationForms.js';
import IntegrationPanel from './IntegrationPanel.jsx';

export default function SettingsPage() {
  const { data, reload } = useApi(() => api.get('/settings'), []);

  return (
    <>
      <PageHeader title="Paramètres" sub="Connexions aux intégrations de l'infrastructure. Les secrets sont chiffrés au repos et ne sont jamais renvoyés au navigateur." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))', gap: 16 }}>
        {INTEGRATION_ORDER.map((key) => (
          <IntegrationPanel
            key={key}
            integrationKey={key}
            schema={INTEGRATION_FORMS[key]}
            initial={data?.integrations[key]}
            onSaved={reload}
          />
        ))}
      </div>
    </>
  );
}
