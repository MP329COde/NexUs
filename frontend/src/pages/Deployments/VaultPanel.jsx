import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const EMPTY_DEV_FORM = { label: '', username: '', secret: '', notes: '' };
const EMPTY_PROD_FORM = { label: '', username: '', notes: '' };

// Gestionnaire de mots de passe à deux niveaux : mots de passe dev (machines
// de test partagées, lisibles par tout développeur) et mots de passe prod
// (générés automatiquement côté serveur, réservés aux admins, révélés
// seulement après avoir retapé son propre mot de passe).
export default function VaultPanel() {
  const { user } = useAuth();
  return (
    <>
      <VaultTier tier="dev" title="Mots de passe dev" sub="Accès aux machines de test/dev — visible par tous les développeurs" canManage={user?.role === 'admin'} />
      {user?.role === 'admin' && (
        <VaultTier tier="prod" title="Mots de passe production" sub="Générés automatiquement (256 caractères), révélés après triple vérification" canManage requireStepUp tripleVerify />
      )}
    </>
  );
}

function VaultTier({ tier, title, sub, canManage, requireStepUp, tripleVerify }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/vault/${tier}`), []);
  const [form, setForm] = useState(tier === 'dev' ? EMPTY_DEV_FORM : EMPTY_PROD_FORM);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(null); // { id, label } en attente de mot de passe
  const [revealStep, setRevealStep] = useState(1); // triple vérification prod : 1 avertissement, 2 mot de passe, 3 confirmation finale
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [revealed, setRevealed] = useState({}); // { [id]: secret }

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

  async function remove(entry) {
    if (!confirm(`Supprimer "${entry.label}" du coffre ?`)) return;
    await api.del(`/vault/${entry.id}`);
    setRevealed((r) => { const n = { ...r }; delete n[entry.id]; return n; });
    notify('Entrée supprimée', { type: 'info' });
    reload();
  }

  async function doReveal(entry, currentPassword) {
    try {
      const res = await api.post(`/vault/${entry.id}/reveal`, currentPassword ? { currentPassword } : {});
      setRevealed((r) => ({ ...r, [entry.id]: res.secret }));
      setRevealing(null);
      setStepUpPassword('');
      setRevealStep(1);
      setConfirmChecked(false);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
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

  return (
    <Panel title={title} sub={sub} span={canManage ? 6 : 12}>
      <div style={{ padding: 6 }}>
        {items.length === 0 && <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 16 }}>Aucune entrée</div>}
        {items.map((entry) => (
          <div key={entry.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{entry.label}</div>
                <div className="faint" style={{ fontSize: 11 }}>{entry.username || '—'}</div>
              </div>
              {revealed[entry.id] === undefined ? (
                <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => startReveal(entry)}>
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

      {revealing && !tripleVerify && (
        <Modal title={`Révéler « ${revealing.label} »`} sub="Ré-authentification requise" onClose={() => { setRevealing(null); setStepUpPassword(''); }} width={380}>
          <form onSubmit={(e) => { e.preventDefault(); doReveal(revealing, stepUpPassword); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

      {revealing && tripleVerify && (
        <Modal title={`Révéler « ${revealing.label} »`} sub={`Secret de production — étape ${revealStep} / 3`} onClose={() => setRevealing(null)} width={420}>
          {revealStep === 1 && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, background: 'var(--tone-crit-soft, var(--primary-soft))', marginBottom: 4 }}>
                <Icon name="alertTriangle" size={16} style={{ color: 'var(--tone-crit-fg)', flex: 'none', marginTop: 1 }} />
                <p style={{ fontSize: 12.5, margin: 0 }}>Ceci est un secret de <strong>production</strong>. Ne le révélez que si vous en avez réellement besoin maintenant.</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <span className="btn-outline" onClick={() => setRevealing(null)}>Annuler</span>
                <button className="btn" onClick={() => setRevealStep(2)}>Continuer</button>
              </div>
            </>
          )}
          {revealStep === 2 && (
            <form onSubmit={(e) => { e.preventDefault(); setRevealStep(3); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" type="password" autoFocus autoComplete="off" placeholder="Votre mot de passe" value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)} style={{ height: 34, fontSize: 12.5 }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <span className="btn-outline" onClick={() => setRevealing(null)}>Annuler</span>
                <button className="btn" type="submit">Suivant</button>
              </div>
            </form>
          )}
          {revealStep === 3 && (
            <form onSubmit={(e) => { e.preventDefault(); doReveal(revealing, stepUpPassword); }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, marginBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                Je confirme accéder à ce secret de production pour une raison légitime.
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <span className="btn-outline" onClick={() => setRevealing(null)}>Annuler</span>
                <button className="btn" type="submit" disabled={!confirmChecked}>Révéler définitivement</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {canManage && (
        <form onSubmit={create} autoComplete="off" style={{ padding: 16, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" autoComplete="off" placeholder="Nom (ex. VM test devops-1)" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={{ flex: '1 1 160px' }} />
          <input className="input" autoComplete="off" placeholder="Utilisateur (optionnel)" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} style={{ flex: '1 1 130px' }} />
          {tier === 'dev' && (
            <input className="input" type="password" autoComplete="new-password" placeholder="Mot de passe" required value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} style={{ flex: '1 1 140px' }} />
          )}
          <button className="btn" type="submit" disabled={busy} style={{ flex: 'none' }}>
            {busy ? 'Ajout…' : tier === 'prod' ? 'Générer & ajouter' : 'Ajouter'}
          </button>
        </form>
      )}
    </Panel>
  );
}
