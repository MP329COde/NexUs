// Avatar utilisateur à trois niveaux de priorité : image importée > emoji >
// initiales sur fond de couleur. Centralisé ici pour que Header.jsx et
// AccountPage.jsx (et tout futur usage) restent cohérents sans dupliquer la
// logique d'affichage.
export default function Avatar({ user, size = 32, fontSize }) {
  const fs = fontSize || (user?.avatarEmoji ? Math.round(size * 0.47) : Math.round(size * 0.38));
  const initials = (user?.name || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();

  if (user?.avatarImage) {
    return (
      <img
        src={user.avatarImage}
        alt={user?.name || 'Avatar'}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }}
      />
    );
  }

  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: user?.avatarEmoji ? 'var(--border-soft)' : (user?.avatarColor || '#0F172A'),
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs, fontWeight: 600, flex: 'none'
      }}
    >
      {user?.avatarEmoji || initials}
    </div>
  );
}
