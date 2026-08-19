-- Feature flags (todo.md item 26) : activation progressive de
-- fonctionnalités expérimentales — globalement, par organisation ou par
-- utilisateur précis. `enabled` global sert d'interrupteur maître : s'il
-- est faux, seuls les org_ids/user_ids listés voient la fonctionnalité ;
-- s'il est vrai, tout le monde la voit (les listes deviennent alors
-- inutiles, mais restent affichées pour préparer une future désactivation
-- progressive plutôt que binaire).
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  org_ids JSONB NOT NULL DEFAULT '[]',
  user_ids JSONB NOT NULL DEFAULT '[]',
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
