import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import Icon from '../../components/ui/Icon.jsx';
import ProxyFormDialog from './ProxyFormDialog.jsx';
import AttachFrontendDialog from './AttachFrontendDialog.jsx';
import './NetworkPage.css';

export default function NetworkPage() {
  const proxies = useApi(() => api.get('/proxies'), [], { pollMs: 20000 });
  const domains = useApi(() => api.get('/domains'), [], { pollMs: 30000 });
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [attaching, setAttaching] = useState(null);
  const notify = useNotify();

  async function apply(id) {
    try {
      const res = await api.post(`/proxies/${id}/apply`, {});
      notify(res.message, { type: 'ok', title: 'Proxy appliqué' });
    } catch (err) {
      notify(err.message, { type: 'crit', title: "Échec de l'application" });
    } finally {
      proxies.reload();
    }
  }

  async function testConnection(id) {
    const res = await api.post(`/proxies/${id}/test`, {});
    if (res.result.ok) notify(`${res.result.statusCode} · ${res.result.latencyMs} ms`, { type: 'ok', title: 'Connexion réussie' });
    else notify(res.result.error, { type: 'crit', title: 'Connexion impossible' });
  }

  async function remove(id) {
    if (!confirm('Supprimer ce proxy ?')) return;
    await api.del(`/proxies/${id}`);
    notify('Proxy supprimé', { type: 'info' });
    proxies.reload();
    domains.reload();
  }

  async function toggleCritical(p) {
    await api.post(`/proxies/${p.id}/critical`, { critical: !p.critical });
    proxies.reload();
  }

  return (
    <>
      <PageHeader
        title="Réseaux"
        sub="Reverse proxies, domaines, TLS et routage vers vos services"
        actions={(
          <button className="btn network-header-action" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Icon name="plus" size={15} />Nouveau proxy
          </button>
        )}
      />

      <div className="network-panel-grid">
        <Panel title="Reverse proxies" sub="Gérés depuis la console (Traefik ou HAProxy)" span={12}>
          <DataTable
            columns={['Nom', 'Domaine', 'Cible', 'Moteur', 'TLS', 'Statut', 'Important', 'Actions']}
            rows={proxies.data?.items}
            emptyTitle="Aucun proxy configuré"
            emptyHint="Créez votre premier proxy pour exposer un service derrière un domaine."
            renderRow={(p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="mono">{p.domain}</td>
                <td className="mono muted">{p.targetService}:{p.targetPort}</td>
                <td>{p.engine}</td>
                <td>{p.tls ? 'Oui' : 'Non'}</td>
                <td>
                  <span className={`badge badge-${p.status === 'applied' ? 'ok' : p.status === 'error' ? 'crit' : 'mut'}`}>
                    <span className="dot" />{p.status}
                  </span>
                </td>
                <td>
                  <label className="network-critical-toggle" title="Affiché dans la disponibilité 24h de l'accueil">
                    <input type="checkbox" checked={Boolean(p.critical)} onChange={() => toggleCritical(p)} />
                  </label>
                </td>
                <td>
                  <div className="network-row-actions">
                    <span className="btn-outline network-action-btn" onClick={() => { setEditing(p); setFormOpen(true); }}><Icon name="edit" size={13} />Modifier</span>
                    <span className="btn-outline network-action-btn" onClick={() => apply(p.id)}><Icon name="sync" size={13} />Appliquer</span>
                    {p.engine === 'haproxy' && (
                      <span className="btn-outline network-action-btn" onClick={() => setAttaching(p)}><Icon name="gitBranch" size={13} />Frontend</span>
                    )}
                    <span className="btn-outline network-action-btn" onClick={() => testConnection(p.id)}><Icon name="externalLink" size={13} />Tester</span>
                    <span className="btn-outline network-action-btn network-action-btn-danger" onClick={() => remove(p.id)}><Icon name="trash" size={13} />Suppr.</span>
                  </div>
                </td>
              </tr>
            )}
          />
        </Panel>

        <Panel title="Domaines" sub="Vue agrégée domaine → proxy → certificat" span={12}>
          <DataTable
            columns={['Domaine', 'Proxy', 'TLS', 'Certificat']}
            rows={domains.data?.items}
            emptyTitle="Aucun domaine suivi"
            renderRow={(d) => (
              <tr key={d.domain}>
                <td className="mono">{d.domain}</td>
                <td>{d.proxyName}</td>
                <td>{d.tls ? 'Oui' : 'Non'}</td>
                <td>
                  {d.certificate
                    ? <span className={`badge badge-${d.certificate.ready ? 'ok' : 'warn'}`}><span className="dot" />{d.certificate.name}</span>
                    : <span className="faint network-cert-empty">—</span>}
                </td>
              </tr>
            )}
          />
        </Panel>
      </div>

      {formOpen && (
        <ProxyFormDialog
          proxy={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); proxies.reload(); domains.reload(); }}
        />
      )}

      {attaching && <AttachFrontendDialog proxy={attaching} onClose={() => setAttaching(null)} />}
    </>
  );
}
