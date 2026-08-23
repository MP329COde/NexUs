import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './GitServicesPanel.css';

const FORGES = [
  { key: 'gitlab', label: 'GitLab' },
  { key: 'github', label: 'GitHub' }
];

export default function GitServicesPanel() {
  const { data, reload } = useApi(() => api.get('/settings'), []);
  const notify = useNotify();
  const [defaultForge, setDefaultForge] = useState('gitlab');
  const [testing, setTesting] = useState(null);
  // Résultat du dernier test live par forge (non persisté côté backend) :
  // /settings ne renvoie que la config statique (`configured`), jamais un
  // `ok` réellement vérifié. On mémorise donc ici le dernier résultat obtenu
  // via /settings/:key/test pour que le badge reflète immédiatement le
  // vrai statut testé, sans devoir recharger toute la page.
  const [testedStatus, setTestedStatus] = useState({});

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
      setTestedStatus((s) => ({ ...s, [forge]: { ok: res.status.ok, message: res.status.message } }));
    } catch (err) {
      // err.message porte déjà la cause précise remontée par le backend
      // (ex: "GitLab: 401 ...", "GitLab: connexion impossible (ETIMEDOUT)"),
      // voir services/integrations/httpClient.js#request.
      notify(err.message, { type: 'crit' });
      setTestedStatus((s) => ({ ...s, [forge]: { ok: false, message: err.message } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="gitsvc-grid">
      <Panel title="Forge principale" sub="Source de vérité des dépôts et pipelines" span={6}>
        <div className="gitsvc-panel-body">
          <div className="gitsvc-forge-tabs">
            {FORGES.map((f) => (
              <span key={f.key} className={`${defaultForge === f.key ? 'btn' : 'btn-outline'} gitsvc-forge-tab`} onClick={() => save(f.key)}>
                {f.label}
              </span>
            ))}
          </div>
          <p className="faint gitsvc-hint">
            Détermine quelle forge est utilisée par défaut pour créer des sauvegardes/miroirs de dépôts et lier de nouveaux projets
            depuis Développement. Les identifiants de chaque forge se configurent dans Intégrations & outils.
          </p>
        </div>
      </Panel>

      <Panel title="Forges déclarées" sub="Portée et santé" span={6}>
        <div className="gitsvc-list">
          {FORGES.map((f) => {
            const integ = data?.integrations?.[f.key];
            // Le résultat d'un test live déclenché dans cette session prime sur
            // l'objet statique de /settings (qui ne contient jamais `ok`).
            const effective = testedStatus[f.key] ? { ...integ, ok: testedStatus[f.key].ok } : integ;
            return (
              <div key={f.key} className="gitsvc-row">
                <span className="gitsvc-row-label">{f.label}</span>
                <StatusBadge
                  tone={toneFromStatus(effective)}
                  label={
                    !effective?.configured
                      ? 'Non configuré'
                      : effective.ok === true ? 'Connecté' : effective.ok === false ? 'Erreur' : 'Configuré (non testé)'
                  }
                />
                <span className="btn-outline gitsvc-test-btn" onClick={() => test(f.key)}>
                  <Icon name="refresh" size={12} className={testing === f.key ? 'spin' : ''} />Tester
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Miroirs sortants" sub="Réplication automatique entre forges" span={12}>
        <div className="gitsvc-empty">
          Aucun miroir configuré — fonctionnalité à venir. Les jetons GitLab/GitHub déjà renseignés dans Intégrations & outils
          serviront de base à la réplication automatique une fois développée.
        </div>
      </Panel>
    </div>
  );
}
