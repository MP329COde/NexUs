import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import ProxyFormDialog from './ProxyFormDialog.jsx';

export default function NetworkPage() {
  const proxies = useApi(() => api.get('/proxies'), [], { pollMs: 20000 });
  const domains = useApi(() => api.get('/domains'), [], { pollMs: 30000 });
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  async function apply(id) {
    try {
      const res = await api.post(`/proxies/${id}/apply`, {});
      alert(res.message);
    } catch (err) {
      alert(err.message);
    } finally {
      proxies.reload();
    }
  }

  async function testConnection(id) {
    const res = await api.post(`/proxies/${id}/test`, {});
    alert(res.result.ok ? `OK · ${res.result.statusCode} · ${res.result.latencyMs} ms` : `Échec · ${res.result.error}`);
  }

  async function remove(id) {
    if (!confirm('Supprimer ce proxy ?')) return;
    await api.del(`/proxies/${id}`);
    proxies.reload();
    domains.reload();
  }

  return (
    <>
      <PageHeader
        title="Réseaux"
        sub="Reverse proxies, domaines, TLS et routage vers vos services"
        actions={<button className="btn" onClick={() => { setEditing(null); setFormOpen(true); }}>Nouveau proxy</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Reverse proxies" sub="Gérés depuis la console (Traefik ou HAProxy)" span={12}>
          <DataTable
            columns={['Nom', 'Domaine', 'Cible', 'Moteur', 'TLS', 'Statut', 'Actions']}
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
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="btn-outline miniBtn" style={btnMini} onClick={() => { setEditing(p); setFormOpen(true); }}>Modifier</span>
                    <span className="btn-outline miniBtn" style={btnMini} onClick={() => apply(p.id)}>Appliquer</span>
                    <span className="btn-outline miniBtn" style={btnMini} onClick={() => testConnection(p.id)}>Tester</span>
                    <span className="btn-outline miniBtn" style={{ ...btnMini, color: 'var(--tone-crit-fg)' }} onClick={() => remove(p.id)}>Suppr.</span>
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
                    : <span className="faint" style={{ fontSize: 12.5 }}>—</span>}
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
    </>
  );
}

const btnMini = { height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center' };
