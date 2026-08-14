import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DeploymentFormDialog from './DeploymentFormDialog.jsx';
import PipelineView from './PipelineView.jsx';
import GitOpsDiffPanel from './GitOpsDiffPanel.jsx';
import DevToolsPanel from './DevToolsPanel.jsx';

// Panneau démonstration : la console n'a pas encore de détection statique de
// "fichiers problématiques" (couverture/lint par commit) — nécessiterait une
// intégration SonarQube ou équivalent.
const DEMO_FILES = [
  { path: 'src/services/paymentClient.ts', issue: 'Couverture de tests 41 % (seuil 70 %)', tone: 'warn' },
  { path: 'src/routes/webhooks.ts', issue: '2 vulnérabilités modérées détectées', tone: 'crit' },
  { path: 'infra/terraform/vpc.tf', issue: 'Dérive détectée vs état appliqué', tone: 'warn' }
];

export default function ReleasesPage() {
  const { user } = useAuth();
  const links = useApi(() => api.get('/deployments'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const isAdmin = user?.role === 'admin';

  const apps = links.data?.items || [];
  const fullyLinked = apps.filter((l) => l.argocdAppName && l.k8sDeployment).length;

  async function remove(id) {
    if (!confirm('Retirer cette application suivie ?')) return;
    await api.del(`/deployments/${id}`);
    links.reload();
    if (selected === id) setSelected(null);
  }

  return (
    <>
      <PageHeader
        title="Déploiements"
        sub="Suivi du workflow Git → CI/CD → Argo CD → Kubernetes → reverse proxy, par application."
        actions={(
          <button className="btn" onClick={() => setFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="plus" size={15} />Lier une application
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Applications suivies" value={apps.length} tint="#3B82F6" />
        <KpiCard label="Pipeline complet" value={fullyLinked} unit={`/ ${apps.length}`} tint="#10B981" />
        <KpiCard label="Environnement" value={isAdmin ? 'Prod + Dev' : 'Développement'} tint="#8B5CF6" />
      </div>

      <Panel title="Applications suivies" sub="Cliquez une ligne pour voir le pipeline complet" span={12} style={{ marginBottom: 16 }}>
        <DataTable
          columns={['Nom', 'Source Git', 'Application Argo CD', 'Déploiement K8s', '']}
          rows={apps}
          emptyTitle="Aucune application liée"
          emptyHint="Reliez un projet GitLab ou GitHub, une application Argo CD et un déploiement Kubernetes pour suivre le pipeline complet."
          renderRow={(l) => (
            <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(l.id)}>
              <td style={{ fontWeight: 500 }}>{l.name}</td>
              <td className="mono muted">{l.gitProvider === 'github' ? (l.githubOwner && l.githubRepo ? `${l.githubOwner}/${l.githubRepo}` : '—') : (l.gitlabProjectId || '—')}</td>
              <td className="mono muted">{l.argocdAppName || '—'}</td>
              <td className="mono muted">{l.k8sNamespace && l.k8sDeployment ? `${l.k8sNamespace}/${l.k8sDeployment}` : '—'}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {isAdmin && <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => remove(l.id)}>Retirer</span>}
              </td>
            </tr>
          )}
        />
      </Panel>

      {selected && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PipelineView linkId={selected} span={12} />
          <GitOpsDiffPanel linkId={selected} span={12} />
        </div>
      )}

      {!isAdmin && (
        <div className="card" style={{ padding: 14, marginBottom: 16, fontSize: 12.5, color: 'var(--text-faint)' }}>
          Compte Utilisateur : accès en lecture et pipeline complet ; les actions de retrait/administration sont réservées aux administrateurs.
        </div>
      )}

      <Panel title="Fichiers à corriger" sub="Détection statique — démonstration" span={12} style={{ marginBottom: 16 }}>
        <DemoNote>Aucune intégration d'analyse statique (type SonarQube) n'est branchée : liste illustrative pour valider la mise en page.</DemoNote>
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DEMO_FILES.map((f) => (
            <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
              <Icon name="alertTriangle" size={14} style={{ color: `var(--tone-${f.tone}-fg)`, flex: 'none' }} />
              <span className="mono" style={{ fontSize: 12, flex: 1 }}>{f.path}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{f.issue}</span>
            </div>
          ))}
        </div>
      </Panel>

      <DevToolsPanel />

      {formOpen && <DeploymentFormDialog onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); links.reload(); }} />}
    </>
  );
}
