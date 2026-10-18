export type Theme = 'light' | 'dark';
const key = 'circuit-studio.theme';
export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* Browser storage can be disabled. */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* The active theme still works for this session. */
  }
}
