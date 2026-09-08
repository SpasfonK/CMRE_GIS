/* ============================================================
   PKProjector — projection GPS -> PK courant sur le fil d'eau
   100% local, aucune dependance reseau. Construit un index a partir
   de la FeatureCollection de segmentation VNF (FPKH/TPKH en metres).
   ============================================================ */
(function () {
"use strict";

let segments = []; // { chain: [[lon,lat], ...], fpkh, tpkh, voie, cumLens: [...], totalLen }

function toNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Distance approximee en metres (projection equirectangulaire, valide a l'echelle d'un departement).
function distMeters(lat1, lon1, lat2, lon2) {
  const avgLatRad = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dx = (lon2 - lon1) * 111320 * Math.cos(avgLatRad);
  const dy = (lat2 - lat1) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

// Projette le point P sur le segment [A,B] (coordonnees lon/lat), renvoie
// { distanceM, distAlongSegM, segLenM }.
function projectOnSegment(pLat, pLon, aLon, aLat, bLon, bLat) {
  const avgLatRad = ((aLat + bLat) / 2) * Math.PI / 180;
  const ax = 0, ay = 0;
  const bx = (bLon - aLon) * 111320 * Math.cos(avgLatRad);
  const by = (bLat - aLat) * 110540;
  const px = (pLon - aLon) * 111320 * Math.cos(avgLatRad);
  const py = (pLat - aLat) * 110540;

  const segLenSq = bx * bx + by * by;
  let t;
  if (segLenSq < 1e-9) {
    t = 0; // segment degenere (longueur ~0)
  } else {
    t = ((px * bx) + (py * by)) / segLenSq;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }
  const projX = ax + t * bx;
  const projY = ay + t * by;
  const dx = px - projX, dy = py - projY;
  const distanceM = Math.sqrt(dx * dx + dy * dy);
  const segLenM = Math.sqrt(segLenSq);
  return { distanceM: distanceM, distAlongSegM: t * segLenM, segLenM: segLenM };
}

function flattenChains(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function chainLength(chain) {
  let total = 0;
  const cum = [0];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i];
    total += distMeters(a[1], a[0], b[1], b[0]);
    cum.push(total);
  }
  return { total: total, cum: cum };
}

/**
 * Construit l'index de projection a partir de la FeatureCollection de
 * segmentation VNF. A appeler une seule fois au chargement des donnees.
 * @param {Object} fc - FeatureCollection GeoJSON (LineString/MultiLineString).
 * @param {Object} [keyGetters] - { fpkh: fn(props), tpkh: fn(props), voie: fn(props) }
 * @returns {number} nombre de sous-chaines indexees.
 */
function build(fc, keyGetters) {
  segments = [];
  if (!fc || !Array.isArray(fc.features)) return 0;
  fc.features.forEach(function (f) {
    const props = f.properties || {};
    const fpkhRaw = keyGetters && keyGetters.fpkh ? keyGetters.fpkh(props) : props.FPKH;
    const tpkhRaw = keyGetters && keyGetters.tpkh ? keyGetters.tpkh(props) : props.TPKH;
    const voie = keyGetters && keyGetters.voie ? keyGetters.voie(props) : (props.Voie || "Voie inconnue");
    const fpkh = toNumber(fpkhRaw);
    const tpkh = toNumber(tpkhRaw);
    if (fpkh === null || tpkh === null) return; // segment sans reperage PK exploitable, ignore

    const chains = flattenChains(f.geometry);
    chains.forEach(function (chain) {
      if (!chain || chain.length < 2) return; // chaine degeneree, ignoree
      const lens = chainLength(chain);
      if (lens.total < 0.5) return; // chaine de longueur quasi nulle (< 0.5 m), ignoree
      segments.push({ chain: chain, fpkh: fpkh, tpkh: tpkh, voie: voie, cumLens: lens.cum, totalLen: lens.total });
    });
  });
  return segments.length;
}

/**
 * Trouve le PK courant le plus vraisemblable pour une position GPS donnee.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [maxDistanceM=120] - Distance max acceptable au fil d'eau (m).
 * @returns {{ pk: number, voie: string, distanceM: number, approx: boolean } | null}
 *   approx=true si la distance depasse 40% du seuil max (signal de prudence UI).
 */
function findNearestPK(lat, lon, maxDistanceM) {
  const threshold = (typeof maxDistanceM === "number" && maxDistanceM > 0) ? maxDistanceM : 120;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let best = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const chain = seg.chain;
    for (let j = 1; j < chain.length; j++) {
      const a = chain[j - 1], b = chain[j];
      const proj = projectOnSegment(lat, lon, a[0], a[1], b[0], b[1]);
      if (!best || proj.distanceM < best.distanceM) {
        const cumBefore = seg.cumLens[j - 1];
        const distAlongChain = cumBefore + proj.distAlongSegM;
        const fraction = seg.totalLen > 0 ? (distAlongChain / seg.totalLen) : 0;
        const pk = (seg.fpkh + fraction * (seg.tpkh - seg.fpkh)) / 1000;
        best = { distanceM: proj.distanceM, pk: pk, voie: seg.voie };
      }
    }
  }

  if (!best || best.distanceM > threshold) return null;
  return {
    pk: Math.round(best.pk * 100) / 100,
    voie: best.voie,
    distanceM: Math.round(best.distanceM),
    approx: best.distanceM > threshold * 0.4
  };
}

window.PKProjector = {
  build: build,
  findNearestPK: findNearestPK,
  segmentCount: function () { return segments.length; }
};

})();
