import axios from 'axios';
import { logout } from '../features/auth/authSlice';

// One axios instance for the whole app, with two interceptors:
//   request  -> attach the JWT from localStorage to every call
//   response -> on 401, drop the session and bounce to /login
export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fanni_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function installResponseInterceptor(store) {
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && error.response.status === 401 && localStorage.getItem('fanni_token')) {
        store.dispatch(logout());
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
      return Promise.reject(error);
    }
  );
}

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.error?.message || fallback;
