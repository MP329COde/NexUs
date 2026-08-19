-- Activité d'équipe par projet (todo.md items 28/31) : journal orienté
-- développement ("Alice a créé une tâche", "Bob a commenté"...), distinct
-- du journal d'audit sécurité existant (store/notificationsStore.js /
-- routes/audit.routes.js, réservé aux admins et aux événements sensibles).
-- Best-effort, comme logAudit() : jamais bloquant pour l'action métier.
CREATE TABLE IF NOT EXISTS project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(project_id, created_at DESC);
