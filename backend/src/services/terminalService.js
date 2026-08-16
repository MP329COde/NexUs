import { load as loadYaml } from 'js-yaml';
import { IntegrationError } from './integrations/httpClient.js';
import * as k8s from './integrations/kubernetesService.js';
import * as deploymentStore from '../store/deploymentStore.js';
import * as orgStore from '../store/orgStore.js';
import { pool } from '../db/pool.js';

// Terminal sécurisé : PAS un shell générique. Une grammaire de commandes
// fixe et bornée, chacune routée vers une fonction kubernetesService déjà
// utilisée ailleurs dans la console (même chemin de code que les boutons
// d'action des pages Kubernetes) — aucune commande arbitraire n'atteint
// jamais le système d'exploitation. `exec` lui-même n'ouvre pas de session
// interactive : une commande, un résultat, capé et minuté (voir
// execInPod dans kubernetesService.js).
export const TERMINAL_VERBS = ['get', 'logs', 'describe', 'scale', 'restart', 'exec', 'apply', 'delete'];

const TIER_VERBS = {
  developer: ['get', 'logs', 'describe'],
  maintainer: ['get', 'logs', 'describe', 'scale', 'restart'],
  admin: TERMINAL_VERBS
};

// Un compte admin de la plateforme a toujours le palier "admin" du terminal,
// par cohérence avec son accès complet au reste de la console (Paramètres,
// coffre-fort prod...) — les comptes "user" n'ont aucun accès par défaut
// (terminalTier === null) tant qu'un admin ne le leur accorde pas explicitement.
export function resolveTier(user) {
  if (user.role === 'admin') return 'admin';
  return user.terminalTier || null;
}

export function allowedVerbs(tier) {
  return TIER_VERBS[tier] || [];
}

function tokenize(line) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

function parseFlags(tokens) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-n' || t === '--namespace') { flags.namespace = tokens[++i]; }
    else if (t === '-c' || t === '--container') { flags.container = tokens[++i]; }
    else if (t === '--tail') { flags.tail = Number(tokens[++i]); }
    else if (t.startsWith('--replicas=')) { flags.replicas = Number(t.split('=')[1]); }
    else if (t === '--') { flags.execCommand = tokens.slice(i + 1); break; }
    else positional.push(t);
  }
  return { flags, positional };
}

// Un namespace est considéré "production" s'il est ciblé par un lien de
// déploiement rattaché à un environnement Postgres marqué is_production
// (voir "Organisations et Projets" côté manuel). Sans Postgres configuré,
// impossible de le vérifier de façon fiable : on ne bloque pas à l'aveugle,
// cohérent avec le reste de la plateforme en isolation "legacy".
async function isProductionNamespace(namespace) {
  if (!namespace || !pool) return false;
  const links = deploymentStore.listLinks().filter((l) => l.k8sNamespace === namespace && l.environmentId);
  for (const link of links) {
    const env = await orgStore.getEnvironment(link.environmentId);
    if (env?.is_production) return true;
  }
  return false;
}

function splitKindName(token) {
  if (token.includes('/')) { const [kind, name] = token.split('/'); return { kind, name }; }
  return { kind: null, name: token };
}

// `runCommand` fait respecter la permission AVANT toute chose : un verbe hors
// palier échoue sans même être analysé plus loin. Chaque appel (autorisé ou
// non) doit être journalisé par l'appelant (routes/terminal.routes.js) via
// logAudit — auteur, IP et date viennent déjà de la requête, ce module ne
// s'occupe que de la commande et de son résultat.
export async function runCommand(user, line, manifestText) {
  const tokens = tokenize(line.trim());
  const verb = tokens[0];
  if (!verb) throw new IntegrationError('Commande vide', { status: 400 });
  if (!TERMINAL_VERBS.includes(verb)) {
    throw new IntegrationError(`Commande inconnue : "${verb}". Verbes disponibles : ${TERMINAL_VERBS.join(', ')}`, { status: 400 });
  }
  const tier = resolveTier(user);
  const allowed = allowedVerbs(tier);
  if (!allowed.includes(verb)) {
    throw new IntegrationError(`Palier "${tier || 'aucun'}" : commande "${verb}" non autorisée. Autorisées : ${allowed.join(', ') || 'aucune'}.`, { status: 403 });
  }

  const { flags, positional } = parseFlags(tokens.slice(1));
  const namespace = flags.namespace;

  switch (verb) {
    case 'get': {
      const resource = positional[0];
      if (resource === 'pods') return { rows: await k8s.listPods(namespace) };
      if (resource === 'deployments') return { rows: await k8s.listDeployments(namespace) };
      if (resource === 'services') return { rows: await k8s.listServices(namespace) };
      throw new IntegrationError(`get : ressource inconnue "${resource}" (pods, deployments, services)`, { status: 400 });
    }
    case 'logs': {
      const pod = positional[0];
      if (!pod || !namespace) throw new IntegrationError('logs <pod> -n <namespace> requis', { status: 400 });
      return { text: await k8s.getPodLogs(namespace, pod, flags.container, flags.tail || 200) };
    }
    case 'describe': {
      const { kind, name } = splitKindName(positional[1] ? `${positional[0]}/${positional[1]}` : positional[0]);
      if (!name || !namespace) throw new IntegrationError('describe pod <nom> -n <namespace> requis', { status: 400 });
      if (kind && kind !== 'pod') throw new IntegrationError('describe ne supporte que "pod" pour le moment', { status: 400 });
      return { object: await k8s.describePod(namespace, name) };
    }
    case 'scale': {
      const { kind, name } = splitKindName(positional[0]);
      if (kind !== 'deployment' || !name || !namespace || !Number.isInteger(flags.replicas)) {
        throw new IntegrationError('scale deployment/<nom> --replicas=<n> -n <namespace> requis', { status: 400 });
      }
      return await k8s.scaleDeployment(namespace, name, flags.replicas);
    }
    case 'restart': {
      const { kind, name } = splitKindName(positional[0]);
      if (kind !== 'deployment' || !name || !namespace) throw new IntegrationError('restart deployment/<nom> -n <namespace> requis', { status: 400 });
      return await k8s.restartDeployment(namespace, name);
    }
    case 'delete': {
      const { kind, name } = splitKindName(positional[0]);
      if (kind !== 'pod' || !name || !namespace) throw new IntegrationError('delete pod/<nom> -n <namespace> requis (seul "pod" est supporté)', { status: 400 });
      return await k8s.deletePod(namespace, name);
    }
    case 'exec': {
      const pod = positional[0];
      if (!pod || !namespace || !flags.execCommand?.length) {
        throw new IntegrationError('exec <pod> -n <namespace> [-c <conteneur>] -- <commande> requis', { status: 400 });
      }
      return await k8s.execInPod(namespace, pod, flags.container, flags.execCommand);
    }
    case 'apply': {
      if (!manifestText?.trim()) throw new IntegrationError('apply requiert un manifest (YAML ou JSON)', { status: 400 });
      let manifest;
      try {
        manifest = loadYaml(manifestText);
      } catch (err) {
        throw new IntegrationError(`YAML invalide : ${err.message}`, { status: 400 });
      }
      const targetNamespace = manifest?.metadata?.namespace || namespace;
      if (await isProductionNamespace(targetNamespace)) {
        throw new IntegrationError(
          `Application directe refusée : "${targetNamespace}" est un namespace de production. Passez par une revue de code (Développement → Dépôts Git → Manifests → proposer un changement) plutôt qu'une application directe depuis le terminal.`,
          { status: 403 }
        );
      }
      return { object: await k8s.applyManifest(manifest) };
    }
    default:
      throw new IntegrationError('Verbe non implémenté', { status: 500 });
  }
}
