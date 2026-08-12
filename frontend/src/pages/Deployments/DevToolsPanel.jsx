import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

// Détecte les outils présents sur la machine qui héberge le backend (celle
// qui exécute réellement les actions de la console) — pas les postes des
// développeurs individuels, que la console ne peut pas inspecter.
export default function DevToolsPanel() {
  const { data } = useApi(() => api.get('/devtools'), []);
  const items = data?.items || [];
  const missing = items.filter((t) => !t.installed);

  return (
    <Panel title="Outils installés" sub="Sur la machine hébergeant la console — pas vos postes de développement" span={6}>
      <div style={{ padding: 6 }}>
        {items.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}>
            <Icon name={t.installed ? 'check' : 'x'} size={14} style={{ color: t.installed ? 'var(--tone-ok-fg)' : 'var(--tone-faint-fg, var(--text-faint))', flex: 'none' }} />
            <span style={{ fontSize: 13, fontWeight: 500, width: 100 }}>{t.label}</span>
            <span className="mono faint" style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.installed ? t.version || t.path : 'Non installé'}
            </span>
          </div>
        ))}
        {missing.length > 0 && (
          <div className="faint" style={{ fontSize: 11, padding: '10px 12px 4px' }}>
            {missing.length} outil(s) manquant(s) : {missing.map((t) => t.label).join(', ')}.
          </div>
        )}
      </div>
    </Panel>
  );
}
