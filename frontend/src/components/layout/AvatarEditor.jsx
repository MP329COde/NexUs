import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const EMOJIS = ['🧑‍💻', '🛰️', '🐳', '🦾', '🔧', '🛡️', '⚡', '🌐', '🧠', '🔥', '🚀', '🗄️'];
const COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899', '#475569'];

export default function AvatarEditor({ onClose }) {
  const { user, updateProfile } = useAuth();
  const notify = useNotify();
  const [emoji, setEmoji] = useState(user?.avatarEmoji || '');
  const [color, setColor] = useState(user?.avatarColor || '#2563EB');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateProfile({ avatarEmoji: emoji, avatarColor: color });
      notify('Avatar mis à jour', { type: 'ok' });
      onClose();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>Personnaliser l'avatar</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {EMOJIS.map((e) => (
          <span
            key={e}
            onClick={() => setEmoji(e === emoji ? '' : e)}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 15, background: e === emoji ? 'var(--primary-soft)' : 'transparent', border: e === emoji ? '1px solid var(--primary)' : '1px solid transparent' }}
          >
            {e}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {COLORS.map((c) => (
          <span
            key={c}
            onClick={() => setColor(c)}
            style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: c === color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--primary)' : 'none' }}
          />
        ))}
      </div>
      <button className="btn" style={{ width: '100%', height: 30 }} onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </div>
  );
}
