import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './DevToolsPanel.css';

// Détecte les outils présents sur la machine qui héberge le backend (celle
// qui exécute réellement les actions de la console) — pas les postes des
// développeurs individuels, que la console ne peut pas inspecter.
export default function DevToolsPanel() {
  const { data } = useApi(() => api.get('/devtools'), []);
  const items = data?.items || [];
  const missing = items.filter((t) => !t.installed);

  return (
    <Panel title="Outils installés" sub="Sur la machine hébergeant la console — pas vos postes de développement" span={6}>
      <div className="dtp-list">
        {items.map((t) => (
          <div key={t.id} className="dtp-row">
            <Icon name={t.installed ? 'check' : 'x'} size={14} className="dtp-row-icon" style={{ color: t.installed ? 'var(--tone-ok-fg)' : 'var(--tone-faint-fg, var(--text-faint))' }} />
            <span className="dtp-row-label">{t.label}</span>
            <span className="mono faint dtp-row-detail">
              {t.installed ? t.version || t.path : 'Non installé'}
            </span>
          </div>
        ))}
        {missing.length > 0 && (
          <div className="faint dtp-missing-note">
            {missing.length} outil(s) manquant(s) : {missing.map((t) => t.label).join(', ')}.
          </div>
        )}
      </div>
    </Panel>
  );
}
