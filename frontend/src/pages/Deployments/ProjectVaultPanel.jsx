import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const EMPTY_FORM = { label: '', username: '', secret: '', notes: '' };

// Coffre-fort propre à un projet : secrets partagés entre ses membres
// (base de données de staging du projet, clé API tierce...), distincts des
// mots de passe dev/prod globaux de Secrets & variables. La révélation exige
// de retaper son mot de passe (voir /vault/:id/reveal, projects.routes.js
// pour la vérification d'appartenance au projet).
export default function ProjectVaultPanel({ project, canManage }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/projects/${project.id}/vault`), [project.id]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [revealed, setRevealed] = useState({});

  const items = data?.items || [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/projects/${project.id}/vault`, form);
      notify(`${form.label} ajouté au coffre-fort du projet`, { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    if (!confirm(`Supprimer « ${entry.label} » du coffre-fort ?`)) return;
    await api.del(`/vault/${entry.id}`);
    setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
    notify('Entrée supprimée', { type: 'info' });
    reload();
  }

  async function doReveal(entry) {
    try {
      const res = await api.post(`/vault/${entry.id}/reveal`, { currentPassword: stepUpPassword });
      setRevealed((r) => ({ ...r, [entry.id]: res.secret }));
      setRevealing(null);
      setStepUpPassword('');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function copy(secret) {
    await navigator.clipboard.writeText(secret);
    notify('Copié dans le presse-papiers', { type: 'ok' });
  }

  return (
    <Panel
      title={(<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="lock" size={13} style={{ color: 'var(--text-faint)' }} />Coffre-fort du projet</span>)}
      sub="Secrets partagés entre les membres — révélation protégée par mot de passe"
      span={12}
      actions={canManage && (
        <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setFormOpen(true)}>
          <Icon name="plus" size={13} />Ajouter un secret
        </span>
      )}
    >
      {items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun secret dans ce coffre-fort</div>
      ) : (
        <div style={{ padding: 6 }}>
          {items.map((entry) => (
            <div key={entry.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{entry.label}</div>
                  <div className="faint" style={{ fontSize: 11 }}>{entry.username || '—'}</div>
                </div>
                {revealed[entry.id] === undefined ? (
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => setRevealing(entry)}>
                    <Icon name="shield" size={12} /> Révéler
                  </span>
                ) : (
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => copy(revealed[entry.id])}>
                    <Icon name="copy" size={12} /> Copier
                  </span>
                )}
                {canManage && (
                  <span className="btn-outline" style={{ height: 26, padding: '0 8px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => remove(entry)}>
                    <Icon name="trash" size={12} />
                  </span>
                )}
              </div>
              {revealed[entry.id] !== undefined && (
                <div className="mono" style={{ marginTop: 6, fontSize: 11, padding: '6px 8px', background: 'var(--border-soft)', borderRadius: 6, wordBreak: 'break-all' }}>
                  {revealed[entry.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {revealing && (
        <Modal title={`Révéler « ${revealing.label} »`} sub="Ré-authentification requise" onClose={() => { setRevealing(null); setStepUpPassword(''); }} width={380}>
          <form onSubmit={(e) => { e.preventDefault(); doReveal(revealing); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="input" type="password" autoFocus autoComplete="off" placeholder="Votre mot de passe"
              value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)}
              style={{ height: 34, fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => { setRevealing(null); setStepUpPassword(''); }}>Annuler</span>
              <button className="btn" type="submit">Confirmer</button>
            </div>
          </form>
        </Modal>
      )}

      {formOpen && (
        <Modal title="Ajouter un secret" sub={`Coffre-fort de « ${project.name} »`} onClose={() => setFormOpen(false)} width={440}>
          <form onSubmit={create} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Nom</label>
              <input className="input" autoComplete="off" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Base de données staging" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Utilisateur (optionnel)</label>
              <input className="input" autoComplete="off" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Secret</label>
              <input className="input" type="password" autoComplete="new-password" required value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
