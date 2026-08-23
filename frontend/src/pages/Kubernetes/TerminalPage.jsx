import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './TerminalPage.css';

const VERB_HELP = {
  get: 'get pods|deployments|services [-n <namespace>]',
  logs: 'logs <pod> -n <namespace> [-c <conteneur>] [--tail 200]',
  describe: 'describe pod <nom> -n <namespace>',
  scale: 'scale deployment/<nom> --replicas=<n> -n <namespace>',
  restart: 'restart deployment/<nom> -n <namespace>',
  delete: 'delete pod/<nom> -n <namespace>',
  exec: 'exec <pod> -n <namespace> [-c <conteneur>] -- <commande>',
  apply: 'apply  (avec le manifest YAML/JSON dans le champ ci-dessous)'
};
const TIER_LABEL = { developer: 'Developer', maintainer: 'Maintainer', admin: 'Admin' };

// Terminal sécurisé : PAS un shell générique. Une grammaire de commandes
// kubectl-like fixe, routée côté serveur vers les mêmes fonctions que les
// boutons d'action des autres pages Kubernetes (voir terminalService.js) —
// jamais de commande arbitraire exécutée sur le serveur. Le palier
// (Developer/Maintainer/Admin) détermine les verbes disponibles ; un compte
// "user" sans palier assigné n'a par défaut aucun accès.
export default function TerminalPage() {
  const notify = useNotify();
  const perms = useApi(() => api.get('/terminal/permissions'), []);
  const accessRequest = useApi(() => api.get('/terminal/access-request'), []);
  const clusters = useApi(() => api.get('/kubernetes/clusters'), []);
  const [clusterId, setClusterId] = useState('');
  const [requestedTier, setRequestedTier] = useState('developer');
  const [reason, setReason] = useState('');
  const [requesting, setRequesting] = useState(false);

  async function submitAccessRequest(e) {
    e.preventDefault();
    setRequesting(true);
    try {
      await api.post('/terminal/access-request', { tier: requestedTier, reason });
      notify('Demande envoyée — un administrateur doit l\'approuver.', { type: 'ok' });
      accessRequest.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setRequesting(false);
    }
  }
  const [searchParams, setSearchParams] = useSearchParams();
  const [command, setCommand] = useState(searchParams.get('prefill') || '');
  const [manifest, setManifest] = useState('');
  const [showManifest, setShowManifest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [history]);
  useEffect(() => { if (searchParams.get('prefill')) setSearchParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clusterId && clusters.data?.items?.length) {
      setClusterId((clusters.data.items.find((c) => c.isDefault) || clusters.data.items[0]).id);
    }
  }, [clusters.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const tier = perms.data?.tier;
  const verbs = perms.data?.verbs || [];

  async function run(e) {
    e.preventDefault();
    if (!command.trim() || busy) return;
    setBusy(true);
    const entry = { command, manifest: command.trim() === 'apply' ? manifest : null, at: new Date().toISOString() };
    try {
      const res = await api.post('/terminal/run', { command, manifest: command.trim().startsWith('apply') ? manifest : undefined, clusterId: clusterId || undefined });
      entry.result = res.result;
    } catch (err) {
      entry.error = err.message;
    } finally {
      setHistory((h) => [...h, entry]);
      setCommand('');
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Terminal sécurisé"
        sub="Grammaire de commandes bornée — pas un shell : chaque verbe est routé vers l'API Kubernetes officielle, jamais vers le système."
        actions={tier && (
          <span className="badge badge-vio">
            <Icon name="shield" size={12} />Palier {TIER_LABEL[tier]}
          </span>
        )}
      />

      {!perms.loading && !tier && (
        <div className="card term-noaccess-card">
          <Icon name="lock" size={22} className="term-noaccess-icon" />
          <div className="term-noaccess-title">Aucun accès au terminal</div>
          <div className="faint term-noaccess-rules">
            Qui peut quoi : tout compte connecté peut demander un palier ci-dessous. Seul un administrateur
            (permission RBAC « terminal » = Admin) peut approuver ou refuser une demande, depuis Paramètres →
            Utilisateurs. Une fois approuvé, le palier accordé (Developer/Maintainer/Admin) détermine les verbes
            kubectl-like disponibles ; les comptes admin de la plateforme ont toujours le palier Admin.
          </div>
          {accessRequest.data?.pending ? (
            <div className="faint term-noaccess-pending">
              Demande de palier <strong>{TIER_LABEL[accessRequest.data.pending.requestedTier]}</strong> envoyée le {new Date(accessRequest.data.pending.createdAt).toLocaleString('fr-FR')} — en attente d'un administrateur.
            </div>
          ) : (
            <form onSubmit={submitAccessRequest} className="term-request-form">
              <div className="faint term-request-intro">
                Demandez un palier — un administrateur recevra une notification et pourra l'approuver depuis Paramètres → Utilisateurs.
              </div>
              <label className="term-request-label">Palier souhaité</label>
              <select className="input term-request-select" value={requestedTier} onChange={(e) => setRequestedTier(e.target.value)}>
                <option value="developer">Developer — lecture seule (get, logs, describe)</option>
                <option value="maintainer">Maintainer — lecture + scale/restart</option>
              </select>
              <label className="term-request-label">Motif (optionnel)</label>
              <input className="input term-request-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. débogage du déploiement api-gateway" />
              <button className="btn term-request-submit" type="submit" disabled={requesting}>
                {requesting ? 'Envoi…' : "Demander l'accès"}
              </button>
            </form>
          )}
        </div>
      )}

      {tier && (
        <div className="term-grid">
          <Panel
            title="Session"
            sub={`Verbes autorisés : ${verbs.join(', ')}`}
            span={9}
            actions={clusters.data?.items?.length > 1 && (
              <select
                className="input term-cluster-select"
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
                title="Cluster ciblé par les commandes"
              >
                {clusters.data.items.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.isDefault ? ' (défaut)' : ''}</option>
                ))}
              </select>
            )}
          >
            <div ref={scrollRef} className="mono term-session">
              {history.length === 0 && <div className="faint">Tapez une commande ci-dessous — {VERB_HELP[verbs[0]]}</div>}
              {history.map((h, i) => (
                <div key={i} className="term-entry">
                  <div className="term-entry-cmd">$ {h.command}</div>
                  {h.error && <div className="term-entry-error">{h.error}</div>}
                  {h.result && <ResultView result={h.result} />}
                </div>
              ))}
            </div>
            <form onSubmit={run} className="term-form">
              <div className="term-form-row">
                <span className="mono term-form-prompt">$</span>
                <input
                  className="input mono term-form-input" autoFocus
                  value={command} onChange={(e) => setCommand(e.target.value)}
                  placeholder="get pods -n default"
                />
                <button className="btn" type="submit" disabled={busy || !command.trim()}>{busy ? '…' : 'Exécuter'}</button>
              </div>
              <label className="term-manifest-toggle">
                <input type="checkbox" checked={showManifest} onChange={(e) => setShowManifest(e.target.checked)} />
                Joindre un manifest (pour "apply")
              </label>
              {showManifest && (
                <textarea
                  className="input mono term-manifest-textarea"
                  value={manifest} onChange={(e) => setManifest(e.target.value)}
                  placeholder={'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: exemple\n  namespace: default\ndata:\n  cle: valeur'}
                />
              )}
            </form>
          </Panel>

          <Panel title="Aide-mémoire" sub="Syntaxe par verbe" span={3}>
            <div className="term-help-list">
              {Object.entries(VERB_HELP).map(([verb, syntax]) => (
                <div key={verb} className={verbs.includes(verb) ? '' : 'term-help-item-disabled'}>
                  <div className="mono term-help-verb">{verb}</div>
                  <div className="mono faint term-help-syntax">{syntax}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function ResultView({ result }) {
  if (result.rows) {
    return (
      <table className="term-result-table">
        <tbody>
          {result.rows.length === 0 && <tr><td className="faint">(vide)</td></tr>}
          {result.rows.map((r, i) => (
            <tr key={i}>
              <td className="term-result-cell">{Object.values(r).slice(0, 5).join('  ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (result.text !== undefined) {
    return <pre className="term-result-pre">{result.text || '(vide)'}</pre>;
  }
  if (result.stdout !== undefined) {
    return (
      <div className="term-result-stdout">
        {result.stdout && <pre className="term-result-stdout-pre">{result.stdout}</pre>}
        {result.stderr && <pre className="term-result-stderr-pre">{result.stderr}</pre>}
        <div className="faint">status: {result.status}</div>
      </div>
    );
  }
  if (result.object) {
    return <pre className="term-result-object-pre">{JSON.stringify(result.object, null, 2)}</pre>;
  }
  if (result.message) {
    return <div className="term-result-message">{result.message}</div>;
  }
  return <pre className="term-result-fallback-pre">{JSON.stringify(result, null, 2)}</pre>;
}
