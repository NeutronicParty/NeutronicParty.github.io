// ==UserScript==
// @name         Neutronic Loader
// @namespace    Neutron
// @version      1.04
// @description  Loads Neutronic Engine code from GitHub
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const SRC = 'https://raw.githubusercontent.com/Strangergithun/loader/main/code.js';

  const log  = (...a) => console.log('%c[Neutronic Loader]', 'color:#0af', ...a);
  const warn = (...a) => console.warn('[Neutronic Loader]', ...a);
  const fail = (...a) => console.error('[Neutronic Loader]', ...a);

  const getDocEl = () => document.head || document.documentElement || document.body;

  const pageInject = (code) => {
    const marker = '__ntr_loader_' + Math.random().toString(36).slice(2);
    const wrapped = ';window[' + JSON.stringify(marker) + ']=1;\n' + code;
    const landed = () => typeof unsafeWindow !== 'undefined' && !!unsafeWindow[marker];

    if (typeof GM_addElement === 'function') {
      try {
        GM_addElement(getDocEl() || document.documentElement, 'script', { textContent: wrapped });
      } catch (e) { warn('GM_addElement failed:', e); }
    }

    if (!landed()) {
      const s = document.createElement('script');
      s.textContent = wrapped;
      (getDocEl() || document.documentElement).appendChild(s);
      s.remove();
    }

    if (!landed()) {
      warn('inline injection blocked by CSP, evaluating in page realm');
      try { unsafeWindow.eval(wrapped); }
      catch (e) { fail('page eval failed:', e); }
    }

    return landed();
  };

  const run = (code) => {
    if (typeof code !== 'string' || code.length < 50) {
      fail('response is empty or too short');
      return;
    }
    if (pageInject(code)) log('script executed in page context (' + code.length + ' bytes)');
    else fail('could not execute script in page context');
  };

  const handle = (status, contentType, body, url) => {
    if (status !== 200) { fail('HTTP', status, 'for', url); return; }
    if (contentType && !/javascript|ecmascript|text\/plain/i.test(contentType)) {
      fail('unexpected content-type:', contentType, '— not executing (likely an error/HTML page)');
      return;
    }
    run(body);
  };

  const url = SRC + '?t=' + Date.now();

  const gmXhr =
    (typeof GM_xmlhttpRequest === 'function' && GM_xmlhttpRequest) ||
    (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function' && GM.xmlHttpRequest);

  if (gmXhr) {
    const res = gmXhr({
      method: 'GET',
      url,
      timeout: 20000,
      headers: { 'Cache-Control': 'no-cache' },
      onload: (r) => {
        const m = (r.responseHeaders || '').match(/content-type:\s*([^\r\n]+)/i);
        handle(r.status, m && m[1], r.responseText, url);
      },
      onerror: (e) => fail('request failed:', e),
      ontimeout: () => fail('request timed out'),
    });
    if (res && typeof res.then === 'function') res.catch((e) => fail('request rejected:', e));
  } else {
    warn('no GM_xmlhttpRequest — using fetch');
    fetch(url, { cache: 'no-store' })
      .then((r) => r.text().then((body) => handle(r.status, r.headers.get('content-type'), body, url)))
      .catch((e) => fail('fetch failed:', e));
  }
})();
