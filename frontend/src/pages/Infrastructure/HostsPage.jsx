import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import HostFormDialog from './HostFormDialog.jsx';
import InstallAgentDialog from './InstallAgentDialog.jsx';
import HostServicesDialog from './HostServicesDialog.jsx';
import './InfrastructureShared.css';

export default function HostsPage() {
  const publicKey = useApi(() => api.get('/hosts/ssh-public-key'), []);
  const hosts = useApi(() => api.get('/hosts'), []);
  const updatePolicy = useApi(() => api.get('/hosts/services/update-policy'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState(null);
  const [servicesTarget, setServicesTarget] = useState(null);
  const notify = useNotify();

  async function togglePolicy() {
    const next = !updatePolicy.data?.policy?.globalEnabled;
    if (next && !confirm("Autoriser les mises à jour de services installés via NexUs (Grafana, Prometheus...) ? Chaque mise à jour restera déclenchée explicitement, avec confirmation, jamais automatique.")) return;
    await api.put('/hosts/services/update-policy', { globalEnabled: next });
    updatePolicy.reload();
  }

  async function remove(id) {
    if (!confirm('Retirer cet hôte de la console ?')) return;
    await api.del(`/hosts/${id}`);
    hosts.reload();
  }

  async function toggleCritical(h) {
    await api.put(`/hosts/${h.id}`, { critical: !h.critical });
    hosts.reload();
  }

  async function saveRole(h, role) {
    if (role === (h.role || '')) return;
    await api.put(`/hosts/${h.id}`, { role });
    hosts.reload();
  }

  function copyKey() {
    navigator.clipboard.writeText(publicKey.data?.publicKey || '');
    notify('Clé publique copiée dans le presse-papiers', { type: 'ok' });
  }

  return (
    <>
      <PageHeader
        title="Hôtes & agents"
        sub="Installe des agents d'infrastructure via SSH, depuis un catalogue fermé de scripts — aucune commande arbitraire n'est exécutable depuis l'interface"
        actions={(
          <button className="btn infra-header-link" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={15} />Ajouter un hôte
          </button>
        )}
      />

      <div className="infra-panel-grid">
        <Panel title="Clé publique de la console" sub="À copier dans ~/.ssh/authorized_keys de chaque hôte à gérer (utilisateur configuré ci-dessous)" span={12}>
          <div className="infra-key-panel-body">
            <code className="mono infra-key-code">
              {publicKey.data?.publicKey || '…'}
            </code>
            <span className="btn-outline infra-key-copy-btn" onClick={copyKey}>Copier</span>
          </div>
        </Panel>

        <Panel title="Mises à jour de services" sub="Désactivé par défaut : aucune mise à jour n'est jamais déclenchée automatiquement, même une fois ce réglage activé — un bouton « Mettre à jour » par service reste requis, avec confirmation." span={12}>
          <label className="infra-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={Boolean(updatePolicy.data?.policy?.globalEnabled)} onChange={togglePolicy} />
            Autoriser les mises à jour de services installés via NexUs
          </label>
        </Panel>

        <Panel title="Hôtes gérés" span={12}>
          <DataTable
            columns={['Nom', 'Adresse', 'Rôle', 'Critique', 'Dernière installation', 'Actions']}
            rows={hosts.data?.items}
            emptyTitle="Aucun hôte enregistré"
            emptyHint="Ajoutez un hôte pour pouvoir y installer un agent depuis le catalogue."
            renderRow={(h) => (
              <tr key={h.id}>
                <td className="infra-cell-name">{h.name}</td>
                <td className="mono muted">{h.address}:{h.port}</td>
                <td>
                  <input
                    className="input infra-role-input"
                    defaultValue={h.role || ''}
                    onBlur={(e) => saveRole(h, e.target.value)}
                    placeholder="Rôle"
                  />
                </td>
                <td>
                  <label className="infra-checkbox-label">
                    <input type="checkbox" checked={Boolean(h.critical)} onChange={() => toggleCritical(h)} />
                  </label>
                </td>
                <td>
                  {h.lastInstall
                    ? <span className={`badge badge-${h.lastInstall.ok ? 'ok' : 'crit'}`}><span className="dot" />{h.lastInstall.agentId}</span>
                    : <span className="faint infra-cell-empty">—</span>}
                </td>
                <td>
                  <div className="infra-row-actions">
                    <span className="btn-outline infra-action-btn" onClick={() => setInstallTarget(h)}>Installer un agent</span>
                    <span className="btn-outline infra-action-btn" onClick={() => setServicesTarget(h)}>Services</span>
                    <span className="btn-outline infra-action-btn infra-action-btn-danger" onClick={() => remove(h.id)}>Retirer</span>
                  </div>
                </td>
              </tr>
            )}
          />
        </Panel>
      </div>

      {formOpen && <HostFormDialog onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); hosts.reload(); }} />}
      {installTarget && <InstallAgentDialog host={installTarget} onClose={() => setInstallTarget(null)} onInstalled={() => { setInstallTarget(null); hosts.reload(); }} />}
      {servicesTarget && <HostServicesDialog host={servicesTarget} policy={updatePolicy.data?.policy} onClose={() => setServicesTarget(null)} />}
    </>
  );
}
