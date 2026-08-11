import { logger } from '../utils/logger.js';

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: `Route introuvable: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || err.response?.status || 500;
  const message = err.publicMessage || err.message || 'Erreur interne';
  if (status >= 500) logger.error({ err }, 'Erreur non gérée');
  res.status(status).json({ ok: false, error: message });
}
