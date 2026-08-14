import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DiffView from '../../components/ui/DiffView.jsx';
import Icon from '../../components/ui/Icon.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// GitOps Diff : ce qu'Argo CD a déjà calculé lui-même (managed-resources) —
// pour chaque ressource qu'il gère, l'état déclaré par Git (targetState) et
// l'état réel du cluster (liveState). Pas de diff YAML fabriqué côté
// console : c'est le même calcul qu'Argo CD utilise pour son propre badge
// "OutOfSync", juste affiché lisiblement.
export default function GitOpsDiffPanel({ linkId, span }) {
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
      actions={outOfSync.length > 0 && (
        <span className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tone-warn-fg)' }} onClick={() => setConfirmSync(true)}>
          <Icon name="sync" size={13} />Synchroniser {outOfSync.length} ressource(s)
        </span>
      )}
    >
      <div style={{ padding: 16 }}>
        {loading && <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>}
        {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
        {!loading && !error && items.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>Aucune ressource gérée par Argo CD pour cette application.</div>}

        {!loading && items.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 12.5 }}>
              <span className={`badge badge-${outOfSync.length === 0 ? 'ok' : 'warn'}`}>
                <span className="dot" />{outOfSync.length === 0 ? 'Synchronisé' : `${outOfSync.length} / ${items.length} hors synchronisation`}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((r) => {
                const key = `${r.kind}/${r.namespace}/${r.name}`;
                const isOpen = expanded === key;
                return (
                  <div key={key} style={{ border: '1px solid var(--border-soft)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', background: 'var(--surface-2, var(--bg))' }}
                    >
                      <span className={`badge badge-${r.outOfSync ? 'warn' : 'ok'}`} style={{ flex: 'none' }}>{r.outOfSync ? 'Hors sync' : 'OK'}</span>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{r.kind}</span>
                      <span className="mono faint" style={{ fontSize: 12, flex: 1 }}>{r.namespace ? `${r.namespace}/` : ''}{r.name}</span>
                      <Icon name="chevronDown" size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease', color: 'var(--text-faint)' }} />
                    </div>
                    {isOpen && (
                      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-soft)' }}>
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
