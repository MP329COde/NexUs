import { useEffect, useRef, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import RotationCountdown from '../../components/vault/RotationCountdown.jsx';
import './VaultPanel.css';

const EMPTY_DEV_FORM = { label: '', username: '', secret: '', url: '', notes: '' };
const EMPTY_PROD_FORM = { label: '', username: '', url: '', notes: '', rotationMinutes: '' };

// Icône selon le schéma de l'URL d'accès (ssh://, rdp://, http(s)://...) —
// purement indicative, aucune analyse de sécurité de l'URL n'est faite ici.
function accessIcon(url) {
  if (/^ssh:\/\//i.test(url)) return 'terminal';
  if (/^rdp:\/\//i.test(url)) return 'server';
  return 'externalLink';
}

// Gestionnaire de mots de passe à deux niveaux : mots de passe dev (machines
// de test partagées, lisibles par tout développeur) et mots de passe prod
// (générés automatiquement côté serveur, réservés aux admins, révélés
// seulement après avoir retapé son propre mot de passe). Chaque entrée peut
// porter une URL d'accès (SSH, RDP, console web...) pour ouvrir directement
// la machine concernée, sans jongler entre le coffre et un terminal.
export default function VaultPanel({ refreshKey }) {
  const { user } = useAuth();
  return (
    <>
      <VaultTier tier="dev" title="Mots de passe dev" sub="Accès aux machines de test/dev — visible par tous les développeurs" canManage={user?.role === 'admin'} refreshKey={refreshKey} />
      {user?.role === 'admin' && (
        <VaultTier tier="prod" title="Mots de passe production" sub="Générés automatiquement (256 caractères), révélés après triple vérification" canManage requireStepUp tripleVerify refreshKey={refreshKey} />
      )}
    </>
  );
}

function VaultTier({ tier, title, sub, canManage, requireStepUp, tripleVerify, refreshKey }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/vault/${tier}`), [refreshKey]);
  const [form, setForm] = useState(tier === 'dev' ? EMPTY_DEV_FORM : EMPTY_PROD_FORM);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(null); // { id, label } en attente de mot de passe
  const [revealStep, setRevealStep] = useState(1); // triple vérification prod : 1 avertissement, 2 mot de passe, 3 confirmation finale
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [revealed, setRevealed] = useState({}); // { [id]: { secret, rotatesAt, secretVersion } }
  const [editing, setEditing] = useState(null); // entrée en cours d'édition (métadonnées seulement)
  // Mot de passe conservé en mémoire (jamais persisté) le temps que le
  // panneau reste ouvert, pour permettre la ré-révélation silencieuse à
  // chaque rotation sans redemander le mot de passe à chaque fois — "rester
  // connecté au projet pour continuer à visualiser les mots de passe".
  const sessionPasswordsRef = useRef({});

  useEffect(() => () => { sessionPasswordsRef.current = {}; }, []);

  const items = data?.items || [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/vault/${tier}`, form);
      notify(`${form.label} ajouté`, { type: 'ok' });
      setForm(tier === 'dev' ? EMPTY_DEV_FORM : EMPTY_PROD_FORM);
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

  async function remove(entry) {
    if (!confirm(`Supprimer "${entry.label}" du coffre ?`)) return;
    await api.del(`/vault/${entry.id}`);
    setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
    notify('Entrée supprimée', { type: 'info' });
    reload();
  }

  async function doReveal(entry, currentPassword, silent) {
    try {
      const res = await api.post(`/vault/${entry.id}/reveal`, currentPassword ? { currentPassword } : {});
      setRevealed((r) => ({ ...r, [entry.id]: { secret: res.secret, rotatesAt: res.rotatesAt, secretVersion: res.secretVersion } }));
      if (currentPassword) sessionPasswordsRef.current[entry.id] = currentPassword;
      if (!silent) {
        setRevealing(null);
        setStepUpPassword('');
        setRevealStep(1);
        setConfirmChecked(false);
      }
    } catch (err) {
      if (silent) {
        // La ré-authentification en mémoire a expiré (session déconnectée) —
        // on masque le secret plutôt que d'insister silencieusement.
        setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
        delete sessionPasswordsRef.current[entry.id];
      } else {
        notify(err.message, { type: 'crit' });
      }
    }
  }

  function silentRefresh(entry) {
    const pw = sessionPasswordsRef.current[entry.id];
    doReveal(entry, pw, true);
  }

  function startReveal(entry) {
    if (requireStepUp) {
      setRevealing(entry);
      setRevealStep(1);
      setConfirmChecked(false);
    } else doReveal(entry);
  }

  async function copy(secret) {
    await navigator.clipboard.writeText(secret);
    notify('Copié dans le presse-papiers', { type: 'ok' });
  }

  function openAccess(entry) {
    window.open(entry.url, '_blank', 'noreferrer');
  }

  return (
    <Panel title={title} sub={sub} span={canManage ? 6 : 12}>
      <div className="vault-list">
        {items.length === 0 && <div className="faint vault-empty">Aucune entrée</div>}
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

      {revealing && !tripleVerify && (
        <Modal title={`Révéler « ${revealing.label} »`} sub="Ré-authentification requise" onClose={() => { setRevealing(null); setStepUpPassword(''); }} width={380}>
          <form onSubmit={(e) => { e.preventDefault(); doReveal(revealing, stepUpPassword); }} className="vault-modal-form">
            <input
              className="input vault-stepup-input" type="password" autoFocus autoComplete="off" placeholder="Votre mot de passe"
              value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)}
            />
            <div className="vault-modal-actions">
              <span className="btn-outline" onClick={() => { setRevealing(null); setStepUpPassword(''); }}>Annuler</span>
              <button className="btn" type="submit">Confirmer</button>
            </div>
          </form>
        </Modal>
      )}

      {revealing && tripleVerify && (
        <Modal title={`Révéler « ${revealing.label} »`} sub={`Secret de production — étape ${revealStep} / 3`} onClose={() => setRevealing(null)} width={420}>
          {revealStep === 1 && (
            <>
              <div className="vault-warning-box">
                <Icon name="alertTriangle" size={16} className="vault-warning-icon" />
                <p className="vault-warning-text">Ceci est un secret de <strong>production</strong>. Ne le révélez que si vous en avez réellement besoin maintenant.</p>
              </div>
              <div className="vault-modal-actions-spaced">
                <span className="btn-outline" onClick={() => setRevealing(null)}>Annuler</span>
                <button className="btn" onClick={() => setRevealStep(2)}>Continuer</button>
              </div>
            </>
          )}
          {revealStep === 2 && (
            <form onSubmit={(e) => { e.preventDefault(); setRevealStep(3); }} className="vault-modal-form">
              <input className="input vault-stepup-input" type="password" autoFocus autoComplete="off" placeholder="Votre mot de passe" value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)} />
              <div className="vault-modal-actions">
                <span className="btn-outline" onClick={() => setRevealing(null)}>Annuler</span>
                <button className="btn" type="submit">Suivant</button>
              </div>
            </form>
          )}
          {revealStep === 3 && (
            <form onSubmit={(e) => { e.preventDefault(); doReveal(revealing, stepUpPassword); }}>
              <label className="vault-confirm-checkbox">
                <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                Je confirme accéder à ce secret de production pour une raison légitime.
              </label>
              <div className="vault-modal-actions-spaced">
                <span className="btn-outline" onClick={() => setRevealing(null)}>Annuler</span>
                <button className="btn" type="submit" disabled={!confirmChecked}>Révéler définitivement</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {canManage && (
        <form onSubmit={create} autoComplete="off" className="vault-create-form">
          <input className="input vault-create-field-label" autoComplete="off" placeholder="Nom (ex. VM test devops-1)" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <input className="input vault-create-field-username" autoComplete="off" placeholder="Utilisateur (optionnel)" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          {tier === 'dev' && (
            <input className="input vault-create-field-secret" type="password" autoComplete="new-password" placeholder="Mot de passe" required value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} />
          )}
          <input className="input vault-create-field-url" autoComplete="off" placeholder="URL d'accès (optionnel) — ssh://…" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          {tier === 'prod' && (
            <select
              className="input vault-create-field-rotation" value={form.rotationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, rotationMinutes: e.target.value }))}
              title="Rotation automatique du secret"
            >
              <option value="">Pas de rotation auto</option>
              <option value="2">Rotation toutes les 2 min</option>
              <option value="3">Rotation toutes les 3 min</option>
              <option value="4">Rotation toutes les 4 min</option>
              <option value="5">Rotation toutes les 5 min</option>
            </select>
          )}
          <button className="btn vault-create-submit" type="submit" disabled={busy}>
            {busy ? 'Ajout…' : tier === 'prod' ? 'Générer & ajouter' : 'Ajouter'}
          </button>
        </form>
      )}
    </Panel>
  );
}
