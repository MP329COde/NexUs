import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
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
        <VaultTier tier="prod" title="Mots de passe production" sub="Générés automatiquement (256 caractères), révélés après ré-authentification" canManage requireStepUp />
      )}
    </>
  );
}

function VaultTier({ tier, title, sub, canManage, requireStepUp }) {
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get(`/vault/${tier}`), []);
  const [form, setForm] = useState(tier === 'dev' ? EMPTY_DEV_FORM : EMPTY_PROD_FORM);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(null); // { id, label } en attente de mot de passe
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
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  function startReveal(entry) {
    if (requireStepUp) setRevealing(entry);
    else doReveal(entry);
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
                  <Icon name="edit" size={12} /> Copier
                </span>
              )}
              {canManage && (
                <span className="btn-outline" style={{ height: 26, padding: '0 8px', fontSize: 11.5, color: 'var(--tone-crit-fg)' }} onClick={() => remove(entry)}>
                  <Icon name="trash" size={12} />
                </span>
              )}
            </div>

            {revealing?.id === entry.id && (
              <form
                onSubmit={(e) => { e.preventDefault(); doReveal(entry, stepUpPassword); }}
                style={{ display: 'flex', gap: 8, marginTop: 8 }}
              >
                <input
                  className="input" type="password" autoFocus placeholder="Votre mot de passe"
                  value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)}
                  style={{ flex: 1, height: 30, fontSize: 12.5 }}
                />
                <button className="btn" type="submit" style={{ height: 30, fontSize: 12 }}>Confirmer</button>
                <span className="btn-outline" style={{ height: 30, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center' }} onClick={() => { setRevealing(null); setStepUpPassword(''); }}>Annuler</span>
              </form>
            )}

            {revealed[entry.id] !== undefined && (
              <div className="mono" style={{ marginTop: 6, fontSize: 11, padding: '6px 8px', background: 'var(--border-soft)', borderRadius: 6, wordBreak: 'break-all' }}>
                {revealed[entry.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={create} style={{ padding: 16, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Nom (ex. VM test devops-1)" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={{ flex: '1 1 160px' }} />
          <input className="input" placeholder="Utilisateur (optionnel)" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} style={{ flex: '1 1 130px' }} />
          {tier === 'dev' && (
            <input className="input" type="password" placeholder="Mot de passe" required value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} style={{ flex: '1 1 140px' }} />
          )}
          <button className="btn" type="submit" disabled={busy} style={{ flex: 'none' }}>
            {busy ? 'Ajout…' : tier === 'prod' ? 'Générer & ajouter' : 'Ajouter'}
          </button>
        </form>
      )}
    </Panel>
  );
}
