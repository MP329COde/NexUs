import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dataDir } from '../config/paths.js';
import { backupDir, createBackup, listBackups, importBackup } from './backupService.js';
import { getRawIntegration } from '../store/settingsStore.js';
import { logger } from '../utils/logger.js';

const run = promisify(execFile);
const repoDir = path.join(dataDir, 'git-backup-repo');

// Sauvegarde/restauration vers le dépôt Git du propriétaire (GitHub/GitLab/
// Gitea/tout serveur Git compatible HTTPS) : l'admin configure une URL de
// dépôt + un token dans Paramètres → Intégrations. Le token n'est JAMAIS
// écrit sur disque en clair — contrairement à un `git remote add` classique,
// chaque push construit l'URL authentifiée en mémoire et la passe en
// argument positionnel à `git push`, jamais persistée dans .git/config.
// `execFile` (pas de shell) : aucun risque d'injection via l'URL/le token.
function client() {
  const cfg = getRawIntegration('gitBackup');
  if (!cfg.remoteUrl || !cfg.token) return null;
  return cfg;
}

function authedUrl(remoteUrl, token) {
  const u = new URL(remoteUrl);
  u.username = 'x-access-token';
  u.password = token;
  return u.toString();
}

// Masque le token dans tout message d'erreur avant qu'il puisse remonter au
// frontend ou dans les logs (execFile inclut parfois la commande complète
// dans stderr en cas d'échec d'authentification).
function redact(message, token) {
  return token ? String(message).split(token).join('***') : String(message);
}

async function ensureRepo() {
  fs.mkdirSync(repoDir, { recursive: true });
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    await run('git', ['init'], { cwd: repoDir });
    await run('git', ['config', 'user.email', 'nexus-console@homelab.local'], { cwd: repoDir });
    await run('git', ['config', 'user.name', 'Nexus Console'], { cwd: repoDir });
  }
}

export function getStatus() {
  const cfg = client();
  if (!cfg) return { configured: false, ok: false, message: "Sauvegarde Git non configurée (voir Paramètres)." };
  return { configured: true, ok: true, message: `Dépôt configuré (branche ${cfg.branch || 'main'}) — utilisez "Pousser maintenant" pour vérifier l'accès.` };
}

// Crée une nouvelle sauvegarde locale (même mécanisme que les sauvegardes
// automatiques quotidiennes) puis la pousse vers le dépôt distant : couvre
// à la fois la base (utilisateurs, RBAC, incidents...) et les intégrations,
// déjà chiffrées au repos, donc jamais exposées en clair dans le dépôt.
export async function pushBackup() {
  const cfg = client();
  if (!cfg) throw Object.assign(new Error('Sauvegarde Git non configurée (voir Paramètres)'), { status: 409 });
  const branch = cfg.branch || 'main';

  const backup = await createBackup('git');
  await ensureRepo();

  const destDir = path.join(repoDir, 'backups');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(backupDir, backup.file), path.join(destDir, backup.file));
  const pgDump = path.join(backupDir, `${backup.file}.pg.json`);
  if (fs.existsSync(pgDump)) fs.copyFileSync(pgDump, path.join(destDir, `${backup.file}.pg.json`));

  // README généré à chaque push : donne un point d'entrée humain au dépôt
  // (sinon un simple dossier de fichiers .db opaques) sans jamais y écrire
  // de secret en clair (baseUrl publiques uniquement, listBackups() ne
  // renvoie que des métadonnées de taille/date, jamais le contenu déchiffré).
  const items = listBackups();
  fs.writeFileSync(path.join(repoDir, 'README.md'), [
    '# Sauvegardes Nexus Console',
    '',
    `Dernière mise à jour : ${new Date().toISOString()}`,
    '',
    `${items.length} sauvegarde(s) conservée(s) (rétention alignée sur backend/src/services/backupService.js).`,
    '',
    'Chaque fichier `.db` est une base SQLite complète (utilisateurs, intégrations chiffrées, RBAC, projets...).',
    'Restauration : Paramètres → Système → Importer une sauvegarde, avec ce fichier.'
  ].join('\n'));

  try {
    await run('git', ['add', '-A'], { cwd: repoDir });
    const { stdout: statusOut } = await run('git', ['status', '--porcelain'], { cwd: repoDir });
    if (!statusOut.trim()) {
      return { ok: true, pushed: false, message: 'Aucun changement depuis la dernière sauvegarde Git — rien à pousser.', backup };
    }
    await run('git', ['commit', '-m', `Sauvegarde ${backup.file}`], { cwd: repoDir });
    await run('git', ['branch', '-M', branch], { cwd: repoDir });
    await run('git', ['push', authedUrl(cfg.remoteUrl, cfg.token), `${branch}:${branch}`, '--force'], { cwd: repoDir });
    logger.info(`Sauvegarde Git poussée: ${backup.file}`);
    return { ok: true, pushed: true, message: `${backup.file} poussé vers le dépôt distant (branche ${branch}).`, backup };
  } catch (err) {
    const message = redact(err.stderr || err.message, cfg.token);
    logger.error(`Échec du push Git: ${message}`);
    throw Object.assign(new Error(`Échec du push vers le dépôt Git : ${message}`), { status: 502 });
  }
}

// Récupère l'état le plus récent du dépôt distant (utile en particulier
// depuis une nouvelle machine, où data/git-backup-repo n'existe pas encore
// localement) et liste les sauvegardes qui s'y trouvent — restauration au
// cas où la machine d'origine serait perdue, comme demandé par l'admin.
export async function pullAndList() {
  const cfg = client();
  if (!cfg) throw Object.assign(new Error('Sauvegarde Git non configurée (voir Paramètres)'), { status: 409 });
  const branch = cfg.branch || 'main';
  await ensureRepo();
  try {
    await run('git', ['fetch', authedUrl(cfg.remoteUrl, cfg.token), branch], { cwd: repoDir });
    await run('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: repoDir });
  } catch (err) {
    const message = redact(err.stderr || err.message, cfg.token);
    throw Object.assign(new Error(`Échec de la récupération depuis le dépôt Git : ${message}`), { status: 502 });
  }
  const dir = path.join(repoDir, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return { file: f, sizeBytes: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.file.localeCompare(a.file));
}

// Importe (sans restaurer) une sauvegarde du dépôt distant dans le stockage
// local des sauvegardes : réutilise ensuite exactement le même chemin de
// restauration (avec ré-authentification par mot de passe) que n'importe
// quelle sauvegarde locale ou importée manuellement — jamais de raccourci
// qui contournerait cette protection pour une sauvegarde venue de Git.
export function importFromRepo(file) {
  const safe = path.basename(file);
  const full = path.join(repoDir, 'backups', safe);
  if (!fs.existsSync(full)) throw Object.assign(new Error('Sauvegarde introuvable dans le dépôt (pensez à "Vérifier le dépôt" avant)'), { status: 404 });
  const buffer = fs.readFileSync(full);
  return importBackup(buffer, safe);
}
