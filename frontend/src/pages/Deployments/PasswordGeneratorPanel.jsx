import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}'
};

// Génération 100% côté client (crypto.getRandomValues, jamais envoyé au
// backend) : convient pour un mot de passe de dev ponctuel. Pour les secrets
// de production, utilisez un vrai gestionnaire de secrets — voir la note
// dans le Manuel.
function generate(length, opts) {
  const alphabet = Object.entries(opts).filter(([, on]) => on).map(([k]) => CHARSETS[k]).join('');
  if (!alphabet) return '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export default function PasswordGeneratorPanel() {
  const [length, setLength] = useState(24);
  const [opts, setOpts] = useState({ lower: true, upper: true, digits: true, symbols: true });
  const [value, setValue] = useState(() => generate(24, { lower: true, upper: true, digits: true, symbols: true }));
  const notify = useNotify();

  function regenerate(nextLength = length, nextOpts = opts) {
    setValue(generate(nextLength, nextOpts));
  }

  function toggle(key) {
    const next = { ...opts, [key]: !opts[key] };
    setOpts(next);
    regenerate(length, next);
  }

  async function copy() {
    await navigator.clipboard.writeText(value);
    notify('Copié dans le presse-papiers', { type: 'ok' });
  }

  return (
    <Panel title="Générateur de mots de passe" sub="Local au navigateur — jamais envoyé au serveur" span={6}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input className="input mono" readOnly value={value} style={{ flex: 1, fontSize: 13 }} />
          <span className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }} onClick={copy}><Icon name="edit" size={13} />Copier</span>
          <span className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }} onClick={() => regenerate()}><Icon name="refresh" size={13} />Régénérer</span>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}>Longueur : {length}</label>
        <input
          type="range" min={12} max={64} value={length}
          onChange={(e) => { const l = Number(e.target.value); setLength(l); regenerate(l, opts); }}
          style={{ width: '100%', marginBottom: 14 }}
        />

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
          {[['lower', 'a-z'], ['upper', 'A-Z'], ['digits', '0-9'], ['symbols', 'Symboles']].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={opts[key]} onChange={() => toggle(key)} />{label}
            </label>
          ))}
        </div>
      </div>
    </Panel>
  );
}
