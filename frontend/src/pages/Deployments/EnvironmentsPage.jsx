import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const ENV_ICON = { verrouillé: 'lock', protégé: 'shield', ouvert: 'server' };

// Démonstration : la console n'a pas de modèle multi-environnements (dev /
// intégration / staging / prod) au-delà d'un seul Argo CD + Kubernetes
// configurés. Nécessiterait une intégration par environnement pour être réel.
const SERVICES = [
  { name: 'api-gateway', dev: '2.9.0-rc3', int: '2.9.0-rc2', staging: '2.8.4', prod: '2.8.1', gap: '3 versions', tone: 'warn' },
  { name: 'web-front', dev: '4.3.0-rc1', int: '4.2.2', staging: '4.2.2', prod: '4.2.0', gap: '2 versions', tone: 'warn' },
  { name: 'worker-jobs', dev: '1.9.5', int: '1.9.4', staging: '1.9.4', prod: '1.9.4', gap: 'À jour', tone: 'ok' },
  { name: 'auth-bridge', dev: '0.6.1', int: '0.6.1', staging: '0.6.0', prod: '0.6.0', gap: '1 version', tone: 'info' }
];
const ENVS = [
  { name: 'développement', tint: '#94A3B8', vars: 12, note: 'secrets partagés · sans quota', state: 'ouvert' },
  { name: 'intégration', tint: '#3B82F6', vars: 14, note: 'jeux de données anonymisés', state: 'ouvert' },
  { name: 'staging', tint: '#F59E0B', vars: 16, note: 'miroir de production', state: 'protégé' },
  { name: 'production', tint: '#F43F5E', vars: 18, note: 'validation à deux personnes', state: 'verrouillé' }
];
const PROMOTIONS = [
  { text: 'api-gateway 2.8.1 promue en production', meta: 'il y a 2 min · validation requise', tone: 'ok' },
  { text: 'web-front 4.2.2 promue en staging', meta: 'automatique après tests', tone: 'ok' },
  { text: 'worker-jobs 1.9.4 rejetée en staging', meta: 'échec des tests d\'intégration', tone: 'crit' }
];

export default function EnvironmentsPage() {
  const notify = useNotify();
  const demo = () => notify('Fonctionnalité de démonstration — nécessite un environnement multi-étages réel pour être active', { type: 'info' });

  return (
    <>
      <PageHeader title="Environnements" sub="Versions déployées par environnement et promotion entre étages." />
      <DemoNote>
        Cette page illustre la mise en page cible pour un pipeline multi-environnements (dev/intégration/staging/prod).
        La console ne pilote aujourd'hui qu'un seul environnement Argo CD/Kubernetes : les données ci-dessous sont un jeu de démonstration.
      </DemoNote>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Environnements" value={ENVS.length} tint="#3B82F6" />
        <KpiCard label="Écart prod / staging" value={2} unit="versions" tint="#F59E0B" />
        <KpiCard label="Promotions 7j" value={9} tint="#8B5CF6" />
        <KpiCard label="Dernier gel" value="aucun" tint="#10B981" note="déploiements ouverts" />
      </div>

      <Panel title="Versions par environnement" sub="Source : Argo CD et registre (démonstration)" span={12} style={{ marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Service', 'Développement', 'Intégration', 'Staging', 'Production', 'Écart', 'Gestion'].map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((s) => (
                <tr key={s.name} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '10px 16px' }} className="mono muted">{s.dev}</td>
                  <td style={{ padding: '10px 16px' }} className="mono muted">{s.int}</td>
                  <td style={{ padding: '10px 16px' }} className="mono muted">{s.staging}</td>
                  <td style={{ padding: '10px 16px' }} className="mono muted">{s.prod}</td>
                  <td style={{ padding: '10px 16px' }}><span className={`badge badge-${s.tone}`}><span className="dot" />{s.gap}</span></td>
                  <td style={{ padding: '10px 16px' }}><span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={demo}>Promouvoir</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Configuration par environnement" sub="Variables et secrets distincts" span={7}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ENVS.map((e) => (
              <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.tint, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize' }}>{e.name}</div>
                  <div className="faint" style={{ fontSize: 11 }}>{e.vars} variables · {e.note}</div>
                </div>
                <span className="mono" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: e.tint, fontWeight: 700 }}>
                  <Icon name={ENV_ICON[e.state] || 'server'} size={12} />{e.state}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Promotions récentes" sub="7 derniers jours" span={5}>
          <div style={{ padding: 6 }}>
            {PROMOTIONS.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 10px' }}>
                <Icon name={p.tone === 'crit' ? 'xCircle' : 'check'} size={13} style={{ color: `var(--tone-${p.tone}-fg)`, flex: 'none', marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12.5 }}>{p.text}</div>
                  <div className="faint mono" style={{ fontSize: 10.5 }}>{p.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
