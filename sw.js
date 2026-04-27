/*
 * Fulcrum — Personal Finance
 * Service Worker v1.0
 * Copyright © 2026 Matt Knox. All rights reserved.
 *
 * Strategy: Cache-first for app shell assets, network-first for CDN resources.
 * All user data lives in localStorage — the SW only caches static assets.
 */

const CACHE_NAME = 'fulcrum-v1';

// App shell — everything needed to run offline
const APP_SHELL = [
  '/fulcrum.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png'
];

// CDN resources — cached on first fetch, served from cache thereafter
const CDN_RESOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache app shell (required) and CDN resources (best-effort)
      return cache.addAll(APP_SHELL).then(() =>
        Promise.allSettled(CDN_RESOURCES.map(url => cache.add(url)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: remove stale caches from previous versions ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // CDN resources — cache-first, no network fallback needed (already cached at install)
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // App shell — cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful same-origin responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // If both cache and network fail, return the main app shell
        // (handles navigations to unknown paths when offline)
        if (event.request.destination === 'document') {
          return caches.match('/fulcrum.html');
        }
      });
    })
  );
});
