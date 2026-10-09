// Service worker source. Vite emits this TypeScript entry as sw.js for browsers.
interface LifecycleEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends LifecycleEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}

interface MessageEventLike {
  data?: { type?: string; enabled?: boolean };
}

interface ServiceWorkerRuntime {
  addEventListener(type: "install" | "activate", listener: (event: LifecycleEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  skipWaiting(): void;
  clients: { claim(): Promise<void> };
}

const serviceWorker = self as unknown as ServiceWorkerRuntime;
const CACHE_NAME = "royalstream-react-v2";
const CACHE_TIME_HEADER = "x-royalstream-cached-at";
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_METADATA_ENTRIES = 60;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/images/default-cover.png",
  "./assets/logo/logo.png",
];
const CORE_URLS = new Set(CORE_ASSETS.map((asset) => new URL(asset, location.href).href));
let offlineCacheEnabled = true;

function isAppAsset(request: Request): boolean {
  const url = new URL(request.url);
  const appDestination = ["document", "script", "style", "image", "font", "manifest"].includes(request.destination);
  return url.origin === location.origin && (CORE_URLS.has(url.href) || request.mode === "navigate" || appDestination);
}

function isMusicMetadataRequest(request: Request): boolean {
  if (request.headers.has("range")) return false;
  const url = new URL(request.url);
  if (url.hostname === "api.jamendo.com") return url.pathname === "/v3.0/tracks";
  const audiusHost = url.hostname === "audius.co" || url.hostname.endsWith(".audius.co");
  return audiusHost && (url.pathname === "/" || /^\/v1\/tracks\/(trending|search)$/.test(url.pathname));
}

async function pruneMetadataCache(cache: Cache): Promise<void> {
  const requests = (await cache.keys()).filter(isMusicMetadataRequest);
  const entries = await Promise.all(requests.map(async (request) => {
    const response = await cache.match(request);
    const cachedAt = Number(response?.headers.get(CACHE_TIME_HEADER) || 0);
    return { request, cachedAt };
  }));
  const now = Date.now();
  const expired = entries.filter((entry) => !entry.cachedAt || now - entry.cachedAt > METADATA_TTL_MS);
  await Promise.all(expired.map(({ request }) => cache.delete(request)));
  const fresh = entries.filter((entry) => !expired.includes(entry)).sort((a, b) => b.cachedAt - a.cachedAt);
  await Promise.all(fresh.slice(MAX_METADATA_ENTRIES).map(({ request }) => cache.delete(request)));
}

async function fetchMusicMetadata(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (offlineCacheEnabled && response.ok && response.headers.get("content-type")?.includes("application/json")) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cacheResponse = response.clone();
        const headers = new Headers(cacheResponse.headers);
        headers.set(CACHE_TIME_HEADER, String(Date.now()));
        await cache.put(request, new Response(cacheResponse.body, {
          status: cacheResponse.status,
          statusText: cacheResponse.statusText,
          headers,
        }));
        await pruneMetadataCache(cache);
      } catch {
        // Keep the network response usable when browser storage is full or unavailable.
      }
    }
    return response;
  } catch {
    const cached = offlineCacheEnabled ? await caches.match(request) : undefined;
    const cachedAt = Number(cached?.headers.get(CACHE_TIME_HEADER) || 0);
    if (cached && cachedAt && Date.now() - cachedAt <= METADATA_TTL_MS) return cached;
    if (cached) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(request);
    }
    return new Response("", { status: 503 });
  }
}

serviceWorker.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  serviceWorker.skipWaiting();
});

serviceWorker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )).then(() => serviceWorker.clients.claim()),
  );
});

serviceWorker.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (isAppAsset(event.request)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then(async (response) => {
        if (response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          } catch {
            // The request still succeeds if the browser cannot cache this asset.
          }
        }
        return response;
      }).catch(async () => {
        if (event.request.mode === "navigate") {
          return (await caches.match("./index.html")) || new Response("", { status: 503 });
        }
        return new Response("", { status: 503 });
      })),
    );
  } else if (isMusicMetadataRequest(event.request)) {
    event.respondWith(offlineCacheEnabled ? fetchMusicMetadata(event.request) : fetch(event.request));
  }
});

serviceWorker.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") serviceWorker.skipWaiting();
  if (event.data?.type === "SET_OFFLINE_CACHE" && typeof event.data.enabled === "boolean") {
    offlineCacheEnabled = event.data.enabled;
    if (!offlineCacheEnabled) {
      void caches.open(CACHE_NAME).then(async (cache) => {
        const requests = await cache.keys();
        await Promise.all(requests.filter((request) => !isAppAsset(request)).map((request) => cache.delete(request)));
      });
    }
  }
});
