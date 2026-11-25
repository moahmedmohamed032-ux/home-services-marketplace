import { createSlice } from '@reduxjs/toolkit';

const lang = (navigator.language || "").startsWith("ar") ? "ar" : "en";
const savedLang = localStorage.getItem('fixit_lang');
const theme = localStorage.getItem('fixit_theme') || 'light';

export function applyUi(state) {
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  root.dataset.theme = state.theme;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: { lang: savedLang || lang, theme },
  reducers: {
    toggleLang(state) {
      state.lang = state.lang === 'ar' ? 'en' : 'ar';
      localStorage.setItem('fixit_lang', state.lang);
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('fixit_theme', state.theme);
    },
  },
});

export const { toggleLang, toggleTheme } = uiSlice.actions;
export default uiSlice.reducer;
