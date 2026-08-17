import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import './NavCustomizeModal.css';

// Personnalisation de la navigation : masquer/afficher un élément, le
// déplacer entre barre latérale et en-tête, le réordonner, et ajouter des
// liens personnalisés (icône = un emoji, faute d'un jeu d'icônes ouvert aux
// libellés arbitraires). Purement local au navigateur (voir useNavItems.js).
export default function NavCustomizeModal({ nav, onClose }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('🔗');

  function submitCustom(e) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    nav.addCustom({ label: label.trim(), url: url.trim(), code: label.trim().slice(0, 3).toUpperCase(), icon: icon.trim() || '🔗' });
    setLabel('');
    setUrl('');
    setIcon('🔗');
  }

  return (
    <Modal title="Personnaliser la navigation" sub="Affichage local à ce navigateur — masquez, réordonnez ou déplacez un élément entre barre latérale et en-tête." onClose={onClose} width={520}>
      <div className="ncm-list">
        {nav.ordered.map((item, i) => {
          const hidden = nav.hiddenSet.has(item.id);
          const inHeader = nav.headerSet.has(item.id);
          return (
            <div key={item.id} className={`ncm-row${hidden ? ' ncm-row-hidden' : ''}`}>
              <span className="ncm-row-icon">
                {item.isCustom ? item.icon : <Icon name={item.id} size={15} />}
              </span>
              <span className="ncm-row-label">{item.label}</span>
              <span className="ncm-row-actions">
                <span className="ncm-btn" title="Monter" onClick={() => nav.move(item.id, -1)}>
                  <Icon name="chevronDown" size={13} style={{ transform: 'rotate(180deg)' }} />
                </span>
                <span className="ncm-btn" title="Descendre" onClick={() => nav.move(item.id, 1)}>
                  <Icon name="chevronDown" size={13} />
                </span>
                <span
                  className={`ncm-btn ncm-toggle${inHeader ? ' ncm-toggle-active' : ''}`}
                  title={inHeader ? "Dans l'en-tête — cliquer pour remettre en barre latérale" : "En barre latérale — cliquer pour déplacer dans l'en-tête"}
                  onClick={() => nav.toggleLocation(item.id)}
                >
                  {inHeader ? 'En-tête' : 'Latérale'}
                </span>
                <span className="ncm-btn" title={hidden ? 'Afficher' : 'Masquer'} onClick={() => nav.toggleHidden(item.id)}>
                  <Icon name={hidden ? 'eyeOff' : 'eye'} size={14} />
                </span>
                {item.isCustom && (
                  <span className="ncm-btn ncm-btn-danger" title="Supprimer ce lien" onClick={() => nav.removeCustom(item.id)}>
                    <Icon name="trash" size={13} />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <form onSubmit={submitCustom} className="ncm-add-form">
        <div className="ncm-add-title">Ajouter un lien personnalisé</div>
        <div className="ncm-add-row">
          <input className="input ncm-add-icon" placeholder="🔗" maxLength={2} value={icon} onChange={(e) => setIcon(e.target.value)} />
          <input className="input ncm-add-label" placeholder="Libellé" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input ncm-add-url" placeholder="URL ou chemin (ex: https://... ou /deployments)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" type="submit" disabled={!label.trim() || !url.trim()}>Ajouter</button>
        </div>
      </form>

      <div className="ncm-footer">
        <span className="btn-outline" onClick={() => { if (confirm('Réinitialiser la navigation par défaut ? Les liens personnalisés seront supprimés.')) nav.resetAll(); }}>
          Réinitialiser
        </span>
      </div>
    </Modal>
  );
}
