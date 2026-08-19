-- Présence en temps quasi-réel par projet (todo.md item 3 : "présence des
-- utilisateurs, qui modifie quoi") — un ping léger (POST .../presence)
-- toutes les ~20s depuis la fiche projet met à jour last_seen_at ; un
-- utilisateur est considéré "présent" si vu dans la dernière minute (voir
-- listPresence côté service, pas de TTL en base — une ligne périmée est
-- simplement filtrée à la lecture, jamais purgée activement).
CREATE TABLE IF NOT EXISTS project_presence (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
