import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured } from './httpClient.js';

const SEVERITY_EMOJI = { crit: '🔴', warn: '🟠', info: '🔵' };

function client() {
  const cfg = getRawIntegration('notificationsWebhook');
  if (!cfg.url) return null;
  return { http: buildClient(cfg.url), cfg };
}

// Format du corps JSON attendu par le webhook cible. Slack, Mattermost et
// les connecteurs Teams "Incoming Webhook" (legacy, MessageCard) acceptent
// tous {"text": "..."} — seul Discord attend {"content": "..."}. Détecté
// depuis l'hôte de l'URL plutôt que demandé explicitement à l'admin : un
// champ "fournisseur" en plus serait une friction inutile pour un format
// que l'URL elle-même indique déjà sans ambiguïté.
function buildPayload(url, text) {
  const isDiscord = /discord(app)?\.com/i.test(url);
  return isDiscord ? { content: text } : { text };
}

// Envoi best-effort : jamais bloquant pour le flux qui a déclenché la
// notification (verrouillage de compte, vulnérabilité critique...). Un
// webhook externe indisponible ne doit jamais faire échouer l'action réelle
// qui a produit l'événement — seulement être journalisé.
export async function sendWebhookNotification({ title, message, severity = 'info' }) {
  const c = client();
  if (!c) return;
  const emoji = SEVERITY_EMOJI[severity] || SEVERITY_EMOJI.info;
  const text = title ? `${emoji} *${title}*\n${message}` : `${emoji} ${message}`;
  try {
    await c.http.post('', buildPayload(c.cfg.url, text));
  } catch {
    // Best-effort : voir commentaire ci-dessus. Le webhook lui-même reste
    // testable explicitement depuis Paramètres → Intégrations ("Tester").
  }
}

// Volontairement sans effet de bord (aucun appel réseau) : contrairement aux
// autres intégrations, getStatus() ici est interrogé automatiquement toutes
// les ~20s par le tableau de bord (voir status.routes.js) — si elle postait
// réellement un message à chaque appel, le canal Slack/Discord/Teams serait
// spammé en continu. Le vrai test d'envoi est sendTestMessage(), déclenché
// uniquement par un clic explicite sur "Tester" (voir settings.routes.js).
export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Notifications sortantes');
  return { configured: true, ok: true, message: 'Webhook enregistré — utilisez « Tester » pour envoyer un message de vérification.' };
}

export async function sendTestMessage() {
  const c = client();
  if (!c) return notConfigured('Notifications sortantes');
  await request(c.http, { method: 'POST', url: '', data: buildPayload(c.cfg.url, '✅ Nexus Console — message de test.') }, 'Notifications sortantes');
  return { configured: true, ok: true, message: 'Message de test envoyé.' };
}
