import { useState } from 'react';
import { api } from '../../lib/apiClient.js';
import { useApi } from '../../hooks/useApi.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import BrandMark from '../../components/ui/BrandMark.jsx';
import Icon from '../../components/ui/Icon.jsx';
import InstallScreen from './InstallScreen.jsx';
import IntegrationPanel from '../Settings/IntegrationPanel.jsx';
import { INTEGRATION_FORMS, INTEGRATION_ORDER } from '../../config/integrationForms.js';
import '../Infrastructure/InfrastructureShared.css';
import './SetupPage.css';

const TIMEZONES = ['Europe/Paris', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles'];
const LANGUAGES = [['fr', 'Français'], ['en', 'English']];
const DATE_FORMATS = [['dd/MM/yyyy', 'JJ/MM/AAAA'], ['MM/dd/yyyy', 'MM/JJ/AAAA'], ['yyyy-MM-dd', 'AAAA-MM-JJ']];
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

// Lot D5 (Groupe D) — `targetType` distingue la cible d'installation, sur le
// même principe honnête que le sélecteur du Lot D4 (GET
// /hosts/services/install-targets) : 'ssh' reste le comportement historique
// (adresse/port/utilisateur SSH, via /setup/provision), 'kubernetes' déploie
// directement sur un cluster déjà configuré via POST
// /hosts/services/:serviceId/install — jamais de cible inventée.
const DEFAULT_TOOL_CONFIG = { address: '', port: 22, sshUser: 'root', autoInstall: false, targetType: 'ssh', hostId: '', clusterId: '' };

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
  admin: { name: '', username: '', email: '', password: '', confirm: '' },
  identity: { sessionMinutes: 480, minPasswordLength: 14 },
  git: { forge: 'gitea', baseUrl: '', org: '', token: '', defaultBranch: 'main' },
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
  const notify = useNotify();
  // Lot D5 — clé SSH de la console et cibles d'installation réellement
  // disponibles (hôtes déjà gérés, clusters Kubernetes configurés) : chargées
  // seulement une fois le compte administrateur créé, puisque ces routes sont
  // authentifiées (mêmes routes que Infrastructure → Hôtes et le Lot D4).
  const sshKey = useApi(() => (accountCreated ? api.get('/hosts/ssh-public-key') : Promise.resolve(null)), [accountCreated]);
  const installTargets = useApi(() => (accountCreated ? api.get('/hosts/services/install-targets') : Promise.resolve(null)), [accountCreated]);

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
            defaultBranch: form.git.defaultBranch
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

  // Lot D5 — les outils ciblant un cluster Kubernetes ne passent pas par
  // /setup/provision (SSH uniquement) : ils réutilisent directement POST
  // /hosts/services/:serviceId/install avec target:{type:'kubernetes'}, la
  // même route que le sélecteur de cible du Lot D4. Déclenché en tâche de
  // fond (best-effort) : un échec ne bloque jamais l'ouverture de la console,
  // l'outil reste installable plus tard depuis Paramètres ou Infrastructure.
  function launchKubernetesInstalls(tools) {
    tools.forEach(({ id, cfg }) => {
      api.post(`/hosts/services/${id}/install`, { target: { type: 'kubernetes', clusterId: cfg.clusterId } })
        .then(() => notify(`Déploiement de ${TOOL_CATALOG.find((t) => t.id === id)?.label || id} lancé sur le cluster Kubernetes`, { type: 'ok' }))
        .catch((err) => notify(err.message, { type: 'crit', title: `Échec du déploiement de ${id}` }));
    });
  }

  function submit() {
    // Le compte, l'identité, la forge Git et les services réels sont déjà
    // enregistrés au fil de l'assistant (voir next()) : il ne reste plus qu'à
    // lancer l'installation automatique des outils sélectionnés, s'il y en a.
    const active = form.tools
      .map((id) => ({ id, cfg: form.toolsConfig[id] }))
      .filter(({ id, cfg }) => TOOL_CATALOG.find((t) => t.id === id)?.installable && cfg?.autoInstall);

    const k8sTools = active.filter(({ cfg }) => cfg.targetType === 'kubernetes' && cfg.clusterId);
    const sshTools = active.filter(({ cfg }) => (cfg.targetType || 'ssh') !== 'kubernetes' && cfg.address?.trim());

    if (k8sTools.length > 0) launchKubernetesInstalls(k8sTools);

    if (sshTools.length === 0) {
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
      .filter((t) => TOOL_CATALOG.find((cat) => cat.id === t.id)?.installable && t.autoInstall && (t.targetType || 'ssh') !== 'kubernetes' && t.address?.trim());
    return <InstallScreen tools={jobsToStart} onFinish={() => { window.location.href = '/'; }} />;
  }

  return (
    <div className="setup-page">
      <aside className="setup-sidebar">
        <div className="setup-brand-row">
          <BrandMark size={28} />
          <span className="setup-brand-name">Nexus Console</span>
        </div>

        <div className="setup-sidebar-heading">
          <div className="setup-sidebar-title">Configuration initiale</div>
          <p className="setup-sidebar-desc">
            Sept étapes pour ouvrir la console : organisation, administrateur, identité, Git, services à connecter et outils.
          </p>
        </div>

        <nav className="setup-steps-nav">
          {STEPS.map((s, i) => {
            const state = i === step ? 'current' : i < step ? 'done' : 'pending';
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => (i <= step ? goTo(i) : null)}
                className={`setup-step-btn${i <= step ? ' setup-step-btn-clickable' : ''}`}
              >
                <span className={`setup-step-badge setup-step-badge-${state}`}>
                  {state === 'done' ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span className={`setup-step-label${state === 'current' ? ' setup-step-label-current' : ''}${state === 'pending' ? ' setup-step-label-pending' : ''}`}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="setup-progress-wrap">
          <div className="setup-progress-track">
            <div className="setup-progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="setup-progress-meta">
            <span>étape {step + 1} / {STEPS.length}</span>
            {step < STEPS.length - 1 && (
              <button type="button" onClick={skipAll} className="setup-skip-all-btn">
                passer
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="setup-main" style={LIGHT_VARS}>
        <div className="setup-main-header">
          <h1 className="setup-main-title">{current.title}</h1>
          <p className="setup-main-sub">{current.sub}</p>
        </div>

        <div className="setup-main-body">
          <div className={`setup-main-body-inner${current.key === 'tools' || current.key === 'services' ? ' setup-main-body-inner-wide' : ''}`}>
            {current.key === 'organisation' && <StepOrganisation form={form.organisation} set={(p) => setSection('organisation', p)} />}
            {current.key === 'admin' && <StepAdmin form={form.admin} set={(p) => setSection('admin', p)} />}
            {current.key === 'identity' && <StepIdentity form={form.identity} set={(p) => setSection('identity', p)} />}
            {current.key === 'git' && <StepGit form={form.git} set={(p) => setSection('git', p)} />}
            {current.key === 'services' && (
              accountCreated
                ? <StepServices settingsData={settingsData} reloadSettings={reloadSettings} />
                : <Card><p className="faint setup-services-blocked-note">Le compte administrateur doit être créé avant de pouvoir connecter un service (retournez à l'étape précédente).</p></Card>
            )}
            {current.key === 'tools' && (
              <StepTools
                selected={form.tools}
                onToggle={toggleTool}
                toolsConfig={form.toolsConfig}
                setToolConfig={setToolConfig}
                sshKey={sshKey}
                installTargets={installTargets}
              />
            )}
            {current.key === 'ready' && <StepReady form={form} settingsData={settingsData} />}

            {error && (
              <div className="setup-form-error">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="setup-footer">
          <div>
            {step > 0 && (
              <button type="button" className="btn-outline" onClick={() => goTo(step - 1)}>Retour</button>
            )}
          </div>
          <div className="setup-footer-actions">
            {current.key !== 'ready' && current.key !== 'admin' && (
              <button type="button" onClick={skip} className="setup-later-btn">
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
      <p className="setup-admin-intro">
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
      <p className="setup-admin-note">
        Une clé d'accès (passkey WebAuthn) pourra être ajoutée après l'installation, depuis le profil du compte.
      </p>
    </Card>
  );
}

// Ne présente que ce que la console applique réellement : durée de session
// et longueur minimale du mot de passe (voir identityStore.js,
// getSessionMinutes/getMinPasswordLength, utilisées par auth.routes.js).
// OIDC/LDAP se configurent après coup dans Paramètres → Connexion & identité,
// où ils sont honnêtement présentés comme enregistrés/testables mais pas
// encore un second chemin de connexion actif — pas dupliqué ici pour ne
// jamais laisser croire qu'un fournisseur SSO est déjà branché.
function StepIdentity({ form, set }) {
  return (
    <Card>
      <Field label="Durée de session" hint="minutes">
        <input className="input" type="number" min={5} max={10080} value={form.sessionMinutes} onChange={(e) => set({ sessionMinutes: Number(e.target.value) })} />
      </Field>
      <Field label="Longueur minimale du mot de passe" hint="caractères">
        <input className="input" type="number" min={8} max={128} value={form.minPasswordLength} onChange={(e) => set({ minPasswordLength: Number(e.target.value) })} />
      </Field>
      <p className="setup-identity-note">
        OIDC, LDAP et clés d'accès se configurent après l'installation, dans Paramètres → Connexion & identité et le profil du compte.
      </p>
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
    </Card>
  );
}

function StepTools({ selected, onToggle, toolsConfig, setToolConfig, sshKey, installTargets }) {
  const selectedTools = TOOL_CATALOG.filter((t) => selected.includes(t.id));
  const anyInstallable = selectedTools.some((t) => t.installable);
  return (
    <div>
      <div className="setup-tools-grid">
        {TOOL_CATALOG.map((tool) => {
          const checked = selected.includes(tool.id);
          return (
            <label
              key={tool.id}
              className={`card setup-tool-card${checked ? ' setup-tool-card-checked' : ''}`}
            >
              <input type="checkbox" checked={checked} onChange={() => onToggle(tool.id)} className="setup-tool-checkbox" />
              <span className="setup-tool-info">
                <div className="setup-tool-label">{tool.label}</div>
                <div className="setup-tool-category">{tool.category}</div>
              </span>
              <button
                type="button"
                title={`Ouvrir le site officiel de ${tool.label}`}
                aria-label={`Ouvrir le site officiel de ${tool.label}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(tool.url, '_blank', 'noopener,noreferrer'); }}
                className="setup-tool-link-btn"
              >
                <Icon name="externalLink" size={14} />
              </button>
            </label>
          );
        })}
      </div>

      {selectedTools.length > 0 && (
        <div className="setup-tools-config">
          <div className="setup-tools-config-title">Configuration des outils sélectionnés</div>
          <p className="faint setup-tools-config-desc">
            Choisissez une cible pour installer automatiquement un outil à l'ouverture de la console
            (un hôte SSH ou un cluster Kubernetes déjà configuré), ou laissez « Installer automatiquement »
            désactivé pour le configurer plus tard manuellement depuis Paramètres.
          </p>

          {/* Lot D5 — clé SSH de la console, réutilisée à l'identique du
              panneau "Clé publique de la console" d'Infrastructure → Hôtes
              (même route GET /hosts/ssh-public-key, même geste copier). Le
              blocage évident du lot précédent : impossible d'installer quoi
              que ce soit via SSH tant que cette clé n'a pas été copiée sur la
              machine cible — elle est donc affichée en tête, avant tout choix
              de machine, plutôt que noyée dans la doc. */}
          {anyInstallable && (
            <SetupSshKeyPanel sshKey={sshKey} />
          )}

          <div className="setup-tools-config-list">
            {selectedTools.map((tool) => (
              <ToolConfigRow
                key={tool.id}
                tool={tool}
                cfg={{ ...DEFAULT_TOOL_CONFIG, ...toolsConfig[tool.id] }}
                setCfg={(patch) => setToolConfig(tool.id, patch)}
                installTargets={installTargets}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SetupSshKeyPanel({ sshKey }) {
  const notify = useNotify();
  function copyKey() {
    navigator.clipboard.writeText(sshKey.data?.publicKey || '');
    notify('Clé publique copiée dans le presse-papiers', { type: 'ok' });
  }
  return (
    <div className="card setup-ssh-key-panel">
      <div className="setup-tool-row-title-sm">Clé publique de la console</div>
      <p className="faint setup-tools-config-desc">
        À copier dans <code className="mono">~/.ssh/authorized_keys</code> de chaque machine à installer
        via SSH (utilisateur renseigné ci-dessous) — la même clé que celle affichée dans
        Infrastructure → Hôtes &amp; agents une fois la console ouverte.
      </p>
      <div className="infra-key-panel-body">
        <code className="mono infra-key-code">{sshKey.loading ? 'Chargement…' : (sshKey.data?.publicKey || '—')}</code>
        <span className="btn-outline infra-key-copy-btn" onClick={copyKey}>Copier</span>
      </div>
    </div>
  );
}

function ToolConfigRow({ tool, cfg, setCfg, installTargets }) {
  if (!tool.installable) {
    return (
      <div className="card setup-tool-row-noninstall">
        <div>
          <div className="setup-tool-row-title">{tool.label}</div>
          <div className="faint setup-tool-row-desc">
            Installation automatique indisponible pour cet outil (déploiement multi-conteneurs ou
            service en ligne) — à configurer manuellement depuis Paramètres une fois la console ouverte.
          </div>
        </div>
        <a href={tool.url} target="_blank" rel="noopener noreferrer" className="setup-tool-row-doclink">
          Documentation officielle
        </a>
      </div>
    );
  }

  // Lot D5 — mêmes cibles honnêtes que le sélecteur du Lot D4 : un cluster
  // Kubernetes n'est proposé que s'il est réellement configuré
  // (installTargets.data.kubernetes.clusters), jamais une option qui
  // échouerait faute d'intégration branchée.
  const hosts = installTargets?.data?.sshHost?.hosts || [];
  const clusters = installTargets?.data?.kubernetes?.clusters || [];
  const targetType = cfg.targetType || 'ssh';

  return (
    <div className="card setup-tool-row">
      <div className={`setup-tool-row-head${cfg.autoInstall ? ' setup-tool-row-head-expanded' : ''}`}>
        <div className="setup-tool-row-title-sm">{tool.label}</div>
        <Toggle
          label="Installer automatiquement"
          hint="Déploie l'image Docker officielle sur la cible choisie ci-dessous"
          checked={cfg.autoInstall}
          onChange={(v) => setCfg({ autoInstall: v })}
        />
      </div>
      {cfg.autoInstall && (
        <div className="setup-tool-row-fields">
          <Field label="Cible d'installation">
            <select
              className="input"
              value={targetType}
              onChange={(e) => setCfg({ targetType: e.target.value })}
            >
              <option value="ssh">Machine via SSH (nouvelle adresse ou hôte déjà géré)</option>
              <option value="kubernetes" disabled={clusters.length === 0}>
                Cluster Kubernetes{clusters.length === 0 ? ' (aucun cluster configuré)' : ''}
              </option>
            </select>
          </Field>

          {targetType === 'ssh' && (
            <>
              {hosts.length > 0 && (
                <Field label="Hôte déjà géré" hint="Ou laissez sur « Nouvelle adresse » pour en saisir une">
                  <select
                    className="input"
                    value={cfg.hostId || ''}
                    onChange={(e) => {
                      const h = hosts.find((x) => x.id === e.target.value);
                      setCfg({ hostId: e.target.value, address: h ? h.address : cfg.address });
                    }}
                  >
                    <option value="">Nouvelle adresse…</option>
                    {hosts.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.address})</option>)}
                  </select>
                </Field>
              )}
              <Field label="Adresse IP / hôte" hint="Machine cible, doit accepter la clé SSH de la console ci-dessus">
                <input className="input" placeholder="10.0.0.42" value={cfg.address} onChange={(e) => setCfg({ address: e.target.value, hostId: '' })} />
              </Field>
              <Field label="Port SSH">
                <input className="input" type="number" min={1} max={65535} value={cfg.port} onChange={(e) => setCfg({ port: Number(e.target.value) })} />
              </Field>
              <Field label="Utilisateur SSH">
                <input className="input" value={cfg.sshUser} onChange={(e) => setCfg({ sshUser: e.target.value })} />
              </Field>
            </>
          )}

          {targetType === 'kubernetes' && (
            <Field label="Cluster" hint="Déploiement Deployment + Service, image officielle — voir Paramètres → Kubernetes">
              <select className="input" value={cfg.clusterId || ''} onChange={(e) => setCfg({ clusterId: e.target.value })}>
                <option value="">Choisir un cluster…</option>
                {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
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
      <p className="faint setup-services-intro">
        Connectez dès maintenant les outils déjà installés sur votre infrastructure, et testez chaque
        connexion avant d'ouvrir la console. Rien n'est obligatoire ici : chaque service reste
        configurable et testable plus tard depuis Paramètres → Intégrations &amp; outils.
      </p>
      <div className="setup-services-grid">
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
  const connectedServices = INTEGRATION_ORDER.filter((key) => settingsData?.integrations?.[key]?.configured).length;
  const rows = [
    ['Organisation', form.organisation.consoleName],
    ['Administrateur', `${form.admin.name || '—'} · ${form.admin.email || '—'}`],
    ['Identité', `Session ${form.identity.sessionMinutes} min · mot de passe ${form.identity.minPasswordLength} car. min.`],
    ['Forge Git', form.git.baseUrl ? `${forgeLabel} · ${form.git.baseUrl}` : `${forgeLabel} · non renseignée`],
    ['Services connectés', `${connectedServices} sur ${INTEGRATION_ORDER.length}`],
    ['Outils à installer', `${form.tools.length} sur ${TOOL_CATALOG.length}`],
    ['Journal d\'audit', '1000 dernières actions conservées']
  ];
  return (
    <Card>
      {rows.map(([label, value]) => (
        <div key={label} className="setup-ready-row">
          <span className="faint">{label}</span>
          <span className="setup-ready-row-value">{value}</span>
        </div>
      ))}
    </Card>
  );
}

function Card({ children }) {
  return <div className="card setup-card">{children}</div>;
}

function Field({ label, hint, children }) {
  return (
    <div className="setup-field">
      {/* Le contrôle est imbriqué dans <label> (association implicite) plutôt
          que relié par un id généré : ça reste accessible (lecteurs d'écran,
          clic sur le libellé) sans faire courir de risque de collision d'id
          entre les six étapes du formulaire. */}
      <label className="setup-field-label">
        {label}
        <div className="setup-field-control">{children}</div>
      </label>
      {hint && <div className="faint setup-field-hint">{hint}</div>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="setup-toggle-row">
      <div>
        <div className="setup-toggle-label">{label}</div>
        {hint && <div className="faint setup-toggle-hint">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`setup-toggle-btn${checked ? ' setup-toggle-btn-on' : ''}`}
      >
        <span className={`setup-toggle-knob${checked ? ' setup-toggle-knob-on' : ''}`} />
      </button>
    </div>
  );
}
