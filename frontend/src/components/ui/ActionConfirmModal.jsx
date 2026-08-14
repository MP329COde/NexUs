import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

// Confirmation standardisée pour toute action qui modifie une ressource
// réelle (redémarrage, rollback, purge, bascule VM...) : la popup nomme la
// cible, liste concrètement ce que l'action va changer ("aperçu de
// l'impact"), et pour les actions les plus destructrices exige de retaper le
// nom de la ressource avant d'activer le bouton de confirmation.
export default function ActionConfirmModal({ title, sub, impact = [], tone = 'warn', confirmLabel = 'Confirmer', requireTypedConfirmation, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [typed, setTyped] = useState('');

  const locked = requireTypedConfirmation && typed !== requireTypedConfirmation;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      sub={sub}
      onClose={onClose}
      width={440}
      actions={(
        <>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" disabled={busy || locked} onClick={run} style={tone === 'crit' ? { background: 'var(--tone-crit-fg)', borderColor: 'var(--tone-crit-fg)' } : undefined}>
            {busy ? 'En cours…' : confirmLabel}
          </button>
        </>
      )}
    >
      {impact.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, background: `var(--tone-${tone}-soft, var(--primary-soft))`, marginBottom: requireTypedConfirmation ? 14 : 0 }}>
          <Icon name="alertTriangle" size={16} style={{ color: `var(--tone-${tone}-fg)`, flex: 'none', marginTop: 1 }} />
          <div style={{ fontSize: 12.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Aperçu de l'impact</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {impact.map((line, i) => <li key={i} style={{ marginBottom: 2 }}>{line}</li>)}
            </ul>
          </div>
        </div>
      )}

      {requireTypedConfirmation && (
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>
            Tapez <strong className="mono">{requireTypedConfirmation}</strong> pour confirmer
          </label>
          <input className="input" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}

      {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', marginTop: 10 }}>{error}</div>}
    </Modal>
  );
}
