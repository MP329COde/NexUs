import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { PASSPHRASE_WORDS } from '../../lib/passphraseWords.js';
import { entropyBitsForRandom, entropyBitsForPassphrase, strengthLabel, crackTimeLabel } from '../../lib/passwordStrength.js';
import './PasswordGeneratorPanel.css';

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}'
};
const AMBIGUOUS = /[0O1lI]/g;
const HISTORY_LIMIT = 5;

function randomIndex(max) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

function buildAlphabet(opts, excludeAmbiguous, extraChars, excludeChars) {
  let alphabet = Object.entries(opts).filter(([, on]) => on).map(([k]) => CHARSETS[k]).join('');
  alphabet += extraChars || '';
  if (excludeAmbiguous) alphabet = alphabet.replace(AMBIGUOUS, '');
  if (excludeChars) {
    const excludeSet = new Set(excludeChars);
    alphabet = Array.from(alphabet).filter((c) => !excludeSet.has(c)).join('');
  }
  // dédoublonne (extraChars peut recouvrir un charset déjà actif)
  return Array.from(new Set(alphabet)).join('');
}

function generateRandom(length, opts, excludeAmbiguous, extraChars, excludeChars) {
  const alphabet = buildAlphabet(opts, excludeAmbiguous, extraChars, excludeChars);
  if (!alphabet) return '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function generatePassphrase(wordCount, separator, capitalize, appendNumber) {
  const words = Array.from({ length: wordCount }, () => {
    const w = PASSPHRASE_WORDS[randomIndex(PASSPHRASE_WORDS.length)];
    return capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });
  const suffix = appendNumber ? String(randomIndex(100)).padStart(2, '0') : '';
  return words.join(separator) + suffix;
}

// Générateur approfondi : deux modes (caractères aléatoires / phrase de
// passe mémorisable), indicateur de robustesse (entropie + estimation de
// temps de cassage, calculés localement), historique de la session en
// cours, et enregistrement direct dans un coffre-fort (dev ou projet) sans
// repasser par un copier-coller manuel.
export default function PasswordGeneratorPanel({ onSaved }) {
  const { user } = useAuth();
  const notify = useNotify();
  const [mode, setMode] = useState('random'); // random | passphrase
  const [length, setLength] = useState(24);
  const [opts, setOpts] = useState({ lower: true, upper: true, digits: true, symbols: true });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [extraChars, setExtraChars] = useState('');
  const [excludeChars, setExcludeChars] = useState('');
  const [wordCount, setWordCount] = useState(4);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(true);
  const [appendNumber, setAppendNumber] = useState(true);
  const [value, setValue] = useState(() => generateRandom(24, { lower: true, upper: true, digits: true, symbols: true }, false, '', ''));
  const [history, setHistory] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);

  const alphabetSize = buildAlphabet(opts, excludeAmbiguous, extraChars, excludeChars).length;
  const bits = mode === 'random' ? entropyBitsForRandom(length, Math.max(alphabetSize, 1)) : entropyBitsForPassphrase(wordCount, PASSPHRASE_WORDS.length);
  const strength = strengthLabel(bits);
  const crackTime = crackTimeLabel(bits);

  function regenRandom(l = length, o = opts, ea = excludeAmbiguous, ex = extraChars, exc = excludeChars) {
    return generateRandom(l, o, ea, ex, exc);
  }

  function regenerate() {
    const next = mode === 'random' ? regenRandom() : generatePassphrase(wordCount, separator, capitalize, appendNumber);
    setValue(next);
    setHistory((h) => [next, ...h.filter((v) => v !== next)].slice(0, HISTORY_LIMIT));
  }

  function toggle(key) {
    const next = { ...opts, [key]: !opts[key] };
    setOpts(next);
    setValue(regenRandom(length, next));
  }

  async function copy(text = value) {
    await navigator.clipboard.writeText(text);
    notify('Copié dans le presse-papiers', { type: 'ok' });
  }

  return (
    <Panel title="Générateur de mots de passe" sub="Local au navigateur — jamais envoyé au serveur" span={6}>
      <div className="pwgen-body">
        <div className="pwgen-tabs">
          {[['random', 'Caractères aléatoires'], ['passphrase', 'Phrase de passe']].map(([id, label]) => (
            <div
              key={id}
              onClick={() => { setMode(id); setValue(id === 'random' ? regenRandom() : generatePassphrase(wordCount, separator, capitalize, appendNumber)); }}
              className={`pwgen-tab${mode === id ? ' pwgen-tab-active' : ''}`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="pwgen-value-row">
          <input className="input mono pwgen-value-input" readOnly value={value} />
          <span className="btn-outline pwgen-value-btn" onClick={() => copy()}><Icon name="copy" size={13} />Copier</span>
          <span className="btn-outline pwgen-value-btn" onClick={regenerate}><Icon name="refresh" size={13} />Régénérer</span>
        </div>

        <div className="pwgen-strength-wrap">
          <div className="pwgen-strength-row">
            <span className="pwgen-strength-label" style={{ color: `var(--tone-${strength.tone}-fg)` }}>{strength.label} · {Math.round(bits)} bits</span>
            <span className="faint">temps de cassage estimé : {crackTime}</span>
          </div>
          <div className="pwgen-strength-track">
            <div className="pwgen-strength-fill" style={{ width: `${Math.min(100, (bits / 100) * 100)}%`, background: `var(--tone-${strength.tone}-fg)` }} />
          </div>
        </div>

        {mode === 'random' ? (
          <>
            <label className="pwgen-field-label">Longueur : {length}</label>
            <input
              type="range" min={12} max={128} value={length}
              onChange={(e) => { const l = Number(e.target.value); setLength(l); setValue(regenRandom(l)); }}
              className="pwgen-range"
            />
            <div className="pwgen-checkbox-row">
              {[['lower', 'a-z'], ['upper', 'A-Z'], ['digits', '0-9'], ['symbols', 'Symboles']].map(([key, label]) => (
                <label key={key} className="pwgen-checkbox">
                  <input type="checkbox" checked={opts[key]} onChange={() => toggle(key)} />{label}
                </label>
              ))}
            </div>
            <label className="pwgen-checkbox pwgen-checkbox-spaced">
              <input type="checkbox" checked={excludeAmbiguous} onChange={(e) => { setExcludeAmbiguous(e.target.checked); setValue(regenRandom(length, opts, e.target.checked)); }} />
              Exclure les caractères ambigus (0, O, 1, l, I)
            </label>
            <div className="pwgen-extra-fields">
              <div className="pwgen-extra-field">
                <label className="pwgen-extra-label">Symboles autorisés en plus</label>
                <input
                  className="input mono pwgen-extra-input" placeholder="ex. €§~"
                  value={extraChars}
                  onChange={(e) => { setExtraChars(e.target.value); setValue(regenRandom(length, opts, excludeAmbiguous, e.target.value)); }}
                />
              </div>
              <div className="pwgen-extra-field">
                <label className="pwgen-extra-label">Caractères interdits</label>
                <input
                  className="input mono pwgen-extra-input" placeholder={'ex. "\'`;'}
                  value={excludeChars}
                  onChange={(e) => { setExcludeChars(e.target.value); setValue(regenRandom(length, opts, excludeAmbiguous, extraChars, e.target.value)); }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <label className="pwgen-field-label">Nombre de mots : {wordCount}</label>
            <input
              type="range" min={3} max={8} value={wordCount}
              onChange={(e) => { const w = Number(e.target.value); setWordCount(w); setValue(generatePassphrase(w, separator, capitalize, appendNumber)); }}
              className="pwgen-range"
            />
            <div className="pwgen-passphrase-options">
              <label className="pwgen-separator-label">
                Séparateur
                <select className="input pwgen-separator-select" value={separator} onChange={(e) => { setSeparator(e.target.value); setValue(generatePassphrase(wordCount, e.target.value, capitalize, appendNumber)); }}>
                  <option value="-">-</option>
                  <option value="_">_</option>
                  <option value=".">.</option>
                  <option value="">(aucun)</option>
                </select>
              </label>
              <label className="pwgen-checkbox">
                <input type="checkbox" checked={capitalize} onChange={(e) => { setCapitalize(e.target.checked); setValue(generatePassphrase(wordCount, separator, e.target.checked, appendNumber)); }} />
                Majuscules
              </label>
              <label className="pwgen-checkbox">
                <input type="checkbox" checked={appendNumber} onChange={(e) => { setAppendNumber(e.target.checked); setValue(generatePassphrase(wordCount, separator, capitalize, e.target.checked)); }} />
                Ajouter un nombre
              </label>
            </div>
          </>
        )}

        <div className={`pwgen-save-row${history.length ? ' pwgen-save-row-with-history' : ''}`}>
          <span className="btn pwgen-save-btn" onClick={() => setSaveOpen(true)}>
            <Icon name="lock" size={13} />Enregistrer dans un coffre-fort
          </span>
        </div>

        {history.length > 0 && (
          <div className="pwgen-history">
            <div className="pwgen-history-heading">
              Historique de cette session
            </div>
            <div className="pwgen-history-list">
              {history.map((h, i) => (
                <div key={i} className="pwgen-history-row">
                  <span className="mono faint pwgen-history-value">{h}</span>
                  <Icon name="copy" size={12} className="pwgen-history-copy" onClick={() => copy(h)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {saveOpen && (
        <SaveToVaultModal
          value={value}
          isAdmin={user?.role === 'admin'}
          onClose={() => setSaveOpen(false)}
          onSaved={() => { setSaveOpen(false); onSaved?.(); }}
        />
      )}
    </Panel>
  );
}

function SaveToVaultModal({ value, isAdmin, onClose, onSaved }) {
  const notify = useNotify();
  const projects = useApi(() => api.get('/projects'), []);
  const projectItems = projects.data?.items || [];
  const [target, setTarget] = useState(isAdmin ? 'dev' : (projectItems[0]?.id || ''));
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const currentTarget = target || (isAdmin ? 'dev' : projectItems[0]?.id || '');

  async function save(e) {
    e.preventDefault();
    if (!currentTarget) return;
    setBusy(true);
    try {
      const path = currentTarget === 'dev' ? '/vault/dev' : `/projects/${currentTarget}/vault`;
      await api.post(path, { label, username, secret: value, url });
      notify(`${label} enregistré dans le coffre-fort`, { type: 'ok' });
      onSaved();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Enregistrer dans un coffre-fort" sub="Le mot de passe généré sera chiffré au repos" onClose={onClose} width={440}>
      <form onSubmit={save} autoComplete="off" className="pwgen-modal-form">
        <div>
          <label className="pwgen-modal-label">Destination</label>
          <select className="input" value={currentTarget} onChange={(e) => setTarget(e.target.value)}>
            {isAdmin && <option value="dev">Mots de passe dev (globaux)</option>}
            {projectItems.map((p) => <option key={p.id} value={p.id}>Coffre-fort — {p.name}</option>)}
          </select>
          {!isAdmin && projectItems.length === 0 && (
            <div className="faint pwgen-modal-hint">Vous n'êtes membre d'aucun projet.</div>
          )}
        </div>
        <div>
          <label className="pwgen-modal-label">Nom</label>
          <input className="input" autoComplete="off" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="VM test devops-1" />
        </div>
        <div>
          <label className="pwgen-modal-label">Utilisateur (optionnel)</label>
          <input className="input" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="pwgen-modal-label">URL / hôte d'accès (optionnel)</label>
          <input className="input" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ssh://user@10.0.0.12 ou https://vm-test.homelab.local" />
        </div>
        <div className="mono pwgen-modal-value">{value}</div>
        <div className="pwgen-modal-actions">
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy || !currentTarget}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  );
}
