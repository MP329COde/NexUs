import { useEffect, useRef, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme, THEME_MODES, ACCENT_COLORS } from '../../context/ThemeContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './AccountPage.css';

const EMOJIS = ['🧑‍💻', '🛰️', '🐳', '🦾', '🔧', '🛡️', '⚡', '🌐', '🧠', '🔥', '🚀', '🗄️'];
const COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899', '#475569'];
const AVATAR_IMAGE_SIZE = 256; // redimensionnement cible, cf. limite serveur (700 Ko encodé) — voir auth.routes.js
const AVATAR_IMAGE_MAX_SOURCE_BYTES = 8_000_000; // 8 Mo avant redimensionnement, pour ne pas geler l'onglet sur un fichier énorme

// Redimensionne/recadre en carré via canvas et réencode en JPEG qualité 0.85 :
// une photo de smartphone (plusieurs Mo) devient quelques dizaines de Ko,
// largement sous la limite serveur, sans dépendance externe.
function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > AVATAR_IMAGE_MAX_SOURCE_BYTES) {
      reject(new Error('Image trop volumineuse (8 Mo max avant redimensionnement)'));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_IMAGE_SIZE;
      canvas.height = AVATAR_IMAGE_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_IMAGE_SIZE, AVATAR_IMAGE_SIZE);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Impossible de lire l'image")); };
    img.src = objectUrl;
  });
}

export default function AccountPage() {
  const { user, updateProfile } = useAuth();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const notify = useNotify();

  const [name, setName] = useState(user?.name || '');
  const [emoji, setEmoji] = useState(user?.avatarEmoji || '');
  const [color, setColor] = useState(user?.avatarColor || '#2563EB');
  const [avatarImage, setAvatarImage] = useState(user?.avatarImage || '');
  const [savingProfile, setSavingProfile] = useState(false);

  async function onPickAvatarImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarImage(dataUrl);
      setEmoji('');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      // Image et emoji sont mutuellement exclusifs à l'affichage — n'envoyer
      // que celui réellement actif évite d'écraser l'autre par erreur côté
      // serveur (voir la logique de patch dans routes/auth.routes.js).
      const payload = avatarImage
        ? { name, avatarColor: color, avatarImage }
        : { name, avatarColor: color, avatarEmoji: emoji };
      await updateProfile(payload);
      notify('Profil mis à jour', { type: 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify('Les mots de passe ne correspondent pas', { type: 'crit' });
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/auth/password', { currentPassword, newPassword });
      notify('Mot de passe mis à jour', { type: 'ok' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <PageHeader title="Mon compte" sub="Préférences personnelles : profil, avatar, apparence et sécurité. Ces réglages ne concernent que votre compte." />

      <div className="account-grid">
        <Panel title="Profil" span={6}>
          <form onSubmit={saveProfile} className="account-form-body">
            <Field label="Nom affiché"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="E-mail"><input className="input" value={user?.email || ''} disabled /></Field>

            <div className="account-section-label">Avatar</div>
            <div className="account-avatar-row">
              <Avatar user={{ name, avatarImage, avatarEmoji: emoji, avatarColor: color }} size={52} />
              <div className="account-avatar-actions">
                <label className="btn-outline account-import-btn">
                  <Icon name="image" size={13} />Importer une image
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onPickAvatarImage} className="account-file-input" />
                </label>
                {avatarImage && (
                  <span className="faint account-remove-image" onClick={() => setAvatarImage('')}>
                    Retirer l'image importée
                  </span>
                )}
              </div>
            </div>
            <div className="faint account-avatar-hint">
              {avatarImage ? "Image importée active — l'emoji ci-dessous est ignoré tant qu'elle est définie." : 'Ou choisissez un emoji :'}
            </div>
            <div className="account-emoji-picker" style={{ opacity: avatarImage ? 0.5 : 1 }}>
              {EMOJIS.map((e) => (
                <span
                  key={e}
                  onClick={() => { setEmoji(e === emoji ? '' : e); setAvatarImage(''); }}
                  className={`account-emoji-option${e === emoji ? ' account-emoji-option-active' : ''}`}
                >
                  {e}
                </span>
              ))}
            </div>
            <div className="account-color-picker">
              {COLORS.map((c) => (
                <span
                  key={c}
                  onClick={() => setColor(c)}
                  className={`account-color-option${c === color ? ' account-color-option-active' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <button className="btn" type="submit" disabled={savingProfile}>{savingProfile ? 'Enregistrement…' : 'Enregistrer le profil'}</button>
          </form>
        </Panel>

        <Panel title="Apparence" span={6}>
          <div className="account-panel-body">
            <div className="account-section-label">Thème</div>
            <div className="account-theme-tabs">
              {THEME_MODES.map(({ value, label }) => (
                <span
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`${theme === value ? 'btn' : 'btn-outline'} account-theme-tab`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="faint account-theme-hint">
              Système suit le réglage de votre appareil ; Auto (horaire) bascule sombre entre 20h et 7h, quel que soit l'appareil.
            </div>

            <div className="account-section-label account-accent-label">Couleur d'accent</div>
            <div className="account-accent-picker">
              {ACCENT_COLORS.map(({ value, label, swatch }) => (
                <span
                  key={value}
                  onClick={() => setAccent(value)}
                  title={label}
                  className="account-accent-option"
                  style={{
                    background: swatch,
                    boxShadow: accent === value ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text)' : '0 0 0 1px var(--border)'
                  }}
                />
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Sécurité" sub="Changer votre mot de passe" span={6}>
          <form onSubmit={savePassword} className="account-form-body">
            <Field label="Mot de passe actuel"><input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
            <Field label="Nouveau mot de passe"><input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
            <Field label="Confirmation"><input className="input" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
            <button className="btn" type="submit" disabled={savingPassword}>{savingPassword ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
          </form>
        </Panel>

        <PasskeysPanel />
        <MfaPanel />
        <PersonalGitTokenPanel />
      </div>
    </>
  );
}

// Token GitLab personnel : distinct de l'intégration GitLab d'instance
// (Paramètres admin → Forges déclarées), qui reste un compte de service
// partagé au niveau plateforme. Ici, chaque utilisateur renseigne SON propre
// token pour que les actions personnelles (ex: approuver une merge request)
// soient attribuées à son propre compte GitLab plutôt qu'au compte partagé.
// Base minimale (Lot A6 du plan approuvé) : un seul provider (GitLab), pas
// encore le vault multi-niveaux complet prévu au Lot B2 à venir.
function PersonalGitTokenPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/personal-tokens/gitlab'), []);
  const [editing, setEditing] = useState(false);
  const [tokenValue, setTokenValue] = useState('');
  const [busy, setBusy] = useState(false);
  const hasToken = data?.token?.hasToken === true;

  async function save(e) {
    e.preventDefault();
    if (!tokenValue.trim()) return;
    setBusy(true);
    try {
      await api.put('/personal-tokens/gitlab', { token: tokenValue.trim() });
      notify('Token GitLab personnel enregistré', { type: 'ok' });
      setTokenValue('');
      setEditing(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Supprimer votre token GitLab personnel ?')) return;
    setBusy(true);
    try {
      await api.del('/personal-tokens/gitlab');
      notify('Token GitLab personnel supprimé', { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Mon token GitLab personnel"
      sub="Utilisé pour vos actions GitLab (ex: approuver une merge request) au nom de votre propre compte, pas celui de la plateforme"
      span={12}
    >
      <div className="account-panel-body">
        {loading ? (
          <div className="faint">Chargement…</div>
        ) : hasToken && !editing ? (
          <div className="account-form-body">
            <div className="faint">
              Token enregistré{data.token.updatedAt ? ` · mis à jour le ${formatDate(data.token.updatedAt)}` : ''}. Il reste masqué et ne sera plus jamais réaffiché en clair.
            </div>
            <div className="account-passkey-row" style={{ gap: '0.5rem' }}>
              <button className="btn-outline" type="button" onClick={() => setEditing(true)} disabled={busy}>Remplacer</button>
              <button className="btn-outline" type="button" onClick={remove} disabled={busy}>Supprimer</button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="account-form-body">
            <Field label="Token d'accès personnel GitLab (scope « api »)">
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder="glpat-…"
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
              />
            </Field>
            <div className="faint">
              Généré dans GitLab : avatar → Edit profile → Access Tokens. Utilise la même URL d'instance que celle configurée par l'administrateur en Paramètres.
            </div>
            <div className="account-passkey-row" style={{ gap: '0.5rem' }}>
              <button className="btn" type="submit" disabled={busy || !tokenValue.trim()}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
              {hasToken && (
                <button className="btn-outline" type="button" onClick={() => { setEditing(false); setTokenValue(''); }} disabled={busy}>Annuler</button>
              )}
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

// Clés d'accès (passkeys WebAuthn) — authentification cryptographique réelle
// via @simplewebauthn/browser, en complément du mot de passe (voir
// backend/src/routes/webauthn.routes.js). L'enregistrement peut échouer si
// le navigateur/l'appareil ne propose aucun authentificateur compatible :
// c'est signalé tel quel, jamais masqué.
function PasskeysPanel() {
  const notify = useNotify();
  const { data, loading, reload } = useApi(() => api.get('/auth/webauthn/credentials'), []);
  const [registering, setRegistering] = useState(false);
  const items = data?.items || [];

  // IMPORTANT (bug Safari/WebKit corrigé ici) : comme pour la connexion par
  // clé d'accès (voir LoginPage.jsx), `navigator.credentials.create()` doit
  // être appelé quasi synchroniquement depuis le clic pour que Safari
  // considère encore l'activation utilisateur comme valide. L'ancien code
  // attendait la réponse réseau de `POST /register-options` AVANT d'appeler
  // `startRegistration`, ce qui casse ce lien sur Safari (rejet silencieux
  // en `NotAllowedError`, avalé par le `catch` ci-dessous) et, de façon
  // moins systématique, sur d'autres navigateurs en cas de latence réseau.
  // Les options sont donc préchargées au montage du panneau et rafraîchies
  // périodiquement (le défi expire côté serveur après 5 min, voir
  // `CHALLENGE_TTL_MS` dans `webauthn.routes.js`) ainsi qu'après chaque
  // ajout/suppression de clé (la liste `excludeCredentials` doit rester à
  // jour), pour que le clic déclenche `startRegistration` sans attente
  // réseau intercalée.
  const registerOptionsRef = useRef(null);
  const registerOptionsPromiseRef = useRef(null);

  function fetchRegisterOptions() {
    const promise = api.post('/auth/webauthn/register-options')
      .then((data) => { registerOptionsRef.current = data; return data; })
      .catch(() => { registerOptionsRef.current = null; return null; });
    registerOptionsPromiseRef.current = promise;
    return promise;
  }

  useEffect(() => {
    fetchRegisterOptions();
    const interval = setInterval(fetchRegisterOptions, 4 * 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function register() {
    setRegistering(true);
    try {
      const cached = registerOptionsRef.current || await (registerOptionsPromiseRef.current || fetchRegisterOptions());
      if (!cached) throw new Error('Impossible de préparer la cérémonie WebAuthn (réseau indisponible)');
      const response = await startRegistration({ optionsJSON: cached.options });
      await api.post('/auth/webauthn/register-verify', { response });
      notify('Clé d\'accès enregistrée', { type: 'ok' });
      reload();
    } catch (err) {
      if (err.name !== 'NotAllowedError') notify(err.message, { type: 'crit' });
    } finally {
      setRegistering(false);
      fetchRegisterOptions();
    }
  }

  async function remove(id) {
    if (!confirm('Supprimer cette clé d\'accès ?')) return;
    try {
      await api.del(`/auth/webauthn/credentials/${id}`);
      notify('Clé supprimée', { type: 'ok' });
      reload();
      fetchRegisterOptions();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <Panel title="Clés d'accès (passkeys)" sub="Connexion sans mot de passe via empreinte, visage ou clé de sécurité" span={12}>
      <div className="account-panel-body">
        <button className="btn account-passkey-register-btn" type="button" onClick={register} disabled={registering}>
          {registering ? 'En attente de l\'authentificateur…' : '+ Enregistrer une clé d\'accès'}
        </button>
        {loading ? (
          <div className="faint account-passkey-empty">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="faint account-passkey-empty">Aucune clé d'accès enregistrée — la connexion par mot de passe reste disponible.</div>
        ) : (
          <div className="account-passkey-list">
            {items.map((c) => (
              <div key={c.id} className="account-passkey-row">
                <Icon name="lock" size={14} className="account-passkey-icon" />
                <div className="account-passkey-info">
                  <div className="account-passkey-label">{c.label}{c.deviceType === 'multiDevice' ? ' (synchronisée)' : ''}</div>
                  <div className="faint account-passkey-meta">Ajoutée le {formatDate(c.createdAt)}{c.lastUsedAt ? ` · dernière utilisation ${formatDate(c.lastUsedAt)}` : ' · jamais utilisée'}</div>
                </div>
                <button className="btn account-passkey-remove-btn" type="button" onClick={() => remove(c.id)}>Supprimer</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// MFA (TOTP) — voir backend/src/routes/auth.routes.js. Pas de génération de
// QR code (aucune dépendance qrcode dans ce repo) : le secret base32 est
// affiché en clair pour saisie manuelle dans l'application d'authentification
// (Google Authenticator, Authy, 1Password... tous l'acceptent), avec l'URL
// otpauth:// complète en repli pour les outils qui savent la coller
// directement.
function MfaPanel() {
  const { user, refresh } = useAuth();
  const notify = useNotify();
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    try {
      const data = await api.post('/auth/mfa/setup', {});
      setSetupData(data);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.post('/auth/mfa/enable', { code: code.trim() });
      setBackupCodes(data.backupCodes);
      setSetupData(null);
      setCode('');
      notify('MFA activé', { type: 'ok' });
      refresh();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function disable(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/mfa/disable', { password: disablePassword });
      setDisablePassword('');
      notify('MFA désactivé', { type: 'info' });
      refresh();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <Panel title="Codes de secours" sub="Notez-les maintenant — ils ne seront plus jamais affichés" span={12}>
        <div className="account-panel-body">
          <div className="account-mfa-backup-grid">
            {backupCodes.map((c) => <span key={c} className="mono account-mfa-backup-code">{c}</span>)}
          </div>
          <button className="btn" type="button" onClick={() => setBackupCodes(null)}>J'ai noté ces codes</button>
        </div>
      </Panel>
    );
  }

  if (user?.mfaEnabled) {
    return (
      <Panel title="Authentification à deux facteurs" sub="Activée — chaque connexion demande un code en plus du mot de passe" span={12}>
        <form onSubmit={disable} className="account-form-body">
          <Field label="Mot de passe (pour désactiver)">
            <input className="input" type="password" required value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
          </Field>
          <button className="btn-outline" type="submit" disabled={busy}>{busy ? 'Désactivation…' : 'Désactiver le MFA'}</button>
        </form>
      </Panel>
    );
  }

  return (
    <Panel title="Authentification à deux facteurs" sub="Désactivée — ajoutez un code TOTP en plus du mot de passe" span={12}>
      <div className="account-panel-body">
        {!setupData ? (
          <button className="btn" type="button" onClick={startSetup} disabled={busy}>
            {busy ? 'Génération…' : 'Activer le MFA'}
          </button>
        ) : (
          <form onSubmit={confirmSetup} className="account-form-body">
            <p className="faint">Scannez ou saisissez ce secret dans votre application d'authentification, puis entrez le code généré :</p>
            <div className="mono account-mfa-secret">{setupData.secret}</div>
            <div className="faint account-mfa-otpauth">{setupData.otpauthUrl}</div>
            <Field label="Code à 6 chiffres">
              <input className="input" type="text" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Vérification…' : 'Confirmer'}</button>
              <span className="btn-outline" onClick={() => { setSetupData(null); setCode(''); }}>Annuler</span>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, children }) {
  return (
    <div className="account-field">
      <label className="account-field-label">{label}</label>
      {children}
    </div>
  );
}
