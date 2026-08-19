import Icon from './Icon.jsx';
import './Tabs.css';

// Onglets réutilisables : reprend le style déjà établi (border-bottom actif +
// couleur primaire) trouvé jusqu'ici réimplémenté à la main page par page
// (PodDetailDialog.jsx, ManifestExplorerModal.jsx, ContainersPage.jsx...).
export default function Tabs({ tabs, active, onChange, className = '', right = null }) {
  return (
    <div className={`ui-tabs ${className}`.trim()}>
      {tabs.map((t) => (
        <div
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`ui-tab${active === t.id ? ' ui-tab-active' : ''}`}
        >
          {t.icon && <Icon name={t.icon} size={13} />}
          {t.label}
        </div>
      ))}
      {right && <div className="ui-tabs-right">{right}</div>}
    </div>
  );
}
