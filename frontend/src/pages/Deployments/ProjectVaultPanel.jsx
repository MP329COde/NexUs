import { useEffect, useRef, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import RotationCountdown from '../../components/vault/RotationCountdown.jsx';

const EMPTY_FORM = { label: '', username: '', secret: '', url: '', notes: '', rotationMinutes: '' };

function accessIcon(url) {
  if (/^ssh:\/\//i.test(url)) return 'terminal';
  if (/^rdp:\/\//i.test(url)) return 'server';
  return 'externalLink';
}

// Coffre-fort propre à un projet : secrets partagés entre ses membres
// (base de données de staging du projet, clé API tierce, accès à la machine
// de dev du projet...), distincts des mots de passe dev/prod globaux de
// Secrets & variables. La révélation exige de retaper son mot de passe (voir
// /vault/:id/reveal, projects.routes.js pour la vérification d'appartenance
// au projet). Une URL d'accès optionnelle permet d'ouvrir directement la
// cible (SSH, RDP, console web) au lieu de simplement stocker un mot de passe.
export default function ProjectVaultPanel({ project, canManage }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/projects/${project.id}/vault`), [project.id]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [revealed, setRevealed] = useState({}); // { [id]: { secret, rotatesAt, secretVersion } }
  const [editing, setEditing] = useState(null);
  const sessionPasswordsRef = useRef({});

  useEffect(() => () => { sessionPasswordsRef.current = {}; }, []);

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

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/vault/${editing.id}`, { label: editing.label, username: editing.username, url: editing.url, notes: editing.notes });
      notify('Entrée mise à jour', { type: 'ok' });
      setEditing(null);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  function openAccess(entry) {
    window.open(entry.url, '_blank', 'noreferrer');
  }

  async function remove(entry) {
    if (!confirm(`Supprimer « ${entry.label} » du coffre-fort ?`)) return;
    await api.del(`/vault/${entry.id}`);
    setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
    notify('Entrée supprimée', { type: 'info' });
    reload();
  }

  async function doReveal(entry, currentPassword = stepUpPassword, silent) {
    try {
      const res = await api.post(`/vault/${entry.id}/reveal`, { currentPassword });
      setRevealed((r) => ({ ...r, [entry.id]: { secret: res.secret, rotatesAt: res.rotatesAt, secretVersion: res.secretVersion } }));
      if (currentPassword) sessionPasswordsRef.current[entry.id] = currentPassword;
      if (!silent) {
        setRevealing(null);
        setStepUpPassword('');
      }
    } catch (err) {
      if (silent) {
        setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
        delete sessionPasswordsRef.current[entry.id];
      } else {
        notify(err.message, { type: 'crit' });
      }
    }
  }

  function silentRefresh(entry) {
    doReveal(entry, sessionPasswordsRef.current[entry.id], true);
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
                  {entry.url && (
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{entry.url}</div>
                  )}
                </div>
                {entry.url && (
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => openAccess(entry)} title="Ouvrir un accès direct">
                    <Icon name={accessIcon(entry.url)} size={12} /> Ouvrir
                  </span>
                )}
                {revealed[entry.id] === undefined ? (
                  <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => setRevealing(entry)}>
                    <Icon name="shield" size={12} /> Révéler
                  </span>
                ) : (
                  <>
                    <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => copy(revealed[entry.id].secret)}>
                      <Icon name="copy" size={12} /> Copier
                    </span>
                    <span
                      className="btn-outline" title="Masquer" style={{ height: 26, padding: '0 8px', fontSize: 11.5 }}
                      onClick={() => { setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; }); delete sessionPasswordsRef.current[entry.id]; }}
                    >
                      <Icon name="eyeOff" size={12} />
                    </span>
                  </>
                )}
                {canManage && (
                  <>
                    <span className="btn-outline" style={{ height: 26, padding: '0 8px', fontSize: 11.5 }} onClick={() => setEditing({ id: entry.id, label: entry.label, username: entry.username || '', url: entry.url || '', notes: entry.notes || '' })}>
                      <Icon name="edit" size={12} />
                    </span>
                    <span className="btn-outline" style={{ height: 26, padding: '0 8px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => remove(entry)}>
                      <Icon name="trash" size={12} />
                    </span>
                  </>
                )}
              </div>
              {revealed[entry.id] !== undefined && (
                <div className="mono" style={{ marginTop: 6, fontSize: 11, padding: '6px 8px', background: 'var(--border-soft)', borderRadius: 6, wordBreak: 'break-all', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{revealed[entry.id].secret}</span>
                  {revealed[entry.id].rotatesAt && (
                    <RotationCountdown rotatesAt={revealed[entry.id].rotatesAt} onDue={() => silentRefresh(entry)} />
                  )}
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

      {editing && (
        <Modal title={`Modifier « ${editing.label} »`} sub="Le secret lui-même ne peut pas être changé ici — supprimez puis recréez l'entrée." onClose={() => setEditing(null)} width={420}>
          <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Nom</label>
              <input className="input" required value={editing.label} onChange={(e) => setEditing((s) => ({ ...s, label: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Utilisateur</label>
              <input className="input" value={editing.username} onChange={(e) => setEditing((s) => ({ ...s, username: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>URL / hôte d'accès</label>
              <input className="input" value={editing.url} onChange={(e) => setEditing((s) => ({ ...s, url: e.target.value }))} placeholder="ssh://user@10.0.0.12" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setEditing(null)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
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
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>URL / hôte d'accès (optionnel)</label>
              <input className="input" autoComplete="off" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="ssh://user@10.0.0.12" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Rotation automatique</label>
              <select className="input" value={form.rotationMinutes} onChange={(e) => setForm((f) => ({ ...f, rotationMinutes: e.target.value }))}>
                <option value="">Pas de rotation auto</option>
                <option value="2">Toutes les 2 min</option>
                <option value="3">Toutes les 3 min</option>
                <option value="4">Toutes les 4 min</option>
                <option value="5">Toutes les 5 min</option>
              </select>
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
