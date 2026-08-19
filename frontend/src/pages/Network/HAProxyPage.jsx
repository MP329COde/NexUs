import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import CreateFrontendDialog from './CreateFrontendDialog.jsx';
import './NetworkShared.css';

const STATES = ['ready', 'drain', 'maint'];

export default function HAProxyPage() {
  const status = useApi(() => api.get('/haproxy/status'), [], { pollMs: 30000 });
  const backends = useApi(() => api.get('/haproxy/backends'), [], { pollMs: 20000 });
  const frontends = useApi(() => api.get('/haproxy/frontends'), [], { pollMs: 20000 });
  const [selected, setSelected] = useState(null);
  const [showCreateFrontend, setShowCreateFrontend] = useState(false);
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
      <PageHeader
        title="HAProxy"
        sub={status.data?.status?.message}
        actions={<span className="btn" onClick={() => setShowCreateFrontend(true)}>+ Nouveau frontend</span>}
      />
      {showCreateFrontend && (
        <CreateFrontendDialog onClose={() => setShowCreateFrontend(false)} onCreated={() => frontends.reload()} />
      )}
      <div className="net-panel-grid">
        <Panel title="Frontends" sub="Points d'écoute HAProxy" span={12}>
          <DataTable
            columns={['Nom', 'Mode']}
            rows={frontends.data?.items}
            emptyTitle="Aucun frontend"
            renderRow={(f) => (
              <tr key={f.name}>
                <td className="net-cell-name">{f.name}</td>
                <td>{f.mode}</td>
              </tr>
            )}
          />
        </Panel>

        <Panel title="Backends" sub="Cliquez sur un backend pour voir ses serveurs" span={12}>
          <DataTable
            columns={['Nom', 'Mode', 'Répartition', '']}
            rows={backends.data?.items}
            emptyTitle="Aucun backend"
            renderRow={(b) => (
              <tr key={b.name} onClick={() => setSelected(b.name)} className={`haproxy-row-selectable${selected === b.name ? ' haproxy-row-selected' : ''}`}>
                <td className="net-cell-name">{b.name}</td>
                <td>{b.mode}</td>
                <td className="mono muted">{b.balance}</td>
                <td><span className="haproxy-view-servers">Voir les serveurs →</span></td>
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
                  <td className="net-cell-name">{s.name}</td>
                  <td><span className={`badge badge-${s.adminState === 'ready' ? 'ok' : s.adminState === 'drain' ? 'warn' : 'crit'}`}><span className="dot" />{s.adminState}</span></td>
                  <td className="mono muted">{s.operationalState}</td>
                  <td>
                    <div className="net-row-actions">
                      {STATES.filter((st) => st !== s.adminState).map((st) => (
                        <span key={st} className="btn-outline net-action-btn" onClick={() => setState(selected, s.name, st)}>{st}</span>
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
