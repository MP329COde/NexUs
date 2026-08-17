import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import './Modal.css';

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
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="card modal-card"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">{title}</div>
            {sub && <div className="faint modal-sub">{sub}</div>}
          </div>
          <div className="modal-header-actions">
            {headerActions}
            <span onClick={onClose} className="modal-close-btn"><Icon name="x" size={16} /></span>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-footer">{actions}</div>}
      </div>
    </div>
  ), document.body);
}
