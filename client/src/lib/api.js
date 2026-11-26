import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

// A platform support session lives only in the tab that opened it (sessionStorage); the owner's own token stays in localStorage.
export const SUPPORT_KEY = 'eb_support_token';
export const getToken = () => sessionStorage.getItem(SUPPORT_KEY) || localStorage.getItem('eb_token');

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && sessionStorage.getItem(SUPPORT_KEY)) {
      sessionStorage.removeItem(SUPPORT_KEY);
      location.href = '/platform';
    } else if (err.response?.status === 401 && localStorage.getItem('eb_token')) {
      localStorage.removeItem('eb_token');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export function errorMessage(err) {
  const d = err?.response?.data;
  if (!d) return err?.message || 'Something went wrong';
  if (Array.isArray(d.details) && d.details.length) {
    const first = d.details.map((x) => (typeof x === 'string' ? x : `${(x.path || []).join('.')} ${x.message}`.trim()));
    return `${d.error}: ${first.slice(0, 5).join('; ')}`;
  }
  return d.error || 'Something went wrong';
}

export async function downloadCsv(path, filename) {
  const r = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
