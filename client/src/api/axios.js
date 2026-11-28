import axios from 'axios';
import { logout } from '../features/auth/authSlice';

// One axios instance for the whole app, with two interceptors:
//   request  -> attach the access token from localStorage to every call
//   response -> on 401, try one silent refresh with the refresh token and replay the request;
//               if that fails because the session is really over, drop it and bounce to /login
export const api = axios.create({ baseURL: '/api' });

const TOKEN_KEY = 'fanni_token';
const REFRESH_KEY = 'fanni_refresh';

export function saveTokens({ token, refreshToken }) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
}

// Tell the server to kill this session right now (access + refresh token). Fire and forget.
export function revokeSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!token && !refreshToken) return;
  try {
    fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// One refresh at a time: parallel 401s all wait for the same request.
let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    refreshing = (refreshToken
      ? axios.post('/api/auth/refresh', { refreshToken }).then((r) => { saveTokens(r.data); return r.data.token; })
      : Promise.reject(Object.assign(new Error('no refresh token'), { endSession: true }))
    ).finally(() => { refreshing = null; });
  }
  return refreshing;
}

const AUTH_URLS = ['/auth/login', '/auth/register', '/auth/google', '/auth/refresh', '/auth/logout'];

export function installResponseInterceptor(store) {
  const endSession = () => {
    store.dispatch(logout());
    if (window.location.pathname !== '/login') window.location.assign('/login');
  };
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error.response && error.response.status;
      const original = error.config;
      if (status !== 401 || !localStorage.getItem(TOKEN_KEY) || !original) return Promise.reject(error);
      if (original._retried || AUTH_URLS.some((u) => String(original.url || '').includes(u))) {
        endSession();
        return Promise.reject(error);
      }
      original._retried = true;
      try {
        const token = await refreshSession();
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch (e) {
        // Only a real "session is over" answer ends the session; a network blip or a busy server does not.
        if (e.endSession || (e.response && e.response.status === 401)) endSession();
        return Promise.reject(error);
      }
    }
  );
}

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.error?.message || fallback;
