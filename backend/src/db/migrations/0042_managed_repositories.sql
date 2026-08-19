-- Repository provisioning (Lot 54, chantiers #41/#42/#43, Étape 20 du plan
-- Developer Experience) : modèle de données pour un "Repository Managed by
-- NexUs" — UNIQUEMENT la structure de données et le suivi d'une demande de
-- provisioning. L'appel réel à GitHub (création du dépôt, push du template)
-- n'est PAS implémenté ici : il nécessite githubPlatformService avec des
-- credentials de plateforme réels (compte/organisation GitHub dédié, géré
-- par l'utilisateur — voir todo.md et Étape 19 du plan). Construire ce
-- modèle sans pouvoir tester un appel réel serait un risque de succès
-- simulé ; le modèle seul (statuts, CRUD, liste) peut en revanche être
-- testé légitimement sans jamais prétendre qu'un dépôt a été créé chez
-- GitHub.
CREATE TABLE IF NOT EXISTS managed_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dépôt externe visé (pas encore créé tant que status = 'pending')
  provider TEXT NOT NULL DEFAULT 'github' CHECK (provider IN ('github', 'gitlab', 'gitea')),
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  component_id UUID REFERENCES components(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'provisioned', 'failed')),
  status_detail TEXT,
  web_url TEXT,
  requested_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, owner, name)
);
CREATE INDEX IF NOT EXISTS idx_managed_repositories_org ON managed_repositories(org_id);
CREATE INDEX IF NOT EXISTS idx_managed_repositories_project ON managed_repositories(project_id);
CREATE INDEX IF NOT EXISTS idx_managed_repositories_status ON managed_repositories(status);
