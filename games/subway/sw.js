/* Neutronic in-page viewer for ashuni.lol.
   Scope: /games/subway/ — anything under it is proxied to https://ashuni.lol
   so the site can render inside our iframe (it ships X-Frame-Options: DENY). */
'use strict';

var PREFIX = '/games/subway/';
var TARGET = 'https://ashuni.lol';
var SELF_FILES = ['', 'index.html', 'sw.js'];

var SHIM = '(' + function () {
  var P = '/games/subway';
  function fix(u) {
    if (typeof u !== 'string') return u;
    if (u.charAt(0) === '/' && u.charAt(1) !== '/' && u.indexOf(P + '/') !== 0) return P + u;
    return u;
  }
  function real(u) {
    try { return new URL(u, 'https://ashuni.lol/').href; } catch (e) { return u; }
  }
  var of = window.fetch;
  if (of) window.fetch = function (input, init) {
    if (typeof input === 'string') input = fix(input);
    else if (input && input.url) { var u = fix(input.url); if (u !== input.url) input = new Request(u, input); }
    return of.call(this, input, init);
  };
  var ox = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { arguments[1] = fix(u); return ox.apply(this, arguments); };
  var oo = window.open;
  window.open = function (u, n, f) { return oo.call(window, u ? real(u) : u, n, f); };
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.reject(new Error('disabled')); }; } catch (e) {}
  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href');
    if (!h || h.charAt(0) === '#' || /^javascript:/i.test(h)) return;
    e.preventDefault();
    var abs = real(h);
    if (a.target === '_blank') { oo.call(window, abs, '_blank'); return; }
    if (window.parent !== window) window.parent.postMessage({ __ash: 1, url: abs }, '*');
    else window.location.href = fix(a.pathname + a.search);
  }, true);
} + ')();';

function rewrite(html, url) {
  html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
  html = html.replace(/<base[^>]*>/gi, '');
  html = html.replace(/(href|src|action)="\/(?!\/)/gi, '$1="');
  html = html.replace(/url\(\//g, 'url(');
  var head = '<base href="' + PREFIX + '"><script>' + SHIM + '<\/script>';
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1>' + head);
  else html = head + html;
  return html;
}

function rewriteCss(css, rel) {
  var depth = rel.split('/').length - 1;
  var up = new Array(depth + 1).join('../');
  return css.replace(/url\(\//g, 'url(' + up);
}

async function proxy(request, url, rel) {
  var target = TARGET + '/' + rel + url.search;
  var headers = new Headers();
  ['accept', 'accept-language', 'content-type', 'range'].forEach(function (h) {
    var v = request.headers.get(h);
    if (v) headers.set(h, v);
  });
  var init = { method: request.method, headers: headers, redirect: 'follow', credentials: 'omit' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();

  var res;
  try { res = await fetch(target, init); }
  catch (e) { return new Response('proxy error: ' + e.message, { status: 502, headers: { 'content-type': 'text/plain' } }); }

  var ct = res.headers.get('content-type') || '';
  if (ct.indexOf('text/html') >= 0) {
    var html = await res.text();
    return new Response(rewrite(html, target), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  if (ct.indexOf('text/css') >= 0) {
    var css = await res.text();
    return new Response(rewriteCss(css, rel), {
      status: res.status,
      headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  return res;
}

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var request = e.request;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(PREFIX) !== 0) return;
  var rel = decodeURIComponent(url.pathname.slice(PREFIX.length));
  if (SELF_FILES.indexOf(rel) >= 0) return;
  if (/^(games|games\/|games\/subway\/|games\/subway\/index\.html)$/.test(rel)) return;
  e.respondWith(proxy(request, url, rel));
});
