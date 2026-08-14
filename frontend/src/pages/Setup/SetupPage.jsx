import { useState } from 'react';
import { api } from '../../lib/apiClient.js';
import BrandMark from '../../components/ui/BrandMark.jsx';
import Icon from '../../components/ui/Icon.jsx';
import InstallScreen from './InstallScreen.jsx';
import IntegrationPanel from '../Settings/IntegrationPanel.jsx';
import { INTEGRATION_FORMS, INTEGRATION_ORDER } from '../../config/integrationForms.js';

const TIMEZONES = ['Europe/Paris', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles'];
const LANGUAGES = [['fr', 'Français'], ['en', 'English']];
const DATE_FORMATS = [['dd/MM/yyyy', 'JJ/MM/AAAA'], ['MM/dd/yyyy', 'MM/JJ/AAAA'], ['yyyy-MM-dd', 'AAAA-MM-JJ']];
const IDENTITY_PROVIDERS = [['authentik-oidc', 'Authentik (OIDC)'], ['generic-oidc', 'OIDC générique'], ['ldap', 'Annuaire LDAP'], ['none', 'Aucun (mot de passe local uniquement)']];
const GIT_FORGES = [['gitea', 'Gitea'], ['gitlab', 'GitLab'], ['github', 'GitHub']];
const BRANCHES = ['main', 'master', 'develop'];

// L'assistant précède le choix de thème par l'utilisateur (Paramètres →
// Apparence) : son panneau de contenu reste toujours clair, quel que soit le
// thème système, en réaffectant localement les variables CSS de theme.css
// plutôt qu'en les laissant hériter du data-theme='dark' posé sur <html>.
const LIGHT_VARS = {
  '--bg': '#F6F7F9', '--surface': '#FFFFFF', '--border': '#E5E7EB', '--border-soft': '#F1F5F9',
  '--text': '#0F172A', '--text-muted': '#64748B', '--text-faint': '#94A3B8', '--text-faintest': '#CBD5E1',
  '--primary': '#2563EB', '--primary-hover': '#1D4ED8', '--primary-soft': '#EFF6FF',
  '--tone-crit-fg': '#BE123C', '--tone-crit-bg': '#FFF1F2', '--tone-crit-br': '#FECDD3'
};

// `installable: true` doit rester synchronisé avec le catalogue fermé de
// scripts d'installation côté backend (services/serviceCatalog.js) : seuls
// les outils qui s'installent via une image Docker officielle en conteneur
// unique y figurent. Les autres (plusieurs conteneurs liés, ou service SaaS
// comme GitHub) n'ont pas d'installation automatisée depuis cet assistant —
// la carte reste sélectionnable pour la configuration ultérieure côté
// Paramètres, mais sans le formulaire machine/SSH.
const TOOL_CATALOG = [
  { id: 'wazuh', label: 'Wazuh', category: 'Sécurité · SIEM & XDR', url: 'https://wazuh.com', installable: false },
  { id: 'prometheus', label: 'Prometheus', category: 'Supervision · métriques', url: 'https://prometheus.io', installable: true },
  { id: 'grafana', label: 'Grafana', category: 'Supervision · tableaux de bord', url: 'https://grafana.com', installable: true },
  { id: 'loki', label: 'Loki', category: 'Supervision · journaux', url: 'https://grafana.com/oss/loki/', installable: true },
  { id: 'alertmanager', label: 'Alertmanager', category: 'Supervision · routage d’alertes', url: 'https://prometheus.io/docs/alerting/latest/alertmanager/', installable: true },
  { id: 'zabbix', label: 'Zabbix', category: 'Supervision · agents SNMP', url: 'https://www.zabbix.com', installable: false },
  { id: 'uptime-kuma', label: 'Uptime Kuma', category: 'Supervision · sondes externes', url: 'https://github.com/louislam/uptime-kuma', installable: true },
  { id: 'netdata', label: 'Netdata', category: 'Supervision · temps réel hôte', url: 'https://www.netdata.cloud', installable: true },
  { id: 'influxdb', label: 'InfluxDB', category: 'Supervision · séries temporelles', url: 'https://www.influxdata.com', installable: true },
  { id: 'suricata', label: 'Suricata', category: 'Sécurité · IDS/IPS', url: 'https://suricata.io', installable: false },
  { id: 'crowdsec', label: 'CrowdSec', category: 'Sécurité · réputation & bans', url: 'https://www.crowdsec.net', installable: true },
  { id: 'openvas', label: 'OpenVAS', category: 'Sécurité · scan de vulnérabilités', url: 'https://www.greenbone.net/en/community-edition/', installable: false },
  { id: 'trivy', label: 'Trivy', category: 'Sécurité · analyse d’images', url: 'https://trivy.dev', installable: true },
  { id: 'vault', label: 'HashiCorp Vault', category: 'Sécurité · coffre de secrets', url: 'https://www.vaultproject.io', installable: true },
  { id: 'step-ca', label: 'step-ca', category: 'Sécurité · autorité de certification', url: 'https://smallstep.com/docs/step-ca/', installable: true },
  { id: 'authentik', label: 'Authentik', category: 'Identité · OIDC & SAML', url: 'https://goauthentik.io', installable: false },
  { id: 'keycloak', label: 'Keycloak', category: 'Identité · OIDC', url: 'https://www.keycloak.org', installable: true },
  { id: 'gitea', label: 'Gitea', category: 'Git · forge auto-hébergée', url: 'https://about.gitea.com', installable: true },
  { id: 'gitlab', label: 'GitLab', category: 'Git · forge & CI', url: 'https://about.gitlab.com', installable: true },
  { id: 'github', label: 'GitHub', category: 'Git · miroirs & actions', url: 'https://github.com', installable: false },
  { id: 'woodpecker', label: 'Woodpecker CI', category: 'Livraison · pipelines', url: 'https://woodpecker-ci.org', installable: true },
  { id: 'jenkins', label: 'Jenkins', category: 'Livraison · pipelines', url: 'https://www.jenkins.io', installable: true },
  { id: 'sonarqube', label: 'SonarQube', category: 'Livraison · qualité de code', url: 'https://www.sonarsource.com/products/sonarqube/', installable: true },
  { id: 'harbor', label: 'Harbor', category: 'Livraison · registre d’images', url: 'https://goharbor.io', installable: false }
];

const DEFAULT_TOOL_CONFIG = { address: '', port: 22, sshUser: 'root', autoInstall: false };

const STEPS = [
  { key: 'organisation', label: 'Organisation', title: 'Organisation', sub: "Identité de l'instance, langue et fuseau horaire." },
  { key: 'admin', label: 'Compte administrateur', title: 'Compte administrateur', sub: 'Premier compte de la plateforme : le seul autorisé à modifier la configuration globale.' },
  { key: 'identity', label: 'Connexion & identité', title: 'Connexion & identité', sub: "Fournisseur d'identité et politique d'accès. Tout reste modifiable ensuite." },
  { key: 'git', label: 'Services Git', title: 'Services Git', sub: 'Forge principale utilisée pour le code, les pipelines et le GitOps.' },
  { key: 'services', label: 'Services à connecter', title: 'Services à connecter', sub: "Connectez et testez dès maintenant les outils déjà installés sur votre infrastructure. Entièrement facultatif — chaque service reste configurable et testable plus tard depuis Paramètres." },
  { key: 'tools', label: 'Outils à installer', title: 'Outils à installer', sub: "Sélectionnez les outils à déployer automatiquement au premier démarrage. Les autres s'installent plus tard depuis le catalogue." },
  { key: 'ready', label: 'Prêt', title: 'Prêt', sub: "Récapitulatif avant l'ouverture de la console." }
];

const DEFAULT_FORM = {
  organisation: { consoleName: 'Nexus Console', instanceUrl: '', timezone: 'Europe/Paris', language: 'fr', dateFormat: 'dd/MM/yyyy', contactEmail: '' },
  admin: { name: '', username: '', email: '', password: '', confirm: '', mfaRequired: true, backupCodes: true },
  identity: { provider: 'authentik-oidc', mfaRequired: true, sessionMinutes: 480, minPasswordLength: 14, allowedNetworks: '', logoutOnInactivity: true },
  git: { forge: 'gitea', baseUrl: '', org: '', token: '', defaultBranch: 'main', autoWebhooks: true, outboundMirrors: false, requireSignedCommits: false },
  tools: ['wazuh', 'prometheus', 'grafana', 'gitea'],
  toolsConfig: {}
};

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  // L'assistant crée le compte administrateur dès la fin de l'étape 2
  // (plutôt qu'à la toute fin) : une session existe alors déjà, ce qui permet
  // aux étapes suivantes de réutiliser les vraies routes authentifiées
  // (PUT /identity, PUT et POST /settings/:key) et donc de tester une
  // connexion réelle (Kubernetes, GitLab, Proxmox...) pendant l'assistant.
  const [accountCreated, setAccountCreated] = useState(false);
  const [settingsData, setSettingsData] = useState(null);

  async function reloadSettings() {
    try {
      const res = await api.get('/settings');
      setSettingsData(res);
    } catch {
      // Le rechargement échoue silencieusement : chaque IntegrationPanel
      // affiche déjà sa propre erreur de sauvegarde/test le cas échéant.
    }
  }

  function setSection(section, patch) {
    setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));
  }

  function toggleTool(id) {
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(id) ? f.tools.filter((t) => t !== id) : [...f.tools, id]
    }));
  }

  function setToolConfig(id, patch) {
    setForm((f) => ({
      ...f,
      toolsConfig: { ...f.toolsConfig, [id]: { ...DEFAULT_TOOL_CONFIG, ...f.toolsConfig[id], ...patch } }
    }));
  }

  function validateStep(index) {
    if (STEPS[index].key === 'admin') {
      const { name, email, password, confirm } = form.admin;
      if (!name.trim()) return "Le nom de l'administrateur est requis";
      if (!email.trim()) return 'Adresse e-mail requise';
      if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
      if (password !== confirm) return 'Les mots de passe ne correspondent pas';
    }
    return null;
  }

  function goTo(index) {
    setError(null);
    setStep(Math.max(0, Math.min(STEPS.length - 1, index)));
  }

  async function next() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    const key = STEPS[step].key;
    setError(null);
    setBusy(true);
    try {
      if (key === 'admin') {
        if (!accountCreated) {
          await api.post('/setup', { organisation: form.organisation, admin: form.admin });
          setAccountCreated(true);
          reloadSettings();
        }
      } else if (key === 'identity') {
        await api.put('/identity', form.identity);
      } else if (key === 'git') {
        const forge = form.git.forge;
        if (forge && form.git.baseUrl.trim()) {
          await api.put(`/settings/${forge}`, {
            baseUrl: form.git.baseUrl,
            org: form.git.org,
            token: form.git.token,
            defaultBranch: form.git.defaultBranch,
            autoWebhooks: form.git.autoWebhooks,
            outboundMirrors: form.git.outboundMirrors,
            requireSignedCommits: form.git.requireSignedCommits
          });
          reloadSettings();
        }
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (step === STEPS.length - 1) {
      submit();
      return;
    }
    goTo(step + 1);
  }

  function skip() {
    if (STEPS[step].key === 'admin') return; // le compte administrateur est obligatoire
    goTo(step + 1);
  }

  function skipAll() {
    // Le compte administrateur reste requis même en passant tout le reste :
    // sans lui, aucune session n'existe et /setup redirigerait indéfiniment ici.
    goTo(accountCreated ? STEPS.length - 1 : 1);
  }

  function submit() {
    // Le compte, l'identité, la forge Git et les services réels sont déjà
    // enregistrés au fil de l'assistant (voir next()) : il ne reste plus qu'à
    // lancer l'installation automatique des outils sélectionnés, s'il y en a.
    const toInstall = form.tools
      .map((id) => ({ id, cfg: form.toolsConfig[id] }))
      .filter(({ id, cfg }) => TOOL_CATALOG.find((t) => t.id === id)?.installable && cfg?.autoInstall && cfg?.address?.trim());

    if (toInstall.length === 0) {
      // Rechargement complet plutôt qu'une navigation client : SetupGate ne
      // revérifie needsSetup qu'au montage, ce qui provoquerait sinon une
      // redirection immédiate vers /setup juste après sa propre résolution.
      window.location.href = '/';
      return;
    }
    setInstalling(true);
  }

  const current = STEPS[step];

  if (installing) {
    const jobsToStart = form.tools
      .map((id) => ({ id, label: TOOL_CATALOG.find((t) => t.id === id)?.label || id, ...form.toolsConfig[id] }))
      .filter((t) => TOOL_CATALOG.find((cat) => cat.id === t.id)?.installable && t.autoInstall && t.address?.trim());
    return <InstallScreen tools={jobsToStart} onFinish={() => { window.location.href = '/'; }} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0B1120' }}>
      <aside style={{ width: 280, flex: 'none', display: 'flex', flexDirection: 'column', padding: '20px 16px', color: '#E7ECF5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 24px' }}>
          <BrandMark size={28} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Nexus Console</span>
        </div>

        <div style={{ padding: '0 4px', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Configuration initiale</div>
          <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: '#6B7A9C' }}>
            Sept étapes pour ouvrir la console : organisation, administrateur, identité, Git, services à connecter et outils.
          </p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {STEPS.map((s, i) => {
            const state = i === step ? 'current' : i < step ? 'done' : 'pending';
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => (i <= step ? goTo(i) : null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
                  background: 'transparent', border: 'none', textAlign: 'left',
                  cursor: i <= step ? 'pointer' : 'default'
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: state === 'done' ? '#10B981' : state === 'current' ? '#2563EB' : 'transparent',
                  border: state === 'pending' ? '1px solid #2A3552' : 'none',
                  color: state === 'pending' ? '#6B7A9C' : '#fff'
                }}>
                  {state === 'done' ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: state === 'current' ? 600 : 500, color: state === 'pending' ? '#6B7A9C' : '#E7ECF5' }}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <div style={{ height: 3, borderRadius: 2, background: '#1A2338', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, background: '#10B981', transition: 'width .2s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#6B7A9C' }}>
            <span>étape {step + 1} / {STEPS.length}</span>
            {step < STEPS.length - 1 && (
              <button type="button" onClick={skipAll} style={{ background: 'none', border: 'none', color: '#6B7A9C', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                passer
              </button>
            )}
          </div>
        </div>
      </aside>

      <main style={{ ...LIGHT_VARS, flex: 1, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ padding: '32px 40px 20px', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{current.title}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{current.sub}</p>
        </div>

        <div style={{ flex: 1, padding: '28px 40px', overflowY: 'auto' }}>
          <div style={{ maxWidth: current.key === 'tools' || current.key === 'services' ? 1100 : 620 }}>
            {current.key === 'organisation' && <StepOrganisation form={form.organisation} set={(p) => setSection('organisation', p)} />}
            {current.key === 'admin' && <StepAdmin form={form.admin} set={(p) => setSection('admin', p)} />}
            {current.key === 'identity' && <StepIdentity form={form.identity} set={(p) => setSection('identity', p)} />}
            {current.key === 'git' && <StepGit form={form.git} set={(p) => setSection('git', p)} />}
            {current.key === 'services' && (
              accountCreated
                ? <StepServices settingsData={settingsData} reloadSettings={reloadSettings} />
                : <Card><p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Le compte administrateur doit être créé avant de pouvoir connecter un service (retournez à l'étape précédente).</p></Card>
            )}
            {current.key === 'tools' && (
              <StepTools selected={form.tools} onToggle={toggleTool} toolsConfig={form.toolsConfig} setToolConfig={setToolConfig} />
            )}
            {current.key === 'ready' && <StepReady form={form} settingsData={settingsData} />}

            {error && (
              <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--tone-crit-fg)', background: 'var(--tone-crit-bg)', border: '1px solid var(--tone-crit-br)', borderRadius: 8, padding: '10px 12px' }}>
                {error}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 40px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {step > 0 && (
              <button type="button" className="btn-outline" onClick={() => goTo(step - 1)}>Retour</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {current.key !== 'ready' && current.key !== 'admin' && (
              <button type="button" onClick={skip} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12.5 }}>
                Configurer plus tard
              </button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={next}>
              {current.key === 'ready' ? (busy ? 'Ouverture…' : 'Ouvrir la console') : 'Continuer'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function StepOrganisation({ form, set }) {
  return (
    <Card>
      <Field label="Nom de l'organisation" hint="Affiché dans l'en-tête et les rapports">
        <input className="input" value={form.consoleName} onChange={(e) => set({ consoleName: e.target.value })} />
      </Field>
      <Field label="URL de l'instance" hint="Base des liens envoyés par notification">
        <input className="input" placeholder="https://console.nexus.lan" value={form.instanceUrl} onChange={(e) => set({ instanceUrl: e.target.value })} />
      </Field>
      <Field label="Fuseau horaire" hint="Horodatage des journaux et planifications">
        <select className="input" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </Field>
      <Field label="Langue de l'interface" hint="Appliquée à tous les utilisateurs par défaut">
        <select className="input" value={form.language} onChange={(e) => set({ language: e.target.value })}>
          {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Format de date">
        <select className="input" value={form.dateFormat} onChange={(e) => set({ dateFormat: e.target.value })}>
          {DATE_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Adresse de contact" hint="Destinataire des demandes internes">
        <input className="input" type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
      </Field>
    </Card>
  );
}

function StepAdmin({ form, set }) {
  return (
    <Card>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-faint)' }}>
        Aucun administrateur n'existe encore. Créez le premier compte pour terminer l'installation.
      </p>
      <Field label="Nom complet" hint="Premier compte administrateur de l'instance">
        <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Administrateur" />
      </Field>
      <Field label="Identifiant" hint="Nom d'affichage interne — la connexion utilise l'adresse e-mail">
        <input className="input" value={form.username} onChange={(e) => set({ username: e.target.value })} placeholder="alex.lambert" autoComplete="off" />
      </Field>
      <Field label="Adresse électronique" hint="Reçoit les alertes critiques et les invitations">
        <input className="input" type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label="Mot de passe initial" hint="8 caractères minimum, à changer à la première connexion">
        <input className="input" type="password" required value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
      </Field>
      <Field label="Confirmation">
        <input className="input" type="password" required value={form.confirm} onChange={(e) => set({ confirm: e.target.value })} autoComplete="new-password" />
      </Field>
      <Toggle label="Exiger le MFA dès la première connexion" hint="WebAuthn ou TOTP" checked={form.mfaRequired} onChange={(v) => set({ mfaRequired: v })} />
      <Toggle label="Générer des codes de secours" hint="10 codes à usage unique" checked={form.backupCodes} onChange={(v) => set({ backupCodes: v })} />
    </Card>
  );
}

function StepIdentity({ form, set }) {
  return (
    <Card>
      <Field label="Fournisseur d'identité" hint="OIDC ou LDAP pour l'authentification centralisée">
        <select className="input" value={form.provider} onChange={(e) => set({ provider: e.target.value })}>
          {IDENTITY_PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Toggle label="MFA obligatoire" hint="Refuse la connexion sans second facteur" checked={form.mfaRequired} onChange={(v) => set({ mfaRequired: v })} />
      <Field label="Durée de session" hint="minutes">
        <input className="input" type="number" min={5} max={10080} value={form.sessionMinutes} onChange={(e) => set({ sessionMinutes: Number(e.target.value) })} />
      </Field>
      <Field label="Longueur minimale du mot de passe" hint="caractères">
        <input className="input" type="number" min={8} max={128} value={form.minPasswordLength} onChange={(e) => set({ minPasswordLength: Number(e.target.value) })} />
      </Field>
      <Field label="Réseaux autorisés" hint="Un CIDR par ligne">
        <textarea className="input" style={{ height: 74, padding: 8, resize: 'vertical' }} placeholder={'10.0.0.0/8\n10.9.0.0/24'} value={form.allowedNetworks} onChange={(e) => set({ allowedNetworks: e.target.value })} />
      </Field>
      <Toggle label="Déconnexion sur inactivité" hint="Après 30 minutes sans activité" checked={form.logoutOnInactivity} onChange={(v) => set({ logoutOnInactivity: v })} />
    </Card>
  );
}

function StepGit({ form, set }) {
  return (
    <Card>
      <Field label="Forge principale" hint="Source de vérité des dépôts">
        <select className="input" value={form.forge} onChange={(e) => set({ forge: e.target.value })}>
          {GIT_FORGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="URL de la forge" hint="Racine de l'API v1">
        <input className="input" placeholder="https://git.lab.local" value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />
      </Field>
      <Field label="Organisation" hint="Espace de noms par défaut">
        <input className="input" value={form.org} onChange={(e) => set({ org: e.target.value })} />
      </Field>
      <Field label="Jeton d'accès" hint="Portée : repo, admin:repo_hook">
        <input className="input" type="password" value={form.token} onChange={(e) => set({ token: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="Branche par défaut" hint="Appliquée aux nouveaux dépôts">
        <select className="input" value={form.defaultBranch} onChange={(e) => set({ defaultBranch: e.target.value })}>
          {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Toggle label="Créer les webhooks automatiquement" hint="Déclenche les pipelines à chaque poussée" checked={form.autoWebhooks} onChange={(v) => set({ autoWebhooks: v })} />
      <Toggle label="Miroirs sortants" hint="Réplication vers GitHub toutes les heures" checked={form.outboundMirrors} onChange={(v) => set({ outboundMirrors: v })} />
      <Toggle label="Exiger des commits signés" hint="Refuse les poussées non signées sur main" checked={form.requireSignedCommits} onChange={(v) => set({ requireSignedCommits: v })} />
    </Card>
  );
}

function StepTools({ selected, onToggle, toolsConfig, setToolConfig }) {
  const selectedTools = TOOL_CATALOG.filter((t) => selected.includes(t.id));
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {TOOL_CATALOG.map((tool) => {
          const checked = selected.includes(tool.id);
          return (
            <label
              key={tool.id}
              className="card"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, cursor: 'pointer', position: 'relative',
                borderColor: checked ? 'var(--primary)' : 'var(--border)',
                background: checked ? 'var(--primary-soft)' : 'var(--surface)'
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => onToggle(tool.id)} style={{ marginTop: 2 }} />
              <span style={{ flex: 1, paddingRight: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{tool.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tool.category}</div>
              </span>
              <button
                type="button"
                title={`Ouvrir le site officiel de ${tool.label}`}
                aria-label={`Ouvrir le site officiel de ${tool.label}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(tool.url, '_blank', 'noopener,noreferrer'); }}
                style={{
                  position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-faint)', padding: 2, display: 'flex'
                }}
              >
                <Icon name="externalLink" size={14} />
              </button>
            </label>
          );
        })}
      </div>

      {selectedTools.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Configuration des outils sélectionnés</div>
          <p className="faint" style={{ fontSize: 11.5, margin: '0 0 12px' }}>
            Renseignez la machine cible pour installer automatiquement un outil à l'ouverture de la
            console, ou laissez « Installer automatiquement » désactivé pour le configurer plus tard
            manuellement depuis Paramètres.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedTools.map((tool) => (
              <ToolConfigRow
                key={tool.id}
                tool={tool}
                cfg={{ ...DEFAULT_TOOL_CONFIG, ...toolsConfig[tool.id] }}
                setCfg={(patch) => setToolConfig(tool.id, patch)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolConfigRow({ tool, cfg, setCfg }) {
  if (!tool.installable) {
    return (
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{tool.label}</div>
          <div className="faint" style={{ fontSize: 11 }}>
            Installation automatique indisponible pour cet outil (déploiement multi-conteneurs ou
            service en ligne) — à configurer manuellement depuis Paramètres une fois la console ouverte.
          </div>
        </div>
        <a href={tool.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, whiteSpace: 'nowrap', flex: 'none' }}>
          Documentation officielle
        </a>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: cfg.autoInstall ? 12 : 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{tool.label}</div>
        <Toggle
          label="Installer automatiquement"
          hint="Déploie l'image Docker officielle sur la machine indiquée via la clé SSH de la console"
          checked={cfg.autoInstall}
          onChange={(v) => setCfg({ autoInstall: v })}
        />
      </div>
      {cfg.autoInstall && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <Field label="Adresse IP / hôte" hint="Machine cible, doit accepter la clé SSH de la console">
            <input className="input" placeholder="10.0.0.42" value={cfg.address} onChange={(e) => setCfg({ address: e.target.value })} />
          </Field>
          <Field label="Port SSH">
            <input className="input" type="number" min={1} max={65535} value={cfg.port} onChange={(e) => setCfg({ port: Number(e.target.value) })} />
          </Field>
          <Field label="Utilisateur SSH">
            <input className="input" value={cfg.sshUser} onChange={(e) => setCfg({ sshUser: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

// Un service compte comme "connecté" dès que settingsStore.isConfigured() le
// juge configuré (voir backend/src/store/settingsStore.js) — même critère
// que le badge "Configuré"/"Non configuré" affiché par IntegrationPanel.
function StepServices({ settingsData, reloadSettings }) {
  return (
    <div>
      <p className="faint" style={{ fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.5 }}>
        Connectez dès maintenant les outils déjà installés sur votre infrastructure, et testez chaque
        connexion avant d'ouvrir la console. Rien n'est obligatoire ici : chaque service reste
        configurable et testable plus tard depuis Paramètres → Intégrations &amp; outils.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
        {INTEGRATION_ORDER.map((key) => (
          <IntegrationPanel
            key={key}
            integrationKey={key}
            schema={INTEGRATION_FORMS[key]}
            initial={settingsData?.integrations?.[key]}
            allIntegrations={settingsData?.integrations}
            onSaved={reloadSettings}
          />
        ))}
      </div>
    </div>
  );
}

function StepReady({ form, settingsData }) {
  const forgeLabel = GIT_FORGES.find(([v]) => v === form.git.forge)?.[1] || form.git.forge;
  const idpLabel = IDENTITY_PROVIDERS.find(([v]) => v === form.identity.provider)?.[1] || form.identity.provider;
  const connectedServices = INTEGRATION_ORDER.filter((key) => settingsData?.integrations?.[key]?.configured).length;
  const rows = [
    ['Organisation', form.organisation.consoleName],
    ['Administrateur', `${form.admin.name || '—'} · ${form.admin.email || '—'}`],
    ['Identité', `${idpLabel} · ${form.identity.mfaRequired ? 'MFA obligatoire' : 'MFA facultatif'}`],
    ['Forge Git', form.git.baseUrl ? `${forgeLabel} · ${form.git.baseUrl}` : `${forgeLabel} · non renseignée`],
    ['Services connectés', `${connectedServices} sur ${INTEGRATION_ORDER.length}`],
    ['Outils à installer', `${form.tools.length} sur ${TOOL_CATALOG.length}`],
    ['Rétention audit', '365 jours']
  ];
  return (
    <Card>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 13 }}>
          <span className="faint">{label}</span>
          <span style={{ fontWeight: 600 }}>{value}</span>
        </div>
      ))}
    </Card>
  );
}

function Card({ children }) {
  return <div className="card" style={{ padding: 20 }}>{children}</div>;
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Le contrôle est imbriqué dans <label> (association implicite) plutôt
          que relié par un id généré : ça reste accessible (lecteurs d'écran,
          clic sur le libellé) sans faire courir de risque de collision d'id
          entre les six étapes du formulaire. */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>
        {label}
        <div style={{ marginTop: 5, fontWeight: 400 }}>{children}</div>
      </label>
      {hint && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {hint && <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        style={{
          flex: 'none', width: 40, height: 22, borderRadius: 11, border: 'none', position: 'relative',
          background: checked ? 'var(--primary)' : 'var(--border)', cursor: 'pointer', transition: 'background .15s ease'
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left .15s ease', boxShadow: '0 1px 2px rgba(0,0,0,.25)'
        }} />
      </button>
    </div>
  );
}
