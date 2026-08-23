import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DiffView from '../../components/ui/DiffView.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './NetworkShared.css';

// Éditeur sécurisé de la config brute HAProxy (Priorité 4) : édition texte,
// validation via la Data Plane API (only_validate, aucune validation locale
// inventée), aperçu diff avant application, application avec confirmation,
// et historique/rollback appuyé sur network_config_history côté backend —
// voir routes/haproxy.routes.js.
export default function HAProxyConfigEditor() {
  const raw = useApi(() => api.get('/haproxy/config/raw'), []);
  const history = useApi(() => api.get('/haproxy/config/history'), []);
  const notify = useNotify();
  const [text, setText] = useState('');
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [pendingApply, setPendingApply] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState(null);

  useEffect(() => {
    if (raw.data?.config != null) setText(raw.data.config);
  }, [raw.data]);

  if (raw.error) {
    return (
      <>
        <PageHeader title="Éditeur HAProxy" sub="Édition sécurisée de la configuration" />
        <div className="card"><EmptyState title="HAProxy n'est pas configuré" hint="Renseignez l'URL de la Data Plane API depuis Paramètres → HAProxy." /></div>
      </>
    );
  }

  const dirty = raw.data && text !== raw.data.config;

  async function validate() {
    setValidating(true);
    setValidation(null);
    try {
      const res = await api.post('/haproxy/config/validate', { config: text });
      setValidation({ ok: true, message: res.message });
      notify(res.message, { type: 'ok' });
    } catch (err) {
      setValidation({ ok: false, message: err.message });
      notify(err.message, { type: 'crit' });
    } finally {
      setValidating(false);
    }
  }

  async function apply() {
    const res = await api.post('/haproxy/config/apply', { config: text, note: 'Édition manuelle' });
    notify(res.message, { type: 'ok', title: 'Configuration appliquée' });
    setShowDiff(false);
    raw.reload();
    history.reload();
  }

  async function rollback(entry) {
    const res = await api.post(`/haproxy/config/history/${entry.id}/rollback`, {});
    notify(res.message, { type: 'ok', title: `Retour à l'instantané #${entry.id}` });
    setRollbackTarget(null);
    raw.reload();
    history.reload();
  }

  return (
    <>
      <PageHeader
        title="Éditeur HAProxy"
        sub="haproxy.cfg — édition, validation, diff, application, rollback"
        actions={(
          <div className="net-row-actions">
            <span className="btn-outline net-action-btn" onClick={validate}>{validating ? 'Validation…' : 'Valider la syntaxe'}</span>
            <span className={`btn-outline net-action-btn${!dirty ? ' net-action-disabled' : ''}`} onClick={() => dirty && setShowDiff(true)}>Aperçu du diff</span>
            <span className={`btn net-action-btn${!dirty ? ' net-action-disabled' : ''}`} onClick={() => dirty && setPendingApply(true)}>Appliquer</span>
          </div>
        )}
      />

      {validation && (
        <div className={`card net-validation-banner net-validation-${validation.ok ? 'ok' : 'crit'}`}>{validation.message}</div>
      )}

      <div className="net-panel-grid">
        <Panel title="Configuration" sub={raw.data ? `Version courante : ${raw.data.version}` : ''} span={12}>
          <textarea
            className="mono net-config-textarea"
            spellCheck={false}
            value={text}
            onChange={(e) => { setText(e.target.value); setValidation(null); }}
            rows={24}
          />
        </Panel>

        {showDiff && (
          <Panel title="Diff avant application" sub="Version courante → version éditée" span={12}>
            <DiffView oldText={raw.data?.config || ''} newText={text} context={3} />
          </Panel>
        )}

        <Panel title="Historique" sub="Instantanés enregistrés avant chaque application — permet un rollback" span={12}>
          <DataTable
            columns={['#', 'Appliqué le', 'Par', 'Note', '']}
            rows={history.data?.items}
            emptyTitle="Aucun historique"
            renderRow={(h) => (
              <tr key={h.id}>
                <td className="mono">{h.id}</td>
                <td className="mono muted">{new Date(h.applied_at).toLocaleString('fr-FR')}</td>
                <td>{h.applied_by || '—'}</td>
                <td className="muted">{h.rollback_of ? `Rollback de #${h.rollback_of}` : h.note || '—'}</td>
                <td><span className="btn-outline net-action-btn" onClick={() => setRollbackTarget(h)}>Restaurer</span></td>
              </tr>
            )}
          />
        </Panel>
      </div>

      {pendingApply && (
        <ActionConfirmModal
          title="Appliquer la configuration HAProxy"
          sub="Cette action recharge HAProxy avec la nouvelle configuration"
          tone="warn"
          confirmLabel="Appliquer"
          impact={[
            'La configuration actuelle est sauvegardée dans l\'historique avant application.',
            'HAProxy est rechargé immédiatement (force_reload) — impact potentiel sur le trafic en cours.',
            'Une configuration invalide peut faire échouer le rechargement : validez la syntaxe avant d\'appliquer.'
          ]}
          onConfirm={apply}
          onClose={() => setPendingApply(false)}
        />
      )}

      {rollbackTarget && (
        <ActionConfirmModal
          title={`Restaurer l'instantané #${rollbackTarget.id}`}
          sub={new Date(rollbackTarget.applied_at).toLocaleString('fr-FR')}
          tone="crit"
          confirmLabel="Restaurer"
          impact={[
            'La configuration courante est d\'abord sauvegardée dans l\'historique.',
            'La configuration de cet instantané est ensuite appliquée et HAProxy rechargé.'
          ]}
          onConfirm={() => rollback(rollbackTarget)}
          onClose={() => setRollbackTarget(null)}
        />
      )}
    </>
  );
}
