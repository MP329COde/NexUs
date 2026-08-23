import { useEffect, useRef, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import RotationCountdown from '../../components/vault/RotationCountdown.jsx';
import './VaultPanel.css';
import './ProjectVaultPanel.css';

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
export default function ProjectVaultPanel({ project, canManage, onProjectChanged }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/projects/${project.id}/vault`), [project.id]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [revealed, setRevealed] = useState({}); // { [id]: { secret, rotatesAt, secretVersion } }
  const [editing, setEditing] = useState(null);
  const [vaultPwOpen, setVaultPwOpen] = useState(false);
  const sessionPasswordsRef = useRef({});
  // Une fois le mot de passe de coffre-fort du projet saisi correctement,
  // il reste en mémoire pour le reste de la session (tant que ce panneau
  // reste monté) : "rester connecté au projet pour continuer à visualiser
  // les mots de passe", sans avoir à le retaper à chaque secret.
  const unlockedProjectPasswordRef = useRef(null);

  useEffect(() => () => { sessionPasswordsRef.current = {}; unlockedProjectPasswordRef.current = null; }, []);

  const items = data?.items || [];
  const vaultPasswordSet = Boolean(project.vaultPasswordSet);

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

  // Rotation manuelle immédiate (Lot B2) — voir POST /vault/:id/rotate.
  async function rotateNow(entry) {
    if (!confirm(`Régénérer immédiatement le secret de « ${entry.label} » ?`)) return;
    try {
      await api.post(`/vault/${entry.id}/rotate`, {});
      notify('Secret régénéré', { type: 'ok' });
      setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
      delete sessionPasswordsRef.current[entry.id];
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function doReveal(entry, password = stepUpPassword, silent) {
    try {
      const body = vaultPasswordSet ? { projectPassword: password } : { currentPassword: password };
      const res = await api.post(`/vault/${entry.id}/reveal`, body);
      setRevealed((r) => ({ ...r, [entry.id]: { secret: res.secret, rotatesAt: res.rotatesAt, secretVersion: res.secretVersion } }));
      if (password && vaultPasswordSet) unlockedProjectPasswordRef.current = password;
      else if (password) sessionPasswordsRef.current[entry.id] = password;
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
        // Mot de passe de coffre-fort projet mémorisé invalide (changé
        // entre-temps par un autre membre) : on l'oublie pour forcer une
        // nouvelle saisie plutôt que de re-échouer silencieusement en boucle.
        if (vaultPasswordSet) unlockedProjectPasswordRef.current = null;
      }
    }
  }

  function silentRefresh(entry) {
    const pw = vaultPasswordSet ? unlockedProjectPasswordRef.current : sessionPasswordsRef.current[entry.id];
    doReveal(entry, pw, true);
  }

  function startReveal(entry) {
    // Coffre déjà déverrouillé pour cette session : révélation immédiate,
    // sans re-demander le mot de passe de projet à chaque secret.
    if (vaultPasswordSet && unlockedProjectPasswordRef.current) {
      doReveal(entry, unlockedProjectPasswordRef.current);
      return;
    }
    setRevealing(entry);
  }

  async function copy(secret) {
    await navigator.clipboard.writeText(secret);
    notify('Copié dans le presse-papiers', { type: 'ok' });
  }

  return (
    <Panel
      title={(<span className="pvp-title"><Icon name="lock" size={13} className="pvp-title-icon" />Coffre-fort du projet</span>)}
      sub="Secrets partagés entre les membres — révélation protégée par mot de passe"
      span={12}
      actions={canManage && (
        <div className="pvp-header-actions">
          <span className="btn-outline pvp-header-btn" onClick={() => setVaultPwOpen(true)} title="Mot de passe de coffre-fort du projet">
            <Icon name="lock" size={13} />{vaultPasswordSet ? 'Changer le mot de passe du coffre' : 'Définir un mot de passe de coffre'}
          </span>
          <span className="btn-outline pvp-header-btn" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={13} />Ajouter un secret
          </span>
        </div>
      )}
    >
      {items.length === 0 ? (
        <div className="pvp-empty">Aucun secret dans ce coffre-fort</div>
      ) : (
        <div className="vault-list">
          {items.map((entry) => (
            <div key={entry.id} className="vault-row">
              <div className="vault-row-main">
                <div className="vault-row-info">
                  <div className="vault-row-label">{entry.label}</div>
                  <div className="faint vault-row-username">{entry.username || '—'}</div>
                  {entry.url && (
                    <div className="mono vault-row-url">{entry.url}</div>
                  )}
                </div>
                {entry.url && (
                  <span className="btn-outline vault-action-btn" onClick={() => openAccess(entry)} title="Ouvrir un accès direct">
                    <Icon name={accessIcon(entry.url)} size={12} /> Ouvrir
                  </span>
                )}
                {revealed[entry.id] === undefined ? (
                  <span className="btn-outline vault-action-btn" onClick={() => startReveal(entry)}>
                    <Icon name="shield" size={12} /> Révéler
                  </span>
                ) : (
                  <>
                    <span className="btn-outline vault-action-btn" onClick={() => copy(revealed[entry.id].secret)}>
                      <Icon name="copy" size={12} /> Copier
                    </span>
                    <span
                      className="btn-outline vault-action-btn-icon" title="Masquer"
                      onClick={() => { setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; }); delete sessionPasswordsRef.current[entry.id]; }}
                    >
                      <Icon name="eyeOff" size={12} />
                    </span>
                  </>
                )}
                {canManage && (
                  <>
                    <span className="btn-outline vault-action-btn-icon" title="Rotation immédiate" onClick={() => rotateNow(entry)}>
                      <Icon name="rotate" size={12} />
                    </span>
                    <span className="btn-outline vault-action-btn-icon" onClick={() => setEditing({ id: entry.id, label: entry.label, username: entry.username || '', url: entry.url || '', notes: entry.notes || '' })}>
                      <Icon name="edit" size={12} />
                    </span>
                    <span className="btn-outline vault-action-btn-icon vault-action-btn-danger" onClick={() => remove(entry)}>
                      <Icon name="trash" size={12} />
                    </span>
                  </>
                )}
              </div>
              {revealed[entry.id] !== undefined && (
                <div className="mono vault-revealed">
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
        <Modal
          title={`Révéler « ${revealing.label} »`}
          sub={vaultPasswordSet ? 'Mot de passe de coffre-fort du projet requis' : 'Ré-authentification requise'}
          onClose={() => { setRevealing(null); setStepUpPassword(''); }} width={380}
        >
          <form onSubmit={(e) => { e.preventDefault(); doReveal(revealing); }} className="vault-modal-form">
            <input
              className="input vault-stepup-input" type="password" autoFocus autoComplete="off"
              placeholder={vaultPasswordSet ? 'Mot de passe du coffre-fort' : 'Votre mot de passe'}
              value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)}
            />
            {vaultPasswordSet && (
              <p className="faint pvp-reveal-hint">
                Ce mot de passe reste actif pour cette page tant qu'elle reste ouverte — vous n'aurez pas à le ressaisir pour les autres secrets du projet.
              </p>
            )}
            <div className="vault-modal-actions">
              <span className="btn-outline" onClick={() => { setRevealing(null); setStepUpPassword(''); }}>Annuler</span>
              <button className="btn" type="submit">Confirmer</button>
            </div>
          </form>
        </Modal>
      )}

      {vaultPwOpen && (
        <ProjectVaultPasswordModal
          project={project}
          vaultPasswordSet={vaultPasswordSet}
          onClose={() => setVaultPwOpen(false)}
          onSaved={() => { setVaultPwOpen(false); unlockedProjectPasswordRef.current = null; setRevealed({}); reload(); onProjectChanged?.(); }}
        />
      )}

      {editing && (
        <Modal title={`Modifier « ${editing.label} »`} sub="Le secret lui-même ne peut pas être changé ici — supprimez puis recréez l'entrée." onClose={() => setEditing(null)} width={420}>
          <form onSubmit={saveEdit} className="vault-modal-form">
            <div>
              <label className="vault-field-label">Nom</label>
              <input className="input" required value={editing.label} onChange={(e) => setEditing((s) => ({ ...s, label: e.target.value }))} />
            </div>
            <div>
              <label className="vault-field-label">Utilisateur</label>
              <input className="input" value={editing.username} onChange={(e) => setEditing((s) => ({ ...s, username: e.target.value }))} />
            </div>
            <div>
              <label className="vault-field-label">URL / hôte d'accès</label>
              <input className="input" value={editing.url} onChange={(e) => setEditing((s) => ({ ...s, url: e.target.value }))} placeholder="ssh://user@10.0.0.12" />
            </div>
            <div className="vault-modal-actions">
              <span className="btn-outline" onClick={() => setEditing(null)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {formOpen && (
        <Modal title="Ajouter un secret" sub={`Coffre-fort de « ${project.name} »`} onClose={() => setFormOpen(false)} width={440}>
          <form onSubmit={create} autoComplete="off" className="vault-modal-form">
            <div>
              <label className="vault-field-label">Nom</label>
              <input className="input" autoComplete="off" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Base de données staging" />
            </div>
            <div>
              <label className="vault-field-label">Utilisateur (optionnel)</label>
              <input className="input" autoComplete="off" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="vault-field-label">Secret</label>
              <input className="input" type="password" autoComplete="new-password" required value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} />
            </div>
            <div>
              <label className="vault-field-label">URL / hôte d'accès (optionnel)</label>
              <input className="input" autoComplete="off" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="ssh://user@10.0.0.12" />
            </div>
            <div>
              <label className="vault-field-label">Rotation automatique</label>
              <select className="input" value={form.rotationMinutes} onChange={(e) => setForm((f) => ({ ...f, rotationMinutes: e.target.value }))}>
                <option value="">Pas de rotation auto</option>
                <option value="15">Toutes les 15 min</option>
                <option value="60">Toutes les heures</option>
                <option value="1440">Quotidienne</option>
                <option value="10080">Hebdomadaire</option>
                <option value="43200">Mensuelle</option>
                <option value="129600">Trimestrielle</option>
              </select>
            </div>
            <div className="vault-modal-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}

// Mot de passe de coffre-fort du projet : verrou distinct du mot de passe de
// chaque compte, partagé entre les membres pour révéler les secrets
// 'project' — voir PUT/DELETE /projects/:id/vault-password côté serveur.
function ProjectVaultPasswordModal({ project, vaultPasswordSet, onClose, onSaved }) {
  const notify = useNotify();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify('Les deux mots de passe ne correspondent pas', { type: 'crit' });
      return;
    }
    setBusy(true);
    try {
      await api.put(`/projects/${project.id}/vault-password`, { currentPassword, newPassword });
      notify('Mot de passe de coffre-fort mis à jour', { type: 'ok' });
      onSaved();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm('Retirer le mot de passe de coffre-fort ? Les secrets du projet redeviendront protégés par le mot de passe personnel de chacun.')) return;
    setBusy(true);
    try {
      await api.del(`/projects/${project.id}/vault-password`);
      notify('Mot de passe de coffre-fort retiré', { type: 'ok' });
      onSaved();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Mot de passe de coffre-fort du projet"
      sub="Requis pour révéler les secrets de ce projet — partagé entre les membres, distinct du mot de passe de chacun"
      onClose={onClose} width={420}
    >
      <form onSubmit={save} autoComplete="off" className="vault-modal-form">
        {vaultPasswordSet && (
          <div>
            <label className="vault-field-label">Mot de passe actuel</label>
            <input className="input" type="password" autoComplete="off" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
        )}
        <div>
          <label className="vault-field-label">{vaultPasswordSet ? 'Nouveau mot de passe' : 'Nouveau mot de passe de coffre-fort'}</label>
          <input className="input" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="vault-field-label">Confirmer</label>
          <input className="input" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <div className="pvp-password-actions">
          {vaultPasswordSet ? (
            <span className="btn-outline pvp-clear-btn" onClick={clear}>Retirer le mot de passe</span>
          ) : <span />}
          <div className="pvp-password-actions-right">
            <span className="btn-outline" onClick={onClose}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
