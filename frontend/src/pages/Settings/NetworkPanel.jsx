import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { api } from '../../lib/apiClient.js';
import { useApi } from '../../hooks/useApi.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './PlatformPanel.css';

// Domaine central de la plateforme (Lot C3, Groupe C) : sert de base aux URLs
// dev/staging générées par déploiement (voir ProjectDetailPage.jsx, section
// Environnements & déploiements). N'est réellement exploitable que si un
// reverse proxy (HAProxy ou Traefik) est configuré — même détection que
// networkTopologyService.js, exposée ici par GET /settings/network
// (`proxyAvailable`). L'onglet reste consultable même sans proxy configuré,
// mais le champ est désactivé et un état honnête l'explique plutôt que de
// laisser croire que le domaine servirait à quelque chose.
export default function NetworkPanel() {
  const { data, error, reload } = useApi(() => api.get('/settings/network'), []);
  const notify = useNotify();
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.network) setDomain(data.network.centralDomain || '');
  }, [data]);

  if (error) return <Panel title="Réseau" span={12}><div className="platform-error">Impossible de charger la configuration réseau : {error.message}</div></Panel>;
  if (!data) return null;

  const net = data.network;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings/network', { centralDomain: domain });
      notify('Domaine central enregistré', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="platform-form">
      <Panel
        title="Domaine central"
        sub="Domaine racine de la plateforme, utilisé pour générer les URLs de développement/staging par déploiement"
        span={12}
      >
        {!net.proxyAvailable && (
          <div className="faint" style={{ marginBottom: 12 }}>
            Aucun reverse proxy configuré (HAProxy ou Traefik) : le domaine peut être enregistré, mais aucune
            URL dev/staging ne sera générée tant qu'aucun des deux n'est configuré dans Intégrations.
          </div>
        )}
        <div className="platform-fields-grid">
          <Field label="Domaine racine" hint="Ex : nexus.example.com — sans http:// ni chemin">
            <input
              className="input"
              placeholder="nexus.example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
        </div>
        <div className="faint" style={{ marginTop: 12 }}>
          Structure d'URL générée selon les fournisseurs DNS configurés :{' '}
          {net.ovhConfigured
            ? <>sous-domaine dédié par déploiement (<code>env.app.{domain || 'domaine'}</code>) — OVH permet de créer réellement l'enregistrement.</>
            : net.duckdnsConfigured
              ? <>chemin sous le domaine central (<code>{domain || 'domaine'}/env-app/service</code>) — DuckDNS ne permet pas de créer de nouveaux sous-domaines via son API, un seul enregistrement existant est réutilisé.</>
              : <>chemin sous le domaine central (<code>{domain || 'domaine'}/env-app/service</code>) par défaut — aucun fournisseur DNS capable de créer un sous-domaine à la volée n'est configuré.</>}
        </div>
        <div className="platform-actions">
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </Panel>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="platform-field">
      <span className="platform-field-label">{label}</span>
      {children}
      {hint && <span className="faint platform-field-hint">{hint}</span>}
    </label>
  );
}
