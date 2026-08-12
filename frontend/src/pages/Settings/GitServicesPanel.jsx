import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const FORGES = [
  { key: 'gitlab', label: 'GitLab' },
  { key: 'github', label: 'GitHub' }
];

export default function GitServicesPanel() {
  const { data, reload } = useApi(() => api.get('/settings'), []);
  const notify = useNotify();
  const [defaultForge, setDefaultForge] = useState('gitlab');
  const [testing, setTesting] = useState(null);

  useEffect(() => {
    if (data?.console?.defaultForge) setDefaultForge(data.console.defaultForge);
  }, [data]);

  async function save(forge) {
    setDefaultForge(forge);
    try {
      await api.put('/settings/console', { defaultForge: forge });
      notify(`Forge principale : ${FORGES.find((f) => f.key === forge)?.label}`, { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function test(forge) {
    setTesting(forge);
    try {
      const res = await api.post(`/settings/${forge}/test`, {});
      notify(res.status.message, { type: res.status.ok ? 'ok' : 'crit' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <Panel title="Forge principale" sub="Source de vérité des dépôts et pipelines" span={6}>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {FORGES.map((f) => (
              <span key={f.key} className={defaultForge === f.key ? 'btn' : 'btn-outline'} style={{ padding: '0 14px', height: 32, display: 'inline-flex', alignItems: 'center' }} onClick={() => save(f.key)}>
                {f.label}
              </span>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 11.5 }}>
            Détermine quelle forge est utilisée par défaut pour créer des sauvegardes/miroirs de dépôts et lier de nouveaux projets
            depuis Développement. Les identifiants de chaque forge se configurent dans Intégrations & outils.
          </p>
        </div>
      </Panel>

      <Panel title="Forges déclarées" sub="Portée et santé" span={6}>
        <div style={{ padding: 6 }}>
          {FORGES.map((f) => {
            const integ = data?.integrations?.[f.key];
            return (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{f.label}</span>
                <StatusBadge tone={toneFromStatus(integ)} label={integ?.configured ? 'Configuré' : 'Non configuré'} />
                <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => test(f.key)}>
                  <Icon name="refresh" size={12} className={testing === f.key ? 'spin' : ''} />Tester
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Miroirs sortants" sub="Réplication automatique entre forges" span={12}>
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Aucun miroir configuré — fonctionnalité à venir. Les jetons GitLab/GitHub déjà renseignés dans Intégrations & outils
          serviront de base à la réplication automatique une fois développée.
        </div>
      </Panel>
    </div>
  );
}
