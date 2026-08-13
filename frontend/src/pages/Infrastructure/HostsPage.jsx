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

export default function HostsPage() {
  const publicKey = useApi(() => api.get('/hosts/ssh-public-key'), []);
  const hosts = useApi(() => api.get('/hosts'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState(null);
  const notify = useNotify();

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
          <button className="btn" onClick={() => setFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="plus" size={15} />Ajouter un hôte
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Clé publique de la console" sub="À copier dans ~/.ssh/authorized_keys de chaque hôte à gérer (utilisateur configuré ci-dessous)" span={12}>
          <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <code className="mono" style={{ flex: 1, fontSize: 11.5, background: 'var(--border-soft)', padding: 10, borderRadius: 8, wordBreak: 'break-all', display: 'block' }}>
              {publicKey.data?.publicKey || '…'}
            </code>
            <span className="btn-outline" style={{ height: 34, padding: '0 12px', flex: 'none' }} onClick={copyKey}>Copier</span>
          </div>
        </Panel>

        <Panel title="Hôtes gérés" span={12}>
          <DataTable
            columns={['Nom', 'Adresse', 'Rôle', 'Critique', 'Dernière installation', 'Actions']}
            rows={hosts.data?.items}
            emptyTitle="Aucun hôte enregistré"
            emptyHint="Ajoutez un hôte pour pouvoir y installer un agent depuis le catalogue."
            renderRow={(h) => (
              <tr key={h.id}>
                <td style={{ fontWeight: 500 }}>{h.name}</td>
                <td className="mono muted">{h.address}:{h.port}</td>
                <td>
                  <input
                    className="input"
                    defaultValue={h.role || ''}
                    onBlur={(e) => saveRole(h, e.target.value)}
                    placeholder="Rôle"
                    style={{ height: 26, fontSize: 11.5, padding: '0 8px', width: 150 }}
                  />
                </td>
                <td>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(h.critical)} onChange={() => toggleCritical(h)} />
                  </label>
                </td>
                <td>
                  {h.lastInstall
                    ? <span className={`badge badge-${h.lastInstall.ok ? 'ok' : 'crit'}`}><span className="dot" />{h.lastInstall.agentId}</span>
                    : <span className="faint" style={{ fontSize: 12.5 }}>—</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => setInstallTarget(h)}>Installer un agent</span>
                    <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => remove(h.id)}>Retirer</span>
                  </div>
                </td>
              </tr>
            )}
          />
        </Panel>
      </div>

      {formOpen && <HostFormDialog onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); hosts.reload(); }} />}
      {installTarget && <InstallAgentDialog host={installTarget} onClose={() => setInstallTarget(null)} onInstalled={() => { setInstallTarget(null); hosts.reload(); }} />}
    </>
  );
}
