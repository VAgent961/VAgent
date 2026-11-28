// The two reel languages. They alternate every calendar day in Beirut, counted from 28 Nov 2026 (Lebanese Arabic),
// so a skipped or declined day never makes two days in a row share a language. Also used by the SQL in _marketing.js.
export const AR = 'ar-LB', EPOCH = '2026-11-28';
export const langFor = (date) => (Math.round((Date.parse(date) - Date.parse(EPOCH)) / 864e5) % 2 === 0 ? AR : 'en');
export const langOf = (post) => (post?.lang === AR ? AR : 'en');
export const LANG_NAME = { [AR]: 'Lebanese Arabic', en: 'English' };
// "comment KEYWORD" in either language, anywhere in a caption or line
export const asksFor = (keyword, text) => new RegExp(`(comment\\b|(?:اكتبوا|اكتبي|اكتب|علّقوا|علّقي|علّق|علقوا|علق|كومنت))[^\\n]{0,24}?(?<![\\p{L}\\p{N}])${keyword}(?![\\p{L}\\p{N}])`, 'iu').test(String(text));
export const ASK_LINE = /^\s*(#|comment\b|اكتب|علّق|علق|كومنت)/i;
