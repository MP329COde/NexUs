import Icon from './Icon.jsx';
import './LoadingState.css';

// Indicateur de chargement partagé : jusqu'ici chaque page affichait juste un
// texte "Chargement…" sans repère visuel, alors que le spinner .spin
// (theme.css) et l'icône "refresh" existaient déjà (AdminOverviewPanel.jsx).
export default function LoadingState({ label = 'Chargement…', className = '' }) {
  return (
    <div className={`ui-loading ${className}`.trim()}>
      <Icon name="refresh" size={14} className="spin" />
      <span className="faint">{label}</span>
    </div>
  );
}
