/**
 * API configuration for SensorLens.
 * - When VITE_API_URL is specified (e.g. custom host or split deployment), it uses that.
 * - In local development (Vite dev server), it defaults to 'http://localhost:8000'.
 * - In production (e.g. Docker / Hugging Face Spaces where FastAPI serves both backend and frontend),
 *   it defaults to '' (relative path), so requests like `${API_BASE_URL}/api/...` become `/api/...` on the same host.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
    ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
    : (import.meta.env.DEV ? 'http://localhost:8000' : '');
