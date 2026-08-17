import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DeploymentFormDialog from './DeploymentFormDialog.jsx';
import PipelineView from './PipelineView.jsx';
import GitOpsDiffPanel from './GitOpsDiffPanel.jsx';
import DevToolsPanel from './DevToolsPanel.jsx';
import './ReleasesPage.css';

export default function ReleasesPage() {
  const { user } = useAuth();
  const links = useApi(() => api.get('/deployments'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const isAdmin = user?.role === 'admin';
  // Réservé aux admins côté API (mêmes règles que la page Supply Chain) :
  // n'appelle /code-scans que pour un compte admin, sinon 403 assuré.
  const codeScans = useApi(() => (isAdmin ? api.get('/code-scans') : Promise.resolve({ items: [] })), [isAdmin]);
  const lastScan = codeScans.data?.items?.[0] || null;

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
          <button className="btn rlp-header-btn" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={15} />Lier une application
          </button>
        )}
      />

      <div className="rlp-kpi-grid">
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
            <tr key={l.id} className="rlp-row-clickable" onClick={() => setSelected(l.id)}>
              <td className="rlp-cell-name">{l.name}</td>
              <td className="mono muted">{l.gitProvider === 'github' ? (l.githubOwner && l.githubRepo ? `${l.githubOwner}/${l.githubRepo}` : '—') : (l.gitlabProjectId || '—')}</td>
              <td className="mono muted">{l.argocdAppName || '—'}</td>
              <td className="mono muted">{l.k8sNamespace && l.k8sDeployment ? `${l.k8sNamespace}/${l.k8sDeployment}` : '—'}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {isAdmin && <span className="btn-outline rlp-remove-btn" onClick={() => remove(l.id)}>Retirer</span>}
              </td>
            </tr>
          )}
        />
      </Panel>

      {selected && (
        <div className="rlp-detail-stack">
          <PipelineView linkId={selected} span={12} />
          <GitOpsDiffPanel linkId={selected} span={12} />
        </div>
      )}

      {!isAdmin && (
        <div className="card rlp-user-note">
          Compte Utilisateur : accès en lecture et pipeline complet ; les actions de retrait/administration sont réservées aux administrateurs.
        </div>
      )}

      {isAdmin && (
        <Panel
          title="Fichiers à corriger"
          sub={lastScan ? `Dernier scan Semgrep (${lastScan.target}) — ${new Date(lastScan.scannedAt).toLocaleString('fr-FR')}` : 'Analyse statique de la plateforme (Semgrep)'}
          span={12}
          style={{ marginBottom: 16 }}
          actions={<Link to="/deployments/supply-chain" className="btn-outline rlp-scan-link">Lancer/voir un scan</Link>}
        >
          {!lastScan ? (
            <div className="rlp-scan-empty">
              Aucun scan encore lancé. Cette liste vient de Semgrep (SAST réel, code source de la plateforme elle-même) — voir Supply Chain pour l'exécuter.
            </div>
          ) : lastScan.total === 0 ? (
            <div className="rlp-scan-ok">Aucun problème détecté au dernier scan.</div>
          ) : (
            <div className="rlp-scan-list">
              {lastScan.findings.slice(0, 8).map((f, i) => (
                <div key={`${f.file}:${f.line}:${i}`} className="rlp-scan-item">
                  <Icon name="alertTriangle" size={14} className="rlp-scan-item-icon" style={{ color: `var(--tone-${f.severity === 'ERROR' ? 'crit' : f.severity === 'WARNING' ? 'warn' : 'mut'}-fg)` }} />
                  <span className="mono rlp-scan-item-path">{f.file}:{f.line}</span>
                  <span className="rlp-scan-item-message">{f.message}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <DevToolsPanel />

      {formOpen && <DeploymentFormDialog onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); links.reload(); }} />}
    </>
  );
}
