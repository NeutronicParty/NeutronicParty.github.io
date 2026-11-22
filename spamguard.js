/* Reload guard — shared by every page.
   Three reloads inside three seconds sends the tab to /dontspam/.
   Normal navigation is ignored; only real reloads count. */
(function () {
  'use strict';
  try {
    if (location.pathname.indexOf('/dontspam') === 0) return;

    var now = Date.now();
    var until = Number(sessionStorage.getItem('nsp_until') || 0);
    if (until > now) {
      location.replace('/dontspam/');
      return;
    }
    if (until) sessionStorage.removeItem('nsp_until');

    var entry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var isReload = entry
      ? entry.type === 'reload'
      : !!(performance.navigation && performance.navigation.type === 1);
    if (!isReload) return;

    var KEY = 'nsp_reloads';
    var hits = [];
    try {
      hits = JSON.parse(sessionStorage.getItem(KEY) || '[]');
      if (!Array.isArray(hits)) hits = [];
    } catch (e) { hits = []; }

    hits = hits.filter(function (t) { return typeof t === 'number' && now - t < 3000; });
    hits.push(now);

    if (hits.length >= 3) {
      sessionStorage.removeItem(KEY);
      sessionStorage.setItem('nsp_until', String(now + 10000));
      location.replace('/dontspam/');
      return;
    }

    sessionStorage.setItem(KEY, JSON.stringify(hits));
  } catch (e) {}
})();
