// Erreurs HTTP typées : le gestionnaire central les convertit en réponses JSON.
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentification requise', code = 'unauthorized') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'Action non autorisée') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Ressource introuvable') => new HttpError(404, 'not_found', message);
export const conflict = (message) => new HttpError(409, 'conflict', message);
export const unprocessable = (message, details) => new HttpError(422, 'unprocessable', message, details);
export const upstream = (service, status, detail) =>
  new HttpError(502, 'upstream_error', `Échec du service ${service}`, { service, status, detail });
