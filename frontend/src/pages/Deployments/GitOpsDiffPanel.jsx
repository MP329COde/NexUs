import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DiffView from '../../components/ui/DiffView.jsx';
import Icon from '../../components/ui/Icon.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import './GitOpsDiffPanel.css';

// GitOps Diff : ce qu'Argo CD a déjà calculé lui-même (managed-resources) —
// pour chaque ressource qu'il gère, l'état déclaré par Git (targetState) et
// l'état réel du cluster (liveState). Pas de diff YAML fabriqué côté
// console : c'est le même calcul qu'Argo CD utilise pour son propre badge
// "OutOfSync", juste affiché lisiblement.
export default function GitOpsDiffPanel({ linkId, span }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.get(`/deployments/${linkId}/gitops-diff`), [linkId]);
  const [expanded, setExpanded] = useState(null);
  const [confirmSync, setConfirmSync] = useState(false);
  const notify = useNotify();

  const items = data?.items || [];
  const outOfSync = items.filter((r) => r.outOfSync);

  return (
    <Panel
      title="GitOps Diff"
      sub="Git (déclaré) vs Kubernetes (réel), calculé par Argo CD"
      span={span}
      actions={outOfSync.length > 0 && user?.role === 'admin' && (
        <span className="btn-outline gdp-sync-btn" onClick={() => setConfirmSync(true)}>
          <Icon name="sync" size={13} />Synchroniser {outOfSync.length} ressource(s)
        </span>
      )}
    >
      <div className="gdp-body">
        {loading && <div className="faint gdp-loading">Chargement…</div>}
        {error && <div className="gdp-error">{error}</div>}
        {!loading && !error && items.length === 0 && <div className="faint gdp-empty">Aucune ressource gérée par Argo CD pour cette application.</div>}

        {!loading && items.length > 0 && (
          <>
            <div className="gdp-status-row">
              <span className={`badge badge-${outOfSync.length === 0 ? 'ok' : 'warn'}`}>
                <span className="dot" />{outOfSync.length === 0 ? 'Synchronisé' : `${outOfSync.length} / ${items.length} hors synchronisation`}
              </span>
            </div>
            <div className="gdp-list">
              {items.map((r) => {
                const key = `${r.kind}/${r.namespace}/${r.name}`;
                const isOpen = expanded === key;
                return (
                  <div key={key} className="gdp-item">
                    <div
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="gdp-item-head"
                    >
                      <span className={`badge badge-${r.outOfSync ? 'warn' : 'ok'} gdp-item-badge`}>{r.outOfSync ? 'Hors sync' : 'OK'}</span>
                      <span className="mono gdp-item-kind">{r.kind}</span>
                      <span className="mono faint gdp-item-name">{r.namespace ? `${r.namespace}/` : ''}{r.name}</span>
                      <Icon name="chevronDown" size={13} className={`gdp-item-chevron${isOpen ? ' gdp-item-chevron-open' : ''}`} />
                    </div>
                    {isOpen && (
                      <div className="gdp-item-body">
                        <DiffView
                          oldText={JSON.stringify(r.liveState, null, 2)}
                          newText={JSON.stringify(r.targetState, null, 2)}
                          context={3}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {confirmSync && (
        <ActionConfirmModal
          title="Synchroniser Argo CD"
          sub={`${outOfSync.length} ressource(s) hors synchronisation`}
          tone="warn"
          confirmLabel="Synchroniser"
          impact={outOfSync.map((r) => `${r.kind} ${r.namespace ? `${r.namespace}/` : ''}${r.name} — applique l'état Git au cluster`)}
          onClose={() => setConfirmSync(false)}
          onConfirm={async () => {
            const res = await api.post(`/deployments/${linkId}/sync`, {});
            notify(res.message, { type: 'ok', title: 'Argo CD' });
            reload();
          }}
        />
      )}
    </Panel>
  );
}
