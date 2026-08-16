import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10, padding: 16 }}>
        {blocked.map((i) => (
          <div key={i.key} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--border-soft)', opacity: 0.75 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icon name="alertTriangle" size={14} style={{ color: 'var(--tone-warn-fg)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{i.label}</span>
            </div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>
              {!i.configured ? 'Non configurée' : (i.message || 'Intégration en échec')}
            </div>
            {user?.role === 'admin' && (
              <Link to="/settings" className="btn-outline" style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', textDecoration: 'none' }}>
                Configurer
              </Link>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
