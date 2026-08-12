import { recordRequest } from '../services/trafficMonitorService.js';

// Alimente le pare-feu applicatif (Réseaux → Pare-feu) : une entrée par
// requête API, capturée à la fin de la réponse pour connaître le vrai statut.
// N'intercepte ni ne consomme le corps de la requête (safe avant express.json()).
export function trafficLogger(req, res, next) {
  // req.originalUrl (et non req.path) : les routers imbriqués (app → /api →
  // /status → /health) réécrivent req.url pendant le routage et ne le
  // restaurent pas forcément avant l'évènement 'finish', qui est asynchrone.
  const path = req.originalUrl.split('?')[0];
  res.on('finish', () => {
    if (!path.startsWith('/api')) return;
    recordRequest({ ip: req.ip, method: req.method, path, status: res.statusCode });
  });
  next();
}
