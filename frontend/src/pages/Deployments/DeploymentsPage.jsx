import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import DeploymentFormDialog from './DeploymentFormDialog.jsx';
import PipelineView from './PipelineView.jsx';
import GitProjectsPanel from './GitProjectsPanel.jsx';

export default function DeploymentsPage() {
  const links = useApi(() => api.get('/deployments'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  async function remove(id) {
    if (!confirm('Retirer cette application suivie ?')) return;
    await api.del(`/deployments/${id}`);
    links.reload();
    if (selected === id) setSelected(null);
  }

  return (
    <>
      <PageHeader
        title="Développement & déploiements"
        sub="Suivi du workflow Git → CI/CD → Argo CD → Kubernetes → reverse proxy, par application"
        actions={(
          <button className="btn" onClick={() => setFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="plus" size={15} />Lier une application
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Applications suivies" span={12}>
          <DataTable
            columns={['Nom', 'Source Git', 'Application Argo CD', 'Déploiement K8s', '']}
            rows={links.data?.items}
            emptyTitle="Aucune application liée"
            emptyHint="Reliez un projet GitLab ou GitHub, une application Argo CD et un déploiement Kubernetes pour suivre le pipeline complet."
            renderRow={(l) => (
              <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(l.id)}>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td className="mono muted">
                  {l.gitProvider === 'github'
                    ? (l.githubOwner && l.githubRepo ? `${l.githubOwner}/${l.githubRepo}` : '—')
                    : (l.gitlabProjectId || '—')}
                </td>
                <td className="mono muted">{l.argocdAppName || '—'}</td>
                <td className="mono muted">{l.k8sNamespace && l.k8sDeployment ? `${l.k8sNamespace}/${l.k8sDeployment}` : '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => remove(l.id)}>Retirer</span>
                </td>
              </tr>
            )}
          />
        </Panel>

        {selected && <PipelineView linkId={selected} span={12} />}

        <GitProjectsPanel />
      </div>

      {formOpen && <DeploymentFormDialog onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); links.reload(); }} />}
    </>
  );
}
