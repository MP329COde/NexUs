import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const STATES = ['ready', 'drain', 'maint'];

export default function HAProxyPage() {
  const status = useApi(() => api.get('/haproxy/status'), [], { pollMs: 30000 });
  const backends = useApi(() => api.get('/haproxy/backends'), [], { pollMs: 20000 });
  const [selected, setSelected] = useState(null);
  const servers = useApi(() => (selected ? api.get(`/haproxy/backends/${selected}/servers/runtime`) : Promise.resolve(null)), [selected], { pollMs: 10000 });
  const notify = useNotify();

  if (status.data && !status.data.status.configured) {
    return (
      <>
        <PageHeader title="HAProxy" sub="Backends, serveurs et bascule d'état à chaud" />
        <div className="card"><EmptyState title="HAProxy n'est pas configuré" hint="Renseignez l'URL de la Data Plane API depuis Paramètres → HAProxy." /></div>
      </>
    );
  }

  async function setState(backend, server, state) {
    try {
      const res = await api.post(`/haproxy/backends/${backend}/servers/${server}/state`, { state });
      notify(res.message, { type: 'ok' });
      servers.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader title="HAProxy" sub={status.data?.status?.message} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Backends" sub="Cliquez sur un backend pour voir ses serveurs" span={12}>
          <DataTable
            columns={['Nom', 'Mode', 'Répartition', '']}
            rows={backends.data?.items}
            emptyTitle="Aucun backend"
            renderRow={(b) => (
              <tr key={b.name} onClick={() => setSelected(b.name)} style={{ cursor: 'pointer', background: selected === b.name ? 'var(--primary-soft)' : undefined }}>
                <td style={{ fontWeight: 500 }}>{b.name}</td>
                <td>{b.mode}</td>
                <td className="mono muted">{b.balance}</td>
                <td><span style={{ fontSize: 12, color: 'var(--primary)' }}>Voir les serveurs →</span></td>
              </tr>
            )}
          />
        </Panel>

        {selected && (
          <Panel title={`Serveurs · ${selected}`} sub="Bascule d'état en temps réel (ready / drain / maint)" span={12}>
            <DataTable
              columns={['Serveur', 'État admin', 'État opérationnel', 'Actions']}
              rows={servers.data?.items}
              emptyTitle="Aucun serveur"
              renderRow={(s) => (
                <tr key={s.name}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><span className={`badge badge-${s.adminState === 'ready' ? 'ok' : s.adminState === 'drain' ? 'warn' : 'crit'}`}><span className="dot" />{s.adminState}</span></td>
                  <td className="mono muted">{s.operationalState}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {STATES.filter((st) => st !== s.adminState).map((st) => (
                        <span key={st} className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => setState(selected, s.name, st)}>{st}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
