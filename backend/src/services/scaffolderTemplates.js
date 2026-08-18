import { buildCiWorkflow } from './ciWorkflowService.js';

// Golden paths minimaux : chaque template décrit le jeu de fichiers de
// départ qu'un développeur obtiendrait normalement en configurant lui-même
// dépôt + Dockerfile + CI + service.yaml. Volontairement statique (pas de
// stockage en base) — un template n'est pas une donnée métier, c'est du
// code de génération, comme le reste de ce fichier.
//
// La CI générée réutilise ciWorkflowService.js (ÉTAPE 5 IDP) — le même
// générateur que POST /repos/:key/workflows/generate-ci — plutôt qu'une
// version au rabais propre au Scaffolder : un service scaffoldé obtient
// dès sa création lint/test/build + SAST Semgrep + SCA Trivy + secret
// scanning + (si un Dockerfile est présent) build/scan/SBOM d'image réel.
const CI_NODE = buildCiWorkflow({ stack: ['Node.js / JavaScript'], packageManager: 'npm', hasDockerfile: true });
const CI_PYTHON = buildCiWorkflow({ stack: ['Python'], packageManager: null, hasDockerfile: true });
const CI_GENERIC = buildCiWorkflow({ stack: [], packageManager: null, hasDockerfile: true });

function serviceYaml({ name, description, kind, lifecycle, ownerTeamSlug, language, framework }) {
  const lines = [
    'apiVersion: nexus.dev/v1',
    'kind: Service',
    'metadata:',
    `  name: ${name}`,
    description ? `  description: ${description}` : null,
    'spec:',
    `  type: ${kind}`,
    `  lifecycle: ${lifecycle}`,
    ownerTeamSlug ? `  owner: ${ownerTeamSlug}` : null,
    language ? `  language: ${language}` : null,
    framework ? `  framework: ${framework}` : null
  ].filter(Boolean);
  return lines.join('\n') + '\n';
}

function readme({ name, description }) {
  return `# ${name}\n\n${description || 'Décrivez ce service ici.'}\n\n## Développement\n\nVoir \`service.yaml\` pour les métadonnées de ce service dans le Software Catalog NexUs.\n`;
}

export const SCAFFOLDER_TEMPLATES = [
  {
    id: 'nodejs-api',
    name: 'API Node.js',
    description: 'Service Express minimal avec tests, Dockerfile et CI GitHub Actions.',
    kind: 'api',
    language: 'JavaScript',
    framework: 'Express',
    files: (vars) => ({
      'README.md': readme(vars),
      'service.yaml': serviceYaml(vars),
      '.gitignore': 'node_modules/\n.env\n',
      'Dockerfile': `FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["node", "src/index.js"]\n`,
      'package.json': JSON.stringify({ name: vars.name, version: '0.1.0', private: true, type: 'module', scripts: { start: 'node src/index.js', test: 'node --test' }, dependencies: { express: '^4.21.0' } }, null, 2) + '\n',
      'src/index.js': `import express from 'express';\n\nconst app = express();\napp.get('/health', (req, res) => res.json({ ok: true }));\napp.listen(3000, () => console.log('${vars.name} listening on :3000'));\n`,
      '.github/workflows/ci.yml': CI_NODE
    })
  },
  {
    id: 'react-app',
    name: 'Application React',
    description: 'Application React + Vite minimale, Dockerfile multi-stage et CI.',
    kind: 'website',
    language: 'JavaScript',
    framework: 'React',
    files: (vars) => ({
      'README.md': readme(vars),
      'service.yaml': serviceYaml(vars),
      '.gitignore': 'node_modules/\ndist/\n',
      'Dockerfile': `FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\n`,
      'package.json': JSON.stringify({ name: vars.name, version: '0.1.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' }, devDependencies: { vite: '^5.4.0' } }, null, 2) + '\n',
      '.github/workflows/ci.yml': CI_NODE
    })
  },
  {
    id: 'python-api',
    name: 'API Python',
    description: 'API FastAPI minimale avec tests, Dockerfile et CI GitHub Actions.',
    kind: 'api',
    language: 'Python',
    framework: 'FastAPI',
    files: (vars) => ({
      'README.md': readme(vars),
      'service.yaml': serviceYaml(vars),
      '.gitignore': '__pycache__/\n.venv/\n*.pyc\n',
      'Dockerfile': `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n`,
      'requirements.txt': 'fastapi\nuvicorn\npytest\n',
      'main.py': `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"ok": True}\n`,
      '.github/workflows/ci.yml': CI_PYTHON
    })
  },
  {
    id: 'worker',
    name: 'Worker',
    description: 'Worker Node.js autonome (file de tâches), Dockerfile et CI.',
    kind: 'worker',
    language: 'JavaScript',
    framework: '',
    files: (vars) => ({
      'README.md': readme(vars),
      'service.yaml': serviceYaml(vars),
      '.gitignore': 'node_modules/\n.env\n',
      'Dockerfile': `FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nCMD ["node", "src/worker.js"]\n`,
      'package.json': JSON.stringify({ name: vars.name, version: '0.1.0', private: true, type: 'module', scripts: { start: 'node src/worker.js', test: 'node --test' } }, null, 2) + '\n',
      'src/worker.js': `console.log('${vars.name} worker started');\nsetInterval(() => {\n  // TODO: traitement périodique\n}, 60_000);\n`,
      '.github/workflows/ci.yml': CI_NODE
    })
  },
  {
    id: 'kubernetes-service',
    name: 'Service Kubernetes',
    description: 'Squelette applicatif accompagné de manifests Kubernetes (Deployment + Service).',
    kind: 'service',
    language: '',
    framework: '',
    files: (vars) => ({
      'README.md': readme(vars),
      'service.yaml': serviceYaml(vars),
      'Dockerfile': `FROM alpine:3.20\nCMD ["echo", "Remplacez ce Dockerfile par votre runtime réel"]\n`,
      'k8s/deployment.yaml': `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${vars.name}\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: ${vars.name}\n  template:\n    metadata:\n      labels:\n        app: ${vars.name}\n    spec:\n      containers:\n        - name: ${vars.name}\n          image: ${vars.name}:latest\n          ports:\n            - containerPort: 8080\n`,
      'k8s/service.yaml': `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${vars.name}\nspec:\n  selector:\n    app: ${vars.name}\n  ports:\n    - port: 80\n      targetPort: 8080\n`,
      '.github/workflows/ci.yml': CI_GENERIC
    })
  }
];

export function getTemplate(id) {
  return SCAFFOLDER_TEMPLATES.find((t) => t.id === id) || null;
}

export function listTemplatesSummary() {
  return SCAFFOLDER_TEMPLATES.map(({ id, name, description, kind, language, framework }) => ({ id, name, description, kind, language, framework }));
}
