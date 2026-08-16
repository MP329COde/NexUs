import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme, THEME_MODES } from '../../context/ThemeContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import { api } from '../../lib/apiClient.js';

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
  const { theme, setTheme } = useTheme();
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Profil" span={6}>
          <form onSubmit={saveProfile} style={{ padding: 16 }}>
            <Field label="Nom affiché"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="E-mail"><input className="input" value={user?.email || ''} disabled /></Field>

            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Avatar</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar user={{ name, avatarImage, avatarEmoji: emoji, avatarColor: color }} size={52} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', width: 'fit-content' }}>
                  <Icon name="image" size={13} />Importer une image
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onPickAvatarImage} style={{ display: 'none' }} />
                </label>
                {avatarImage && (
                  <span className="faint" style={{ fontSize: 11.5, cursor: 'pointer', width: 'fit-content' }} onClick={() => setAvatarImage('')}>
                    Retirer l'image importée
                  </span>
                )}
              </div>
            </div>
            <div className="faint" style={{ fontSize: 11, marginBottom: 10 }}>
              {avatarImage ? "Image importée active — l'emoji ci-dessous est ignoré tant qu'elle est définie." : 'Ou choisissez un emoji :'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, opacity: avatarImage ? 0.5 : 1 }}>
              {EMOJIS.map((e) => (
                <span key={e} onClick={() => { setEmoji(e === emoji ? '' : e); setAvatarImage(''); }} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 15, background: e === emoji ? 'var(--primary-soft)' : 'var(--border-soft)', border: e === emoji ? '1px solid var(--primary)' : '1px solid transparent' }}>{e}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {COLORS.map((c) => (
                <span key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: c === color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--primary)' : 'none' }} />
              ))}
            </div>
            <button className="btn" type="submit" disabled={savingProfile}>{savingProfile ? 'Enregistrement…' : 'Enregistrer le profil'}</button>
          </form>
        </Panel>

        <Panel title="Apparence" span={6}>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>Thème</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {THEME_MODES.map(({ value, label }) => (
                <span
                  key={value}
                  onClick={() => setTheme(value)}
                  className={theme === value ? 'btn' : 'btn-outline'}
                  style={{ padding: '0 14px', height: 32, display: 'inline-flex', alignItems: 'center' }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
              Système suit le réglage de votre appareil ; Auto (horaire) bascule sombre entre 20h et 7h, quel que soit l'appareil.
            </div>
          </div>
        </Panel>

        <Panel title="Sécurité" sub="Changer votre mot de passe" span={6}>
          <form onSubmit={savePassword} style={{ padding: 16 }}>
            <Field label="Mot de passe actuel"><input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
            <Field label="Nouveau mot de passe"><input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
            <Field label="Confirmation"><input className="input" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
            <button className="btn" type="submit" disabled={savingPassword}>{savingPassword ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
          </form>
        </Panel>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}
