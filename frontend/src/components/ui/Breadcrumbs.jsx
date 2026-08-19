import { Link } from 'react-router-dom';
import './Breadcrumbs.css';

// Fil d'Ariane générique : chaque item {label, to} est cliquable sauf le
// dernier (la page courante). `to` omis = texte non cliquable (contexte
// affiché mais sans page dédiée, ex. nom d'organisation sans fiche).
export default function Breadcrumbs({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <nav className="breadcrumbs" aria-label="Fil d'Ariane">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumbs-item">
            {item.to && !isLast ? (
              <Link to={item.to} className="breadcrumbs-link">{item.label}</Link>
            ) : (
              <span className={isLast ? 'breadcrumbs-current' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="breadcrumbs-sep">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
