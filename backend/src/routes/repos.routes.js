import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';
import * as gitea from '../services/integrations/giteaService.js';
import * as meta from '../store/repoMetaStore.js';
import { logAudit } from '../services/auditService.js';
import { buildCiWorkflow } from '../services/ciWorkflowService.js';

const router = Router();
router.use(requireAuth);

// Liste unifiée des dépôts réels (GitLab + GitHub, selon ce qui est
// configuré), enrichie des étiquettes/rôle posés manuellement (repoMetaStore).
// Ne fabrique aucun dépôt : si aucune forge n'est configurée, la liste est vide.
router.get('/', asyncHandler(async (req, res) => {
  const items = [];
  try {
    const projects = await gitlab.listProjects();
    for (const p of projects) {
      const key = `gitlab:${p.id}`;
      const m = meta.getRepoMeta(key);
      items.push({
        key, provider: 'gitlab', id: p.id, name: p.name, path: p.path, defaultBranch: p.defaultBranch,
        visibility: p.visibility || 'private', webUrl: p.webUrl, lastActivity: p.lastActivity,
        role: m?.role || null, tags: m?.tags || []
      });
    }
  } catch { /* GitLab non configuré */ }
  try {
    const repos = await github.listRepos();
    for (const r of repos) {
      const key = `github:${r.fullName}`;
      const m = meta.getRepoMeta(key);
      items.push({
        key, provider: 'github', id: r.id, name: r.name, path: r.fullName, defaultBranch: r.defaultBranch,
        visibility: r.private ? 'private' : 'public', webUrl: r.webUrl, lastActivity: r.pushedAt,
        role: m?.role || null, tags: m?.tags || []
      });
    }
  } catch { /* GitHub non configuré */ }
  try {
    const repos = await gitea.listRepos();
    for (const r of repos) {
      const key = `gitea:${r.fullName}`;
      const m = meta.getRepoMeta(key);
      items.push({
        key, provider: 'gitea', id: r.id, name: r.name, path: r.fullName, defaultBranch: r.defaultBranch,
        visibility: r.private ? 'private' : 'public', webUrl: r.webUrl, lastActivity: r.pushedAt,
        role: m?.role || null, tags: m?.tags || []
      });
    }
  } catch { /* Gitea non configuré */ }
  res.json({ ok: true, items });
}));

// :key est le champ "key" renvoyé par GET / (ex. "gitlab:42",
// "github:org%2Frepo"), toujours encodé côté client via encodeURIComponent.
router.put('/meta/:key', asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const entry = meta.setRepoMeta(key, req.body || {});
  res.json({ ok: true, meta: entry });
}));

// --- Explorateur de manifests : arborescence, lecture de fichier, et
// workflow complet éditer → commit → merge/pull request, pour les deux
// forges derrière la même interface "key" que le reste de ce fichier.
function parseKey(key) {
  const [provider, ...rest] = decodeURIComponent(key).split(':');
  return { provider, id: rest.join(':') };
}

router.get('/:key/tree', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const path = req.query.path || '';
  const ref = req.query.ref || undefined;
  if (provider === 'gitlab') return res.json({ ok: true, items: await gitlab.listTree(id, path, ref) });
  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    return res.json({ ok: true, items: await github.listTree(owner, repo, path, ref) });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// --- Structure de développement : détecte la stack et les points d'entrée
// d'un dépôt à partir de son arborescence racine et, si présent, de son
// package.json — jamais inventé, uniquement ce qui est réellement lu sur la
// branche par défaut. Sert la page "structure de développement" par dépôt.
const STACK_SIGNALS = [
  { file: 'package.json', label: 'Node.js / JavaScript' },
  { file: 'requirements.txt', label: 'Python (pip)' },
  { file: 'pyproject.toml', label: 'Python (poetry/PEP 517)' },
  { file: 'go.mod', label: 'Go' },
  { file: 'Cargo.toml', label: 'Rust' },
  { file: 'pom.xml', label: 'Java (Maven)' },
  { file: 'build.gradle', label: 'Java/Kotlin (Gradle)' },
  { file: 'composer.json', label: 'PHP (Composer)' },
  { file: 'Gemfile', label: 'Ruby (Bundler)' },
  { file: 'Dockerfile', label: 'Docker' },
  { file: 'docker-compose.yml', label: 'Docker Compose' },
  { file: 'docker-compose.yaml', label: 'Docker Compose' },
  { file: 'Makefile', label: 'Make' },
  { file: '.gitlab-ci.yml', label: 'GitLab CI' },
  { file: 'terraform.tf', label: 'Terraform' }
];
const PACKAGE_MANAGER_SIGNALS = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'package-lock.json', manager: 'npm' }
];

router.get('/:key/structure', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const ref = req.query.ref || undefined;

  async function readTree(path) {
    if (provider === 'gitlab') return gitlab.listTree(id, path, ref);
    if (provider === 'github') {
      const [owner, repo] = id.split('/');
      return github.listTree(owner, repo, path, ref);
    }
    throw Object.assign(new Error('Fournisseur inconnu'), { status: 400 });
  }
  async function readFile(path) {
    if (provider === 'gitlab') return gitlab.getFileContent(id, path, ref);
    const [owner, repo] = id.split('/');
    return github.getFileContent(owner, repo, path, ref);
  }

  const root = await readTree('');
  const names = new Set(root.map((i) => i.name));

  const stack = STACK_SIGNALS.filter((s) => names.has(s.file)).map((s) => s.label);
  const packageManager = PACKAGE_MANAGER_SIGNALS.find((s) => names.has(s.file))?.manager || null;

  let hasCI = names.has('.gitlab-ci.yml');
  if (names.has('.github')) {
    try {
      const workflows = await readTree('.github/workflows');
      if (workflows.some((w) => w.type === 'file')) hasCI = true;
    } catch { /* pas de dossier .github/workflows */ }
  }

  let packageJson = null;
  if (names.has('package.json')) {
    try {
      const f = await readFile('package.json');
      const parsed = JSON.parse(f.content);
      packageJson = {
        name: parsed.name || null,
        scripts: parsed.scripts || {},
        dependenciesCount: Object.keys(parsed.dependencies || {}).length,
        devDependenciesCount: Object.keys(parsed.devDependencies || {}).length
      };
    } catch { /* package.json illisible/invalide, on l'ignore silencieusement */ }
  }

  res.json({
    ok: true,
    structure: {
      root: root.map((i) => ({ name: i.name, type: i.type, path: i.path })),
      stack,
      packageManager,
      hasCI,
      dockerCompose: names.has('docker-compose.yml') || names.has('docker-compose.yaml'),
      packageJson
    }
  });
}));

router.get('/:key/file', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const path = req.query.path;
  if (!path) return res.status(400).json({ ok: false, error: 'path requis' });
  const ref = req.query.ref || undefined;
  if (provider === 'gitlab') return res.json({ ok: true, file: await gitlab.getFileContent(id, path, ref) });
  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    return res.json({ ok: true, file: await github.getFileContent(owner, repo, path, ref) });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// Workflow GitOps complet : crée une branche depuis baseBranch, y committe le
// nouveau contenu du fichier, ouvre une MR/PR vers baseBranch. Un seul appel
// pour rester atomique côté UI (pas d'état intermédiaire "branche créée mais
// pas de MR" si l'utilisateur ferme la popup entre deux étapes).
router.post('/:key/propose-change', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const { path, content, baseBranch, sha, message, title } = req.body || {};
  if (!path || content === undefined || !baseBranch) return res.status(400).json({ ok: false, error: 'path, content et baseBranch requis' });
  const branch = `nexus/manifest-${Date.now()}`;
  const commitMessage = message || `Modifie ${path} depuis Nexus Console`;
  const prTitle = title || commitMessage;

  if (provider === 'gitlab') {
    await gitlab.createBranch(id, branch, baseBranch);
    await gitlab.commitFile(id, branch, path, content, commitMessage);
    const mr = await gitlab.createMergeRequest(id, branch, baseBranch, prTitle);
    logAudit(req, 'manifest.change.proposed', { provider, repo: id, path, branch, mrIid: mr.iid });
    return res.status(201).json({ ok: true, branch, mergeRequest: mr });
  }
  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    await github.createBranch(owner, repo, branch, baseBranch);
    await github.commitFile(owner, repo, branch, path, content, commitMessage, sha);
    const pr = await github.createPullRequest(owner, repo, branch, baseBranch, prTitle);
    logAudit(req, 'manifest.change.proposed', { provider, repo: id, path, branch, prNumber: pr.number });
    return res.status(201).json({ ok: true, branch, mergeRequest: { iid: pr.number, webUrl: pr.webUrl } });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// Génère un workflow GitHub Actions prêt à l'emploi (lint/test/build + SAST
// Semgrep + SCA Trivy + secret scanning GitGuardian + build/scan/SBOM
// d'image si un Dockerfile est détecté — voir services/ciWorkflowService.js,
// partagé avec le Scaffolder) et l'ouvre en pull request — l'admin n'a pas à
// écrire le fichier lui-même (voir base-dev/developement item 13). GitHub
// Actions uniquement : GitLab a son .gitlab-ci.yml natif équivalent.
router.post('/:key/workflows/generate-ci', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  if (provider !== 'github') return res.status(400).json({ ok: false, error: 'La génération de workflow GitHub Actions ne concerne que les dépôts GitHub.' });
  const baseBranch = req.body?.baseBranch;
  if (!baseBranch) return res.status(400).json({ ok: false, error: 'baseBranch requis' });

  const [owner, repo] = id.split('/');
  const root = await github.listTree(owner, repo, '', baseBranch);
  const names = new Set(root.map((i) => i.name));
  const stack = STACK_SIGNALS.filter((s) => names.has(s.file)).map((s) => s.label);
  const packageManager = PACKAGE_MANAGER_SIGNALS.find((s) => names.has(s.file))?.manager || null;

  const branch = `nexus/github-actions-ci-${Date.now()}`;
  const workflow = buildCiWorkflow({ stack, packageManager, hasDockerfile: names.has('Dockerfile') });
  await github.createBranch(owner, repo, branch, baseBranch);
  await github.commitFile(owner, repo, branch, '.github/workflows/ci.yml', workflow, 'Ajoute un workflow CI (Nexus Console)');
  const pr = await github.createPullRequest(owner, repo, branch, baseBranch, 'Ajoute un workflow GitHub Actions CI');
  logAudit(req, 'workflow.ci.generated', { provider, repo: id, branch, prNumber: pr.number });
  res.status(201).json({ ok: true, branch, pullRequest: { number: pr.number, webUrl: pr.webUrl } });
}));

export default router;
