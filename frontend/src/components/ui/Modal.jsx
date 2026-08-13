import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// Popup générique (overlay + carte centrée + fermeture Échap/clic extérieur),
// pour séparer les actions ponctuelles (formulaire, script, détail) du flux
// normal de la page plutôt que de les dérouler en ligne.
//
// Rendu via un portail dans document.body à dessein : `.route-page` (Shell.jsx)
// porte l'animation d'entrée `pageIn`, qui anime `transform`. Tant que son
// fill-mode ("both") maintient cet effet, l'élément devient un containing
// block pour tout descendant en `position: fixed` — le popup se positionnait
// alors par rapport au conteneur de page (et sa hauteur totale, scrollée
// comprise) plutôt que par rapport au viewport, d'où des popups mal centrées
// et mal dimensionnées. Le portail sort complètement de cette sous-arborescence.
//
// `minHeight: 0` sur le corps est nécessaire : un enfant flex a par défaut
// `min-height: auto`, ce qui l'empêche de rétrécir sous la taille de son
// contenu et casse le `overflow: auto` prévu (le popup grandissait alors
// au-delà de maxHeight au lieu de faire défiler son contenu). `flex: none`
// sur l'en-tête/le pied évite qu'ils se compriment quand le contenu déborde.
export default function Modal({ title, sub, onClose, width = 480, children, actions, headerActions }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal((
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, animation: 'fadeIn .12s ease' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: width, maxHeight: '86vh', display: 'flex', flexDirection: 'column', animation: 'popIn .14s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-soft)', flex: 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'break-word' }}>{title}</div>
            {sub && <div className="faint" style={{ fontSize: 11.5, marginTop: 2, overflowWrap: 'break-word' }}>{sub}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {headerActions}
            <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}><Icon name="x" size={16} /></span>
          </div>
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 16 }}>{children}</div>
        {actions && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-soft)', flex: 'none' }}>{actions}</div>}
      </div>
    </div>
  ), document.body);
}
