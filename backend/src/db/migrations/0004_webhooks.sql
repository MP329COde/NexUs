-- Secret de webhook par projet : généré à la création, jamais renvoyé en
-- clair après coup (voir routes/projects.routes.js GET /:id/webhook) sauf
-- au moment de sa (re)génération explicite. Sert à vérifier l'authenticité
-- des événements entrants GitLab (en-tête X-Gitlab-Token, comparaison
-- directe) et GitHub (en-tête X-Hub-Signature-256, HMAC-SHA256 du corps).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
