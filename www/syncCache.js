/* ============================================================
   SyncCache — cache generique avec TTL + repli hors-ligne
   Fondation commune a tous les flux dynamiques (Hub'Eau, Avisbat...).
   Aucune dependance externe. Fonctionne sans reseau si un cache
   (meme expire) est disponible.
   ============================================================ */
(function () {
"use strict";

function now() { return Date.now(); }

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn("[SyncCache] localStorage indisponible (lecture) :", e);
    return null;
  }
}
function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn("[SyncCache] localStorage indisponible (ecriture, quota ?) :", e);
    return false;
  }
}

function makeCache(namespace, ttlMs) {
  const key = "syncCache_" + namespace;

  function readEntry() {
    const raw = safeStorageGet(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.savedAt !== "number") return null;
      return parsed;
    } catch (e) {
      console.warn("[SyncCache] Entree corrompue pour " + namespace + ", ignoree.", e);
      return null;
    }
  }

  return {
    // Donnee fraiche uniquement (respecte le TTL). Retourne null si absente/expiree.
    getFresh: function () {
      const entry = readEntry();
      if (!entry) return null;
      if (now() - entry.savedAt > ttlMs) return null;
      return entry.data;
    },
    // Donnee de secours, meme expiree (utile en mode hors-ligne total).
    getStale: function () {
      const entry = readEntry();
      return entry ? { data: entry.data, ageMs: now() - entry.savedAt } : null;
    },
    set: function (data) {
      return safeStorageSet(key, JSON.stringify({ savedAt: now(), data: data }));
    }
  };
}

// fetch avec timeout explicite (evite un blocage indefini en reseau degrade).
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const opts = Object.assign({}, options || {});
  if (controller) opts.signal = controller.signal;
  const timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
  return fetch(url, opts).finally(function () {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

// Deduplication des requetes concurrentes identiques (evite le gaspillage
// de donnees mobiles si plusieurs composants demandent la meme ressource
// au meme instant avant resolution de la premiere requete).
const inFlight = new Map();

/**
 * Recupere une ressource JSON avec cache TTL + repli hors-ligne.
 * @param {string} namespace - Identifiant unique du cache (ex: "hubeau_J4310010").
 * @param {number} ttlMs - Duree de vie de la donnee fraiche en millisecondes.
 * @param {string} url - URL a interroger.
 * @param {number} [timeoutMs=8000] - Timeout reseau.
 * @returns {Promise<{data: any, source: "network"|"cache-fresh"|"cache-stale", ageMs: number}>}
 *   Ne rejette JAMAIS pour une cause reseau si un cache (meme perime) existe.
 *   Ne rejette que si aucune donnee (fraiche ou perimee) n'est disponible ET
 *   que le reseau echoue egalement.
 */
function fetchWithCache(namespace, ttlMs, url, timeoutMs) {
  const cache = makeCache(namespace, ttlMs);
  const fresh = cache.getFresh();
  if (fresh !== null) {
    return Promise.resolve({ data: fresh, source: "cache-fresh", ageMs: 0 });
  }

  if (inFlight.has(namespace)) return inFlight.get(namespace);

  const promise = fetchWithTimeout(url, {}, timeoutMs || 8000)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      cache.set(data);
      return { data: data, source: "network", ageMs: 0 };
    })
    .catch(function (networkErr) {
      const stale = cache.getStale();
      if (stale) {
        console.warn("[SyncCache] Reseau indisponible pour " + namespace + ", repli sur cache perime (" + Math.round(stale.ageMs / 60000) + " min).", networkErr);
        return { data: stale.data, source: "cache-stale", ageMs: stale.ageMs };
      }
      throw networkErr;
    })
    .finally(function () {
      inFlight.delete(namespace);
    });

  inFlight.set(namespace, promise);
  return promise;
}

window.SyncCache = {
  fetchWithCache: fetchWithCache,
  makeCache: makeCache
};

})();
