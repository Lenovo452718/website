/* ============================================================
   STREETSTORE — i18n Engine
   ============================================================ */

const LANG_KEY = 'ss_lang';

function getLang() {
  return localStorage.getItem(LANG_KEY) || 'en';
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  applyLang(lang);
}

function t(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS['en'][key]) || key;
}

function applyLang(lang) {
  const T = TRANSLATIONS[lang] || TRANSLATIONS['en'];

  /* ── Direction & lang attribute ── */
  const isRTL = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir  = isRTL ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isRTL);

  /* ── data-i18n text content ── */
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (T[key] !== undefined) el.textContent = T[key];
  });

  /* ── data-i18n-ph placeholders ── */
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    if (T[key] !== undefined) el.placeholder = T[key];
  });

  /* ── data-i18n-title title attr ── */
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (T[key] !== undefined) el.title = T[key];
  });

  /* ── Language switcher active state ── */
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  /* ── Re-render cart drawer if open ── */
  if (typeof renderCartItems === 'function') renderCartItems();
}

/* ── Language switcher click handler ── */
function initLangSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
}

/* ── Run on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {
  initLangSwitcher();
  applyLang(getLang());
});
