/* ============================================================
   HubEauService — niveaux d'eau temps reel (API Hub'Eau v2)
   Repose sur SyncCache (TTL 15 min + repli hors-ligne).
   Ne leve JAMAIS d'exception non controlee vers l'appelant :
   toute erreur renvoie { ok: false, reason: ... }.
   ============================================================ */
(function () {
"use strict";

const BASE = "https://hubeau.eaufrance.fr/api/v2/hydrometrie";
const TTL_MS = 15 * 60 * 1000;
const STALE_WARNING_MS = 60 * 60 * 1000; // au-dela d'1h, la donnee est signalee non fiable

function isValidCodeStation(codeStation) {
  return typeof codeStation === "string" && /^[A-Za-z0-9*]{4,12}$/.test(codeStation.trim());
}

/**
 * Recupere la derniere hauteur d'eau connue pour une station Hub'Eau.
 * @param {string} codeStation - Code Sandre de la station (ex: "J4310010").
 * @returns {Promise<{
 *   ok: true, hauteurM: number, dateObs: string, source: string, ageMs: number, fiable: boolean
 * } | { ok: false, reason: string }>}
 */
async function getHauteurEauStation(codeStation) {
  if (!isValidCodeStation(codeStation)) {
    return { ok: false, reason: "code_station_invalide" };
  }

  const url = BASE + "/observations_tr?code_entite=" + encodeURIComponent(codeStation) +
    "&grandeur_hydro=H&size=1&sort=desc&fields=resultat_obs,date_obs";

  let result;
  try {
    result = await window.SyncCache.fetchWithCache("hubeau_" + codeStation, TTL_MS, url);
  } catch (networkErr) {
    console.warn("[HubEauService] Aucune donnee disponible (reseau + cache absents) pour " + codeStation, networkErr);
    return { ok: false, reason: "reseau_indisponible_sans_cache" };
  }

  const payload = result.data;
  const rows = (payload && Array.isArray(payload.data)) ? payload.data : [];
  if (!rows.length) return { ok: false, reason: "aucune_observation_hauteur" };

  const obs = rows[0];
  if (obs.resultat_obs === null || obs.resultat_obs === undefined || !Number.isFinite(Number(obs.resultat_obs))) {
    return { ok: false, reason: "valeur_manquante" };
  }

  return {
    ok: true,
    hauteurM: Number(obs.resultat_obs) / 1000,
    dateObs: obs.date_obs || null,
    source: result.source,          // "network" | "cache-fresh" | "cache-stale"
    ageMs: result.ageMs,
    fiable: result.source !== "cache-stale" || result.ageMs < STALE_WARNING_MS
  };
}

window.HubEauService = { getHauteurEauStation: getHauteurEauStation };

})();
