import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import './BlockedFeaturesPanel.css';

// Liste, grisées, les intégrations non configurées ou en échec — avec leur
// raison exacte et un lien direct vers le réglage à corriger — pour répondre
// à "sous chaque fonction grisée, dire pourquoi et permettre de la débloquer".
export default function BlockedFeaturesPanel({ integrations }) {
  const { user } = useAuth();
  if (!integrations?.length) return null;
  const blocked = integrations.filter((i) => !i.configured || !i.ok);
  if (!blocked.length) return null;

  return (
    <Panel title="Fonctionnalités bloquées" sub={`${blocked.length} intégration(s) à corriger`} span={12}>
      <div className="bfp-grid">
        {blocked.map((i) => (
          <div key={i.key} className="bfp-card">
            <div className="bfp-card-head">
              <Icon name="alertTriangle" size={14} className="bfp-card-icon" />
              <span className="bfp-card-label">{i.label}</span>
            </div>
            <div className="faint bfp-card-reason">
              {!i.configured ? 'Non configurée' : (i.message || 'Intégration en échec')}
            </div>
            {user?.role === 'admin' && (
              <Link to="/settings" className="btn-outline bfp-card-fix-link">
                Configurer
              </Link>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
