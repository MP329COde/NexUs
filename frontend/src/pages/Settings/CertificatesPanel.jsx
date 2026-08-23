import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './CertificatesPanel.css';

// Lot B4 (Certificats) : écran centralisé listant toutes les intégrations
// HTTPS configurables (voir backend/src/services/tlsDiagnosticsService.js
// pour la liste exacte) avec leur statut TLS RÉEL — chaque ligne déclenche
// une vraie connexion TLS côté serveur au chargement, aucune donnée de
// certificat n'est inventée : un hôte injoignable reste affiché comme tel.
export default function CertificatesPanel() {
  const { data, error, reload } = useApi(() => api.get('/certificates'), []);
  const { data: modeData, reload: reloadMode } = useApi(() => api.get('/certificates/mode'), []);
  const notify = useNotify();
  const [testing, setTesting] = useState(null);
  const [results, setResults] = useState({});
  const [caInputs, setCaInputs] = useState({});
  const [busyCa, setBusyCa] = useState(null);
  const [modeBusy, setModeBusy] = useState(false);

  useEffect(() => {
    if (!data?.items) return;
    const next = {};
    for (const item of data.items) next[item.key] = item;
    setResults(next);
  }, [data]);

  async function testTls(key) {
    setTesting(key);
    try {
      const res = await api.post(`/certificates/${key}/test`, {});
      setResults((r) => ({ ...r, [key]: res.item }));
      notify(res.item.reachable === false
        ? `${res.item.label} : hôte injoignable (${res.item.error?.code || 'erreur'})`
        : `${res.item.label} : diagnostic TLS mis à jour`, { type: res.item.reachable === false ? 'crit' : 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setTesting(null);
    }
  }

  async function saveCa(key) {
    const pem = caInputs[key];
    if (!pem) return;
    setBusyCa(key);
    try {
      await api.post(`/certificates/${key}/ca`, { caCertPem: pem });
      notify('CA importée — relancez un test TLS pour vérifier.', { type: 'ok' });
      setCaInputs((c) => ({ ...c, [key]: '' }));
      await testTls(key);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyCa(null);
    }
  }

  async function removeCa(key) {
    setBusyCa(key);
    try {
      await api.del(`/certificates/${key}/ca`);
      notify('CA personnalisée retirée.', { type: 'ok' });
      await testTls(key);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusyCa(null);
    }
  }

  async function setMode(mode) {
    setModeBusy(true);
    try {
      await api.put('/certificates/mode', { mode });
      notify(`Mode TLS global : ${mode === 'strict' ? 'strict' : 'permissif'}`, { type: 'ok' });
      reloadMode();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setModeBusy(false);
    }
  }

  if (error) {
    return <div className="faint">Impossible de charger l'écran Certificats ({error.message}).</div>;
  }

  const mode = modeData?.mode || 'strict';

  return (
    <div className="certs-page">
      <Panel
        title="Mode de vérification TLS global"
        sub="Défaut appliqué visuellement lors de la configuration d'une nouvelle intégration. Le réglage « Ignorer le certificat » propre à chaque intégration prime toujours sur ce mode global — celui-ci ne modifie aucune connexion déjà configurée."
      >
        <div className="certs-mode-row">
          <button
            type="button"
            className={`btn ${mode === 'strict' ? 'btn-primary' : ''}`}
            disabled={modeBusy}
            onClick={() => setMode('strict')}
          >
            Strict (recommandé)
          </button>
          <button
            type="button"
            className={`btn ${mode === 'permissive' ? 'btn-primary' : ''}`}
            disabled={modeBusy}
            onClick={() => setMode('permissive')}
          >
            Permissif
          </button>
        </div>
      </Panel>

      {!data && !error && <div className="faint">Diagnostic TLS en cours pour toutes les intégrations…</div>}

      {(data?.items || []).map((initial) => {
        const item = results[initial.key] || initial;
        const cert = item.certificate;
        const expiringSoon = typeof item.daysUntilExpiry === 'number' && item.daysUntilExpiry < 30;
        return (
          <Panel
            key={item.key}
            title={item.label}
            sub={item.url || 'Non configuré (URL absente dans Paramètres → Intégrations & outils).'}
            actions={item.configured ? (
              <button type="button" className="btn" disabled={testing === item.key} onClick={() => testTls(item.key)}>
                {testing === item.key ? 'Test…' : 'Test TLS'}
              </button>
            ) : null}
          >
            {!item.configured && <div className="faint">Configurez d'abord l'URL de cette intégration dans l'onglet « Intégrations & outils ».</div>}

            {item.configured && item.reachable === false && (
              <div className="certs-status certs-status-crit">
                <StatusBadge tone="crit" label="Injoignable" />
                <span>{item.error?.code ? `${item.error.code} — ` : ''}{item.error?.message}</span>
              </div>
            )}

            {item.configured && item.reachable === true && (
              <>
                <div className="certs-status">
                  <StatusBadge tone={item.strict?.ok ? 'ok' : 'warn'} label={item.strict?.ok ? 'Vérification stricte OK' : 'Vérification stricte en échec'} />
                  {expiringSoon && <StatusBadge tone="crit" label={`Expire dans ${item.daysUntilExpiry} j`} />}
                  {item.allowSelfSigned && <StatusBadge tone="info" label="Ignorer le certificat activé" />}
                </div>
                {cert && (
                  <dl className="certs-cert-info">
                    <dt>Sujet</dt><dd>{cert.subject?.CN || JSON.stringify(cert.subject)}</dd>
                    <dt>Émetteur</dt><dd>{cert.issuer?.CN || JSON.stringify(cert.issuer)}</dd>
                    <dt>Valide du</dt><dd>{cert.validFrom}</dd>
                    <dt>Valide jusqu'au</dt><dd>{cert.validTo}</dd>
                  </dl>
                )}
                {!item.strict?.ok && item.suggestion && (
                  <div className="certs-suggestion">{item.suggestion}</div>
                )}
              </>
            )}

            {item.configured && item.supportsCaImport && (
              <div className="certs-ca-form">
                <div className="faint">
                  CA personnalisée {item.caCertPemSet ? 'importée' : 'non configurée'} pour cette intégration.
                </div>
                <textarea
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  value={caInputs[item.key] || ''}
                  onChange={(e) => setCaInputs((c) => ({ ...c, [item.key]: e.target.value }))}
                />
                <div className="certs-ca-actions">
                  <button type="button" className="btn" disabled={busyCa === item.key || !caInputs[item.key]} onClick={() => saveCa(item.key)}>
                    Importer la CA
                  </button>
                  {item.caCertPemSet && (
                    <button type="button" className="btn btn-danger" disabled={busyCa === item.key} onClick={() => removeCa(item.key)}>
                      Retirer la CA
                    </button>
                  )}
                </div>
              </div>
            )}
            {item.configured && !item.supportsCaImport && (
              <div className="faint">Import de CA non supporté pour cette intégration — utilisez « Ignorer la vérification du certificat » dans son formulaire si nécessaire.</div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
