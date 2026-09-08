(function () {
"use strict";

const BUILD_ID = "SIG-POCHE-2026-08-19-V7-ROUTES";

function getTag(props, keys) {
  if (!props) return null;
  for (const k of keys) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== "") return props[k];
    const alt1 = k.replace(/_/g, "");
    const alt2 = k.replace(/:/g, "");
    const alt3 = k.replace(/:/g, "_");
    for (const cand of [alt1, alt2, alt3]) {
      if (props[cand] !== undefined && props[cand] !== null && props[cand] !== "") return props[cand];
    }
  }
  const normk = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = keys.map(normk);
  for (const realKey of Object.keys(props)) {
    const nk = normk(realKey);
    if (wanted.includes(nk) && props[realKey] !== null && props[realKey] !== "") return props[realKey];
  }
  return null;
}
function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}
function showToast(msg, ms) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), ms || 2400);
}
function norm(str) {
  return (str || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}
function offsetLatLngs(mapRef, latlngs, pixelOffset) {
  try {
    const z = mapRef.getZoom();
    const pts = latlngs.map(function (ll) { return mapRef.project(L.latLng(ll), z); });
    const offsetPts = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      offsetPts.push(L.point(pts[i].x + nx * pixelOffset, pts[i].y + ny * pixelOffset));
    }
    return offsetPts.map(function (p) { return mapRef.unproject(p, z); });
  } catch (e) { return latlngs; }
}

// ---------------------------------------------------------------------
// Resolution communale locale (module optionnel communeResolver.js).
// ---------------------------------------------------------------------
function communeSectionHtml(list, pending) {
  if (pending) return "<div class=\"sheet-section\"><h4>Localisation</h4><div class=\"note-box\">Resolution de la commune en cours...</div></div>";
  if (!list || !list.length) return "<div class=\"sheet-section\"><h4>Localisation</h4><div class=\"note-box\">Localisation indisponible (contours communaux non charges).</div></div>";
  if (list.length === 1) {
    return "<div class=\"sheet-section\"><h4>Localisation</h4><div class=\"attr-grid\">" + attrCard("Commune", list[0].name, true) + "</div></div>";
  }
  const items = list.map(function (c) { return "<li>" + escapeHtml(c.name) + "</li>"; }).join("");
  return "<div class=\"sheet-section\"><h4>Communes traversees</h4><ul style=\"margin:0;padding-left:18px;font-size:14px;color:#101c22;\">" + items + "</ul></div>";
}

// Section optionnelle "profil de route officiel VNF 2018", construite a
// partir des communes resolues (recherche par correspondance de toponymes).
function routeProfileSectionHtml(list) {
  if (!window.VNFDataset || !window.VNFDataset.isReady() || !list || !list.length) return "";
  const communeNames = list.map(function (c) { return c.name; });
  const profile = window.VNFDataset.routeProfileForCommunes(communeNames);
  if (!profile) return "";
  return "<div class=\"sheet-section\"><h4>Profil de route officiel (VNF 2018)</h4><div class=\"attr-grid\">" +
    attrCard("Section", profile.name, true) +
    attrCard("Distance (km)", profile.distance_km) +
    attrCard("Hauteur libre (m)", profile.hauteur_libre_m) +
    attrCard("Mouillage cible (m)", profile.mouillage_cible_m) +
    attrCard("Nombre d'ecluses", profile.ecluses) +
    attrCard("Longueur utile ecluse (m)", profile.ecluse_longueur_m) +
    attrCard("Largeur utile ecluse (m)", profile.ecluse_largeur_m) +
    "</div></div>";
}

function withCommuneSection(sheetBodyEl, cacheKey, lon, lat, geometry, staticHtml, includeRouteProfile) {
  const hasResolver = !!(window.CommuneResolver);
  function renderFull(list, pending) {
    return staticHtml + communeSectionHtml(list, pending) + (includeRouteProfile ? routeProfileSectionHtml(list) : "");
  }
  if (!hasResolver) {
    sheetBodyEl.innerHTML = renderFull(null, false);
    sheetBodyEl._currentCacheKey = cacheKey;
    return;
  }
  const alreadyReady = window.CommuneResolver.isReady();
  const immediate = alreadyReady ? window.CommuneResolver.resolveForFeature(cacheKey, lon, lat, geometry) : null;
  sheetBodyEl.innerHTML = renderFull(immediate, !alreadyReady);
  sheetBodyEl._currentCacheKey = cacheKey;
  if (!alreadyReady) {
    window.CommuneResolver.ready().then(function () {
      if (sheetBodyEl._currentCacheKey !== cacheKey) return;
      const list = window.CommuneResolver.resolveForFeature(cacheKey, lon, lat, geometry);
      sheetBodyEl.innerHTML = renderFull(list, false);
      if (includeRouteProfile && window.VNFDataset && !window.VNFDataset.isReady()) {
        window.VNFDataset.ready().then(function () {
          if (sheetBodyEl._currentCacheKey !== cacheKey) return;
          sheetBodyEl.innerHTML = renderFull(list, false);
        }).catch(function () {});
      }
    }).catch(function () {
      if (sheetBodyEl._currentCacheKey !== cacheKey) return;
      sheetBodyEl.innerHTML = renderFull(null, false);
    });
  } else if (includeRouteProfile && window.VNFDataset && !window.VNFDataset.isReady()) {
    window.VNFDataset.ready().then(function () {
      if (sheetBodyEl._currentCacheKey !== cacheKey) return;
      sheetBodyEl.innerHTML = renderFull(immediate, false);
    }).catch(function () {});
  }
}

function enhanceTooltipWithCommune(marker, cacheKey, lon, lat, baseLabel) {
  if (!window.CommuneResolver) return;
  function applyLabel(list) {
    const communeName = (list && list[0] && list[0].name) ? list[0].name : null;
    if (!communeName) return;
    const tt = marker.getTooltip ? marker.getTooltip() : null;
    if (tt) tt.setContent(baseLabel + " \u2014 " + communeName);
  }
  if (window.CommuneResolver.isReady()) {
    applyLabel(window.CommuneResolver.resolveForFeature(cacheKey, lon, lat, null));
  } else {
    window.CommuneResolver.ready().then(function () {
      applyLabel(window.CommuneResolver.resolveForFeature(cacheKey, lon, lat, null));
    }).catch(function () {});
  }
}

const diagLog = [];
function diag(label, ok, detail) { diagLog.push({ label: label, ok: ok, detail: detail }); }
function renderDiagBanner() {
  const anyFail = diagLog.some(function (d) { return !d.ok; });
  if (!anyFail) return;
  const el = document.createElement("div");
  el.id = "diagBanner";
  el.style.cssText = "position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px)+64px);z-index:5000;" +
    "background:#fff3cd;border:1px solid #e0b400;border-radius:12px;padding:10px 12px;font-size:12.5px;" +
    "color:#5a4a10;max-height:40vh;overflow-y:auto;box-shadow:0 6px 18px rgba(0,0,0,.3);";
  const lines = diagLog.map(function (d) {
    const mark = d.ok ? "OK" : "X";
    const detail = d.detail ? (" - " + escapeHtml(d.detail)) : "";
    return mark + " " + escapeHtml(d.label) + detail;
  }).join("<br>");
  el.innerHTML = "<b>Diagnostic</b><br>" + lines +
    "<br><button id=\"diagClose\" style=\"margin-top:8px;padding:6px 12px;border:none;border-radius:8px;background:#e0b400;color:#3a2f05;font-weight:700;\">Fermer</button>";
  document.body.appendChild(el);
  const btn = document.getElementById("diagClose");
  if (btn) btn.addEventListener("click", function () { el.remove(); });
}
function autoDetectFeatureCollection(expectedNames, matchFn) {
  for (let i = 0; i < expectedNames.length; i++) {
    try {
      const v = window[expectedNames[i]];
      if (v && v.type === "FeatureCollection" && Array.isArray(v.features)) return { fc: v, foundAs: expectedNames[i] };
    } catch (e) {}
  }
  const keys = Object.keys(window);
  for (let i = 0; i < keys.length; i++) {
    try {
      const v = window[keys[i]];
      if (v && typeof v === "object" && v.type === "FeatureCollection" && Array.isArray(v.features) && v.features.length) {
        if (!matchFn || matchFn(v)) return { fc: v, foundAs: keys[i] };
      }
    } catch (e) {}
  }
  return { fc: null, foundAs: null };
}

function safeSetup(label, fn) {
  try {
    fn();
    diag(label, true, "OK");
  } catch (e) {
    diag(label, false, "Exception JS : " + (e && e.message ? e.message : String(e)));
    console.error(label, e);
  }
}

let map;
try {
  map = L.map("map", { zoomControl: false, attributionControl: true, minZoom: 8, maxZoom: 19, worldCopyJump: false, tap: true });
  map.setView([48.66, 6.35], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors — Donnees voies navigables : VNF / OSM / IGN BD TOPO / Sandre BD Topage / Etalab (contours communaux)"
  }).addTo(map);
  if (window.CommuneResolver) { window.CommuneResolver.ready().catch(function () {}); }
  if (window.VNFDataset) { window.VNFDataset.ready().catch(function () {}); }
} catch (fatalMapError) {
  console.error("Erreur fatale a l'initialisation de la carte:", fatalMapError);
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:#7a1010;color:#fff;padding:20px;font-family:monospace;font-size:13px;overflow:auto;white-space:pre-wrap;";
  overlay.textContent = "ERREUR FATALE (carte) :\n\n" + (fatalMapError && fatalMapError.message ? fatalMapError.message : String(fatalMapError));
  document.body.appendChild(overlay);
  return;
}

const KEYS = {
  cemt: ["CEMT", "cemt"], disusedCemt: ["disused_CEMT", "disusedCEMT"], waterway: ["waterway"],
  lock: ["lock"], lockName: ["lock_name", "lockname"], lockRef: ["lock_ref", "lockref"], lockHeight: ["lock_height", "lockheight"],
  name: ["name"], nameFr: ["name_fr", "namefr"], bridge: ["bridge"], tunnel: ["tunnel"],
  weirMovable: ["weir_movable", "weirmovable"],
  seamarkType: ["seamark_type", "seamark:type", "seamarktype"],
  seamarkHarbourCat: ["seamark_harbour_category", "seamark:harbour:category", "seamarkharbourcategory"],
  seamarkBridgeClearance: ["seamark_bridge_clearance_height", "seamark:bridge:clearance_height", "seamarkbridgeclearanceheight"],
  seamarkBridgeClearanceSafe: ["seamark_bridge_clearance_height_safe", "seamarkbridgeclearanceheightsafe"],
  seamarkName: ["seamark_name", "seamark:name", "seamarkname"],
  maxdraft: ["maxdraft", "max_draft"], maxheight: ["maxheight", "max_height"], maxwidth: ["maxwidth", "max_width"], maxlength: ["maxlength", "max_length"],
  width: ["width"], height: ["height"], operator: ["operator"], note: ["note"], description: ["description"],
  addrCity: ["addr_city", "addrcity"], automated: ["automated"], mooring: ["mooring"], harbour: ["harbour"],
  manmade: ["man_made", "manmade"], railway: ["railway"], vhf: ["vhf", "contact_vhf"], openingHours: ["opening_hours", "openinghours"],
  natural: ["natural"], landuse: ["landuse"]
};
const VKEYS = {
  cdSeg: ["CdSegDPF"], etat: ["Etat"], largeur: ["Largeur"], nature: ["Nature"],
  navigabilite: ["Navigabilite", "Navigabili"], gabarit: ["Gabarit"], voie: ["Voie"], section: ["Section"],
  statutDom: ["Statutdom", "StatutdomDPF"], autorite: ["Autorite", "Autorit"], exploitant: ["Exploitant"],
  fpkh: ["FPKH"], tpkh: ["TPKH"], longueur: ["longueur"]
};
function pkFromHecto(v) { const n = toNumber(v); return n === null ? null : +(n / 1000).toFixed(2); }

const CEMT_STYLE = {
  "V":  { color: "#e67e22", weight: 6, dash: null, label: "Classe V - Grand gabarit (Moselle canalisee)" },
  "5":  { color: "#e67e22", weight: 6, dash: null, label: "Classe V - Grand gabarit (Moselle canalisee)" },
  "IV": { color: "#e08214", weight: 5, dash: null, label: "Classe IV" },
  "III":{ color: "#e08214", weight: 5, dash: null, label: "Classe III" },
  "II": { color: "#f0a93a", weight: 4.5, dash: null, label: "Classe II" },
  "I":  { color: "#f7ca18", weight: 4, dash: null, label: "Classe I - Freycinet (CMR Est / Embr. de Nancy)" },
  "1":  { color: "#f7ca18", weight: 4, dash: null, label: "Classe I - Freycinet (CMR Est / Embr. de Nancy)" },
  "0":  { color: "#f7ca18", weight: 3, dash: null, label: "Classe 0 - Petit gabarit" }
};
const NONNAV_STYLE = { color: "#5bc0de", weight: 2.4, dash: "6 6", label: "Rigole d'alimentation / voie non navigable" };
const DEFAULT_WATER_STYLE = { color: "#7fb3c9", weight: 2, dash: "3 5", label: "Voie d'eau (gabarit non renseigne)" };
const DPF_MANAGED_STYLE = { color: "#2ca02c", weight: 1.6, dash: null, label: "Domaine gere VNF (DPF confie)" };
const DPF_UNMANAGED_STYLE = { color: "#7f7f7f", weight: 1.4, dash: "2 4", label: "Hors gestion / statut non confie" };

function styleForWaterway(props) {
  const cemt = getTag(props, KEYS.cemt);
  const disusedCemt = getTag(props, KEYS.disusedCemt);
  const wway = (getTag(props, KEYS.waterway) || "").toString().toLowerCase();
  if (cemt && CEMT_STYLE[String(cemt).toUpperCase()]) return CEMT_STYLE[String(cemt).toUpperCase()];
  if (wway === "canal" || wway === "river") return disusedCemt ? NONNAV_STYLE : DEFAULT_WATER_STYLE;
  if (["ditch", "drain", "stream"].indexOf(wway) !== -1) return NONNAV_STYLE;
  return DEFAULT_WATER_STYLE;
}
function styleForVnfSegment(props) {
  const statutDom = (getTag(props, VKEYS.statutDom) || "").toString().toLowerCase();
  const autorite = (getTag(props, VKEYS.autorite) || "").toString().toLowerCase();
  const isManaged = statutDom.indexOf("confi") !== -1 || autorite.indexOf("vnf") !== -1;
  return isManaged ? DPF_MANAGED_STYLE : DPF_UNMANAGED_STYLE;
}
function baseWaterwayStyleForVnf(props) {
  const gabarit = getTag(props, VKEYS.gabarit);
  const navig = (getTag(props, VKEYS.navigabilite) || "").toString().toLowerCase();
  const voie = (getTag(props, VKEYS.voie) || "").toString().toLowerCase();
  if (voie.indexOf("moselle") !== -1) return CEMT_STYLE["V"];
  if (voie.indexOf("marne au rhin") !== -1 || voie.indexOf("embranchement") !== -1) return CEMT_STYLE["I"];
  if (navig.indexOf("non navigable") !== -1 || navig.indexOf("en attente") !== -1) return NONNAV_STYLE;
  if (gabarit && CEMT_STYLE[String(gabarit).toUpperCase()]) return CEMT_STYLE[String(gabarit).toUpperCase()];
  return DEFAULT_WATER_STYLE;
}
function categorizePoint(props) {
  const lock = (getTag(props, KEYS.lock) || "").toString().toLowerCase();
  const wway = (getTag(props, KEYS.waterway) || "").toString().toLowerCase();
  const seaType = (getTag(props, KEYS.seamarkType) || "").toString().toLowerCase();
  const bridge = (getTag(props, KEYS.bridge) || "").toString().toLowerCase();
  const tunnel = (getTag(props, KEYS.tunnel) || "").toString().toLowerCase();
  const harbour = (getTag(props, KEYS.harbour) || "").toString().toLowerCase();
  const mooring = (getTag(props, KEYS.mooring) || "").toString().toLowerCase();
  const manmade = (getTag(props, KEYS.manmade) || "").toString().toLowerCase();
  const railway = (getTag(props, KEYS.railway) || "").toString().toLowerCase();
  const seaHarbourCat = (getTag(props, KEYS.seamarkHarbourCat) || "").toString().toLowerCase();
  if (lock === "yes" || wway === "lock_gate" || seaType === "gate") return "ecluse";
  if (wway === "weir" || manmade === "weir") return "barrage";
  if (wway === "dam") return "barrage";
  if (bridge === "yes" || seaType === "bridge") return "pont";
  if (tunnel === "yes" || tunnel === "canal" || wway === "tunnel") return "souterrain";
  if (manmade === "pumping_station" || manmade === "monitoring_station") return "pci";
  if (seaHarbourCat === "marina" || harbour === "yes" || wway === "dock") return (seaHarbourCat === "marina" || mooring === "yes") ? "port_plaisance" : "quai_commerce";
  if (mooring === "yes") return "halte";
  if (railway) return "acces_ferroviaire";
  if (wway === "turning_point" || manmade === "basin") return "bassin_virement";
  if (wway === "milestone") return "pk_borne";
  return "autre";
}
function isReservoirPolygon(props) {
  const nat = (getTag(props, KEYS.natural) || "").toString().toLowerCase();
  const landuse = (getTag(props, KEYS.landuse) || "").toString().toLowerCase();
  const wway = (getTag(props, KEYS.waterway) || "").toString().toLowerCase();
  return nat === "water" || landuse === "reservoir" || wway === "riverbank";
}

function wrapIcon(inner, haloSize) {
  const s = haloSize || 44;
  return "<div style=\"width:" + s + "px;height:" + s + "px;display:flex;align-items:center;justify-content:center;\">" + inner + "</div>";
}
function iconLockSquare(c){return wrapIcon("<svg width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><rect x=\"2\" y=\"2\" width=\"28\" height=\"28\" rx=\"5\" fill=\"" + c + "\" stroke=\"#3a2f05\" stroke-width=\"2.5\"/></svg>");}
function iconWeir(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M6 20 L11 12 L15 20 L20 12 L24 20\" stroke=\"#fff\" stroke-width=\"2.5\" fill=\"none\"/></svg>");}
function iconBridge(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M4 19 Q15 7 26 19\" stroke=\"#fff\" stroke-width=\"2.5\" fill=\"none\"/><line x1=\"4\" y1=\"19\" x2=\"26\" y2=\"19\" stroke=\"#fff\" stroke-width=\"2.5\"/></svg>");}
function iconTunnelHatched(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M6 22 V14 A9 9 0 0 1 24 14 V22\" stroke=\"#fff\" stroke-width=\"2.5\" fill=\"none\"/></svg>");}
function iconQuay(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><rect x=\"6\" y=\"8\" width=\"18\" height=\"7\" fill=\"#fff\"/><line x1=\"9\" y1=\"15\" x2=\"9\" y2=\"23\" stroke=\"#fff\" stroke-width=\"2.5\"/><line x1=\"21\" y1=\"15\" x2=\"21\" y2=\"23\" stroke=\"#fff\" stroke-width=\"2.5\"/></svg>");}
function iconMarina(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M7 20 L15 7 L23 20 Z\" fill=\"#fff\"/><line x1=\"5\" y1=\"22\" x2=\"25\" y2=\"22\" stroke=\"#fff\" stroke-width=\"2.5\"/></svg>");}
function iconRail(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><line x1=\"5\" y1=\"10\" x2=\"25\" y2=\"10\" stroke=\"#fff\" stroke-width=\"2.5\"/><line x1=\"5\" y1=\"20\" x2=\"25\" y2=\"20\" stroke=\"#fff\" stroke-width=\"2.5\"/><line x1=\"9\" y1=\"8\" x2=\"9\" y2=\"22\" stroke=\"#fff\" stroke-width=\"2\"/><line x1=\"15\" y1=\"8\" x2=\"15\" y2=\"22\" stroke=\"#fff\" stroke-width=\"2\"/><line x1=\"21\" y1=\"8\" x2=\"21\" y2=\"22\" stroke=\"#fff\" stroke-width=\"2\"/></svg>");}
function iconBasin(c){return wrapIcon("<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"1\" y=\"1\" width=\"28\" height=\"28\" rx=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/><circle cx=\"15\" cy=\"15\" r=\"9\" stroke=\"#fff\" stroke-width=\"2.5\" fill=\"none\"/></svg>");}
function iconPk(c){return wrapIcon("<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"11\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/></svg>", 30);}
function iconGeneric(c){return wrapIcon("<svg width=\"26\" height=\"26\" viewBox=\"0 0 26 26\"><circle cx=\"13\" cy=\"13\" r=\"11\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/></svg>");}
function iconPCI(c){return wrapIcon("<svg width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><polygon points=\"16,2 29,11 24,29 8,29 3,11\" fill=\"" + c + "\" stroke=\"#111\" stroke-width=\"2.5\"/></svg>");}
function svgBoat(c){return "<svg width=\"28\" height=\"28\" viewBox=\"0 0 28 28\"><circle cx=\"14\" cy=\"14\" r=\"13\" fill=\"" + c + "\" opacity=\"0.18\"/><circle cx=\"14\" cy=\"14\" r=\"6\" fill=\"" + c + "\" stroke=\"#fff\" stroke-width=\"2\"/></svg>";}

const CATS = {
  ecluse:            { label: "Ecluse",                 color: "#e67e22", svg: iconLockSquare,   z: 6, halo: 44 },
  barrage:           { label: "Barrage / vanne",         color: "#c0392b", svg: iconWeir,         z: 4, halo: 44 },
  pont:              { label: "Pont",                    color: "#7f8c8d", svg: iconBridge,       z: 3, halo: 44 },
  souterrain:        { label: "Souterrain / voute",       color: "#2c3e50", svg: iconTunnelHatched,z: 3, halo: 44 },
  quai_commerce:     { label: "Quai / port de commerce",  color: "#8e44ad", svg: iconQuay,         z: 4, halo: 44 },
  port_plaisance:    { label: "Port de plaisance",        color: "#1e88e5", svg: iconMarina,       z: 4, halo: 44 },
  halte:             { label: "Halte de plaisance",       color: "#3fa7d6", svg: iconMarina,       z: 3, halo: 44 },
  acces_ferroviaire: { label: "Acces ferroviaire",        color: "#2c3e50", svg: iconRail,         z: 3, halo: 44 },
  bassin_virement:   { label: "Bassin de virement",       color: "#16a085", svg: iconBasin,        z: 3, halo: 44 },
  pk_borne:          { label: "Point kilometrique",       color: "#34495e", svg: iconPk,           z: 2, halo: 34 },
  pci:               { label: "PCI - Poste de commande d'itineraire", color: "#6c3fc5", svg: iconPCI, z: 7, halo: 44 },
  autre:             { label: "Ouvrage / point d'interet",color: "#7f8c8d", svg: iconGeneric,      z: 1, halo: 38 }
};

const layers = {
  waterwaysNav: L.layerGroup(), waterwaysNonNav: L.layerGroup(),
  dpfManaged: L.layerGroup(),
  vnfSegments: L.layerGroup(),
  locks: L.layerGroup(), structures: L.layerGroup(), harbours: L.layerGroup(),
  pkMarkers: L.layerGroup(), reservoirs: L.layerGroup(), pci: L.layerGroup(), admin: L.layerGroup()
};
const searchIndex = [];
const pkIndex = [];
function addSearchEntry(label, type, latlng, sub, ref) {
  if (!label || !latlng) return;
  searchIndex.push({ label: label, norm: norm(label), type: type, latlng: latlng, sub: sub || "", ref: ref || null });
}

function loadWaterways(fc) {
  if (!fc || !fc.features) return 0;
  let count = 0;
  fc.features.forEach(function (f) {
    const props = f.properties || {};
    const geom = f.geometry;
    if (geom && (geom.type === "Polygon" || geom.type === "MultiPolygon") && isReservoirPolygon(props)) {
      loadReservoirPolygon(f, props);
      return;
    }
    if (!geom || geom.type !== "LineString") return;
    const st = styleForWaterway(props);
    const isNav = st !== NONNAV_STYLE;
    const latlngs = geom.coordinates.map(function (c) { return [c[1], c[0]]; });
    const line = L.polyline(latlngs, { color: st.color, weight: st.weight, opacity: 0.95, dashArray: st.dash || null, lineCap: "round", lineJoin: "round" });
    line._vnfMeta = { kind: "waterway", props: props, styleLabel: st.label, geometry: geom };
    line.on("click", function () { openWaterwaySheet(props, st, geom); });
    (isNav ? layers.waterwaysNav : layers.waterwaysNonNav).addLayer(line);
    count++;
    const name = getTag(props, KEYS.name) || getTag(props, KEYS.nameFr);
    if (name) addSearchEntry(name, "bief", latlngs[Math.floor(latlngs.length / 2)], st.label);
  });
  return count;
}
function loadReservoirPolygon(f, props) {
  const geom = f.geometry;
  const rings = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  rings.forEach(function (poly) {
    const latlngs = poly.map(function (ring) { return ring.map(function (c) { return [c[1], c[0]]; }); });
    const polygon = L.polygon(latlngs, { color: "#1b4f72", weight: 1.1, fillColor: "#2980b9", fillOpacity: 0.85 });
    polygon._vnfMeta = { kind: "reservoir", props: props, geometry: geom };
    const name = getTag(props, KEYS.name) || getTag(props, KEYS.nameFr);
    polygon.on("click", function () { openReservoirSheet(props, name, geom); });
    if (name) {
      polygon.bindTooltip(name, { permanent: false, className: "reservoir-label" });
      addSearchEntry(name, "reservoir", latlngs[0][0], "Reservoir / etang");
    }
    layers.reservoirs.addLayer(polygon);
  });
}
function loadPoints(fc) {
  if (!fc || !fc.features) return 0;
  let count = 0;
  fc.features.forEach(function (f, idx) {
    const props = f.properties || {};
    const geom = f.geometry;
    if (!geom || geom.type !== "Point") return;
    const latlng = [geom.coordinates[1], geom.coordinates[0]];
    const cat = categorizePoint(props);
    const catDef = CATS[cat];
    const haloSize = catDef.halo || 40;
    const cacheKey = "pt_" + cat + "_" + idx;
    const marker = L.marker(latlng, {
      icon: L.divIcon({ className: "vnf-icon", html: catDef.svg(catDef.color), iconSize: [haloSize, haloSize], iconAnchor: [haloSize / 2, haloSize / 2] }),
      zIndexOffset: catDef.z * 100
    });
    marker._vnfMeta = { kind: "point", cat: cat, props: props, cacheKey: cacheKey, lon: geom.coordinates[0], lat: geom.coordinates[1] };
    marker.on("click", function () { openPointSheet(props, cat, cacheKey, geom.coordinates[0], geom.coordinates[1]); });

    const lockRef = getTag(props, KEYS.lockRef);
    const name = getTag(props, KEYS.name) || getTag(props, KEYS.lockName);
    const addrCity = getTag(props, KEYS.addrCity);
    if (cat === "ecluse" || cat === "pci") {
      const baseLabel = (name || catDef.label) + (addrCity ? " (" + addrCity + ")" : "");
      marker.bindTooltip(baseLabel, { permanent: true, direction: "right", offset: [haloSize / 2, 0], className: "ouvrage-label", opacity: 1 });
      marker._labelFineOnly = true;
      if (!addrCity) enhanceTooltipWithCommune(marker, cacheKey, geom.coordinates[0], geom.coordinates[1], (name || catDef.label));
    }

    if (cat === "ecluse") layers.locks.addLayer(marker);
    else if (cat === "pci") layers.pci.addLayer(marker);
    else if (["pont", "souterrain", "barrage"].indexOf(cat) !== -1) layers.structures.addLayer(marker);
    else if (["quai_commerce", "port_plaisance", "halte", "acces_ferroviaire", "bassin_virement"].indexOf(cat) !== -1) layers.harbours.addLayer(marker);
    else layers.structures.addLayer(marker);
    count++;

    const seamarkName = getTag(props, KEYS.seamarkName);
    const label = name || seamarkName;
    if (label) {
      const subBits = [];
      if (lockRef) subBits.push("Ecluse n." + lockRef);
      subBits.push(catDef.label);
      addSearchEntry(label, cat, latlng, subBits.join(" - "), lockRef);
    } else if (lockRef) addSearchEntry("Ecluse " + lockRef, cat, latlng, catDef.label, lockRef);
  });
  return count;
}
function loadVnfSegmentation(fc) {
  if (!fc || !fc.features) return 0;
  let count = 0;
  fc.features.forEach(function (f, idx) {
    const props = f.properties || {};
    const geom = f.geometry;
    if (!geom) return;
    const st = baseWaterwayStyleForVnf(props);
    const dpfSt = styleForVnfSegment(props);
    let latlngsSets = [];
    if (geom.type === "MultiLineString") latlngsSets = geom.coordinates.map(function (line) { return line.map(function (c) { return [c[1], c[0]]; }); });
    else if (geom.type === "LineString") latlngsSets = [geom.coordinates.map(function (c) { return [c[1], c[0]]; })];
    else return;

    const cacheKey = "seg_" + idx;
    const poly = L.polyline(latlngsSets, { color: st.color, weight: st.weight, opacity: 0.001, dashArray: st.dash || null });
    poly._vnfMeta = { kind: "vnfseg", props: props, geometry: geom, cacheKey: cacheKey };
    poly.on("click", function () { openVnfSegmentSheet(props, cacheKey, geom); });
    layers.vnfSegments.addLayer(poly);

    latlngsSets.forEach(function (set) {
      if (set.length < 2) return;
      const offset = offsetLatLngs(map, set, 6);
      const dpfLine = L.polyline(offset, { color: dpfSt.color, weight: dpfSt.weight, dashArray: dpfSt.dash, opacity: 0.85 });
      dpfLine._vnfMeta = { kind: "dpfline", props: props, geometry: geom, cacheKey: cacheKey };
      dpfLine.on("click", function () { openVnfSegmentSheet(props, cacheKey, geom); });
      layers.dpfManaged.addLayer(dpfLine);
    });

    count++;
    const voie = getTag(props, VKEYS.voie);
    const fpkh = pkFromHecto(getTag(props, VKEYS.fpkh));
    const tpkh = pkFromHecto(getTag(props, VKEYS.tpkh));
    const first = latlngsSets[0] && latlngsSets[0][0];
    if (voie && fpkh !== null && first) {
      addSearchEntry(voie + " - PK " + fpkh, "pk", first, "Referentiel VNF", fpkh);
      const marker = L.marker(first, { icon: L.divIcon({ className: "vnf-icon", html: iconPk("#34495e"), iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 50 });
      marker._vnfMeta = { kind: "pkpoint", props: props, pk: fpkh, geometry: geom, cacheKey: cacheKey };
      marker.bindTooltip("PK " + fpkh, { permanent: false, className: "pk-label" });
      marker.on("click", function () { openVnfSegmentSheet(props, cacheKey, geom); });
      layers.pkMarkers.addLayer(marker);
      pkIndex.push({ pk: fpkh, latlng: first, voie: voie });
      if (tpkh !== null) pkIndex.push({ pk: tpkh, latlng: latlngsSets[latlngsSets.length - 1].slice(-1)[0], voie: voie });
    }
  });
  return count;
}

const det2 = autoDetectFeatureCollection(["jsonexport2", "jsonExport2", "json_export2"], function (fc) {
  const p = fc.features[0] && fc.features[0].properties;
  return p && (("waterway" in p) || ("CEMT" in p)) && !("CdSegDPF" in p);
});
const det3 = autoDetectFeatureCollection(["jsonexport3", "jsonExport3", "json_export3"], function (fc) {
  const p = fc.features[0] && fc.features[0].properties;
  return p && (("lock" in p) || ("waterway" in p) || ("seamark_type" in p) || ("seamark:type" in p)) && fc.features[0].geometry && fc.features[0].geometry.type === "Point";
});
const detSeg = autoDetectFeatureCollection(["jsonSegmentationMarneauRhinMoselle1", "jsonSegmentationMarneauRhinMoselle", "jsonsegmentationmarneaurhinmoselle1"], function (fc) {
  const p = fc.features[0] && fc.features[0].properties;
  return p && ("CdSegDPF" in p || "Voie" in p);
});

let n2 = 0, n3 = 0, nSeg = 0;
safeSetup("Chargement export_2.js", function () {
  n2 = loadWaterways(det2.fc);
  if (!det2.fc || n2 === 0) throw new Error(det2.fc ? "0 element charge" : "variable introuvable");
});
safeSetup("Chargement export_3.js", function () {
  n3 = loadPoints(det3.fc);
  if (!det3.fc || n3 === 0) throw new Error(det3.fc ? "0 element charge" : "variable introuvable");
});
safeSetup("Chargement segmentation VNF", function () {
  nSeg = loadVnfSegmentation(detSeg.fc);
  if (!detSeg.fc || nSeg === 0) throw new Error(detSeg.fc ? "0 element charge" : "variable introuvable");
});
safeSetup("Construction de l'index PK (projection GPS)", function () {
  if (!window.PKProjector) throw new Error("pkProjector.js non charge");
  const count = window.PKProjector.build(detSeg.fc, {
    fpkh: function (p) { return getTag(p, VKEYS.fpkh); },
    tpkh: function (p) { return getTag(p, VKEYS.tpkh); },
    voie: function (p) { return getTag(p, VKEYS.voie) || "Voie inconnue"; }
  });
  if (count === 0) throw new Error("Aucun segment PK indexe (donnees FPKH/TPKH absentes ?)");
});
safeSetup("Ajout des couches sur la carte", function () {
  Object.keys(layers).forEach(function (k) { layers[k].addTo(map); });
  const b = layers.waterwaysNav.getBounds();
  if (b.isValid()) map.fitBounds(b, { padding: [24, 24] });
});

function toggleLayerVisibility(layerGroup, show) {
  const has = map.hasLayer(layerGroup);
  if (show && !has) layerGroup.addTo(map);
  if (!show && has) map.removeLayer(layerGroup);
}
function applyLOD() {
  const z = map.getZoom();
  const fine = z >= 14;
  const veryFine = z >= 16;
  toggleLayerVisibility(layers.structures, fine);
  toggleLayerVisibility(layers.harbours, fine);
  toggleLayerVisibility(layers.pkMarkers, fine);
  toggleLayerVisibility(layers.dpfManaged, fine);
  toggleLayerVisibility(layers.waterwaysNonNav, z >= 12);
  toggleLayerVisibility(layers.reservoirs, z >= 11);
  toggleLayerVisibility(layers.pci, fine);
  toggleLayerVisibility(layers.admin, z >= 10 && z < 15);
  if (!map.hasLayer(layers.locks)) layers.locks.addTo(map);
  [layers.locks, layers.pci].forEach(function (lg) {
    lg.eachLayer(function (m) {
      if (m._labelFineOnly && m.getTooltip) {
        const tt = m.getTooltip();
        if (tt) tt.setOpacity(veryFine ? 1 : 0);
      }
    });
  });
  layers.pkMarkers.eachLayer(function (m) {
    if (m.getTooltip) { if (veryFine) { if (!m.isTooltipOpen()) m.openTooltip(); } else m.closeTooltip(); }
  });
}
safeSetup("Gestion du niveau de detail (LOD)", function () {
  map.on("zoomend", applyLOD);
  applyLOD();
});

function attrCard(label, value, full) {
  if (value === null || value === undefined || value === "") return "";
  return "<div class=\"attr-card" + (full ? " full" : "") + "\"><div class=\"lbl\">" + escapeHtml(label) + "</div><div class=\"val\">" + escapeHtml(value) + "</div></div>";
}
let sheet, sheetCategory, sheetTitle, sheetIconEl, sheetBody;
function openSheet() { sheet.classList.remove("peek"); sheet.classList.add("open"); }
function closeSheet() { sheet.classList.remove("open"); sheet.classList.remove("peek"); }
function openWaterwaySheet(props, st, geometry, cacheKey) {
  const name = getTag(props, KEYS.name) || getTag(props, KEYS.nameFr) || "Voie d'eau";
  sheetCategory.textContent = "Bief / voie navigable";
  sheetTitle.textContent = name;
  sheetIconEl.style.background = st.color;
  sheetIconEl.innerHTML = svgBoat("#fff");
  const cemt = getTag(props, KEYS.cemt) || getTag(props, KEYS.disusedCemt);
  const maxdraft = getTag(props, KEYS.maxdraft);
  const maxheight = getTag(props, KEYS.maxheight);
  const maxwidth = getTag(props, KEYS.maxwidth);
  const width = getTag(props, KEYS.width);
  let cemtOfficialHtml = "";
  if (window.VNFDataset && window.VNFDataset.isReady() && cemt) {
    const profile = window.VNFDataset.cemtProfile(cemt);
    if (profile) {
      cemtOfficialHtml = "<div class=\"sheet-section\"><h4>Profil CEMT officiel (VNF 2018)</h4><div class=\"attr-grid\">" +
        attrCard("Longueur max (m)", profile.longueur_m) +
        attrCard("Largeur max (m)", profile.largeur_m) +
        attrCard("Enfoncement (m)", profile.enfoncement_m) +
        attrCard("Tirant d'air max (m)", profile.tirant_air_m) +
        attrCard("Tonnage (t)", profile.tonnage_t) +
        "</div></div>";
    }
  }
  const note = getTag(props, KEYS.note) || getTag(props, KEYS.description);
  const staticHtml =
    "<div class=\"sheet-section\"><h4>Classification</h4><div class=\"tag-row\"><span class=\"tag-chip\" style=\"background:" + st.color + "22;color:" + st.color + "\">" + escapeHtml(st.label) + "</span></div></div>" +
    "<div class=\"sheet-section\"><h4>Caracteristiques de gabarit</h4><div class=\"attr-grid\">" +
    attrCard("Classe CEMT", cemt) + attrCard("Largeur (m)", width) + attrCard("Tirant d'eau max (m)", maxdraft) + attrCard("Tirant d'air max (m)", maxheight) + attrCard("Largeur navigable max (m)", maxwidth) +
    "</div></div>" +
    cemtOfficialHtml +
    (note ? ("<div class=\"sheet-section\"><h4>Notes</h4><div class=\"note-box\">" + escapeHtml(note) + "</div></div>") : "");
  withCommuneSection(sheetBody, cacheKey || null, null, null, geometry || null, staticHtml, true);
  openSheet();
}
function openReservoirSheet(props, name, geometry, cacheKey) {
  sheetCategory.textContent = "Reservoir / etang d'alimentation";
  sheetTitle.textContent = name || "Reservoir";
  sheetIconEl.style.background = "#2980b9";
  sheetIconEl.innerHTML = iconGeneric("#fff");
  const note = getTag(props, KEYS.note) || getTag(props, KEYS.description);
  const staticHtml = "<div class=\"sheet-section\"><h4>Attributs</h4><div class=\"note-box\">Ouvrage soumis a la reglementation Securite des Ouvrages Hydrauliques (SOH). " + (note ? escapeHtml(note) : "Aucune note complementaire disponible dans les donnees actuelles.") + "</div></div>";
  withCommuneSection(sheetBody, cacheKey || null, null, null, geometry || null, staticHtml, false);
  openSheet();
}
function openPointSheet(props, cat, cacheKey, lon, lat) {
  const catDef = CATS[cat];
  const name = getTag(props, KEYS.name) || getTag(props, KEYS.lockName) || getTag(props, KEYS.seamarkName) || catDef.label;
  sheetCategory.textContent = catDef.label;
  sheetTitle.textContent = name;
  sheetIconEl.style.background = catDef.color;
  sheetIconEl.innerHTML = catDef.svg("#fff");
  const lockRef = getTag(props, KEYS.lockRef);
  const lockHeight = getTag(props, KEYS.lockHeight);
  const maxlength = getTag(props, KEYS.maxlength);
  const maxwidth = getTag(props, KEYS.maxwidth);
  const automated = getTag(props, KEYS.automated);
  const operatorTag = getTag(props, KEYS.operator);
  const openingHours = getTag(props, KEYS.openingHours);
  const vhf = getTag(props, KEYS.vhf);
  const clearance = getTag(props, KEYS.seamarkBridgeClearance) || getTag(props, KEYS.seamarkBridgeClearanceSafe);
  const note = getTag(props, KEYS.note) || getTag(props, KEYS.description);
  const addrCity = getTag(props, KEYS.addrCity);
  let bodyHtml = "";
  if (cat === "ecluse") {
    bodyHtml += "<div class=\"sheet-section\"><h4>Identification</h4><div class=\"attr-grid\">" +
      attrCard("Numero d'ecluse", lockRef) + attrCard("Chute d'eau (m)", lockHeight) + attrCard("Dimensions utiles du sas", (maxlength && maxwidth) ? (maxlength + " x " + maxwidth + " m") : null) +
      "</div></div><div class=\"sheet-section\"><h4>Exploitation</h4><div class=\"attr-grid\">" +
      attrCard("Automatisme", automated) + attrCard("Gestionnaire", operatorTag) + attrCard("Horaires", openingHours) + attrCard("Canal VHF", vhf) +
      "</div></div>";
  } else if (cat === "pci") {
    bodyHtml += "<div class=\"sheet-section\"><h4>Poste de commande d'itineraire</h4><div class=\"attr-grid\">" + attrCard("Gestionnaire", operatorTag) + "</div></div>";
  } else if (cat === "pont" || cat === "souterrain") {
    bodyHtml += "<div class=\"sheet-section\"><h4>Franchissement</h4><div class=\"attr-grid\">" + attrCard("Hauteur libre (m)", clearance) + "</div></div>";
  } else {
    bodyHtml += "<div class=\"sheet-section\"><h4>Informations</h4><div class=\"attr-grid\">" + attrCard("Gestionnaire", operatorTag) + attrCard("Horaires", openingHours) + "</div></div>";
  }
  if (window.VNFDataset && window.VNFDataset.isReady() && (cat === "quai_commerce" || cat === "port_plaisance")) {
    const portInfo = window.VNFDataset.portInfoForName(name);
    if (portInfo) {
      bodyHtml += "<div class=\"sheet-section\"><h4>Port officiel VNF</h4><div class=\"attr-grid\">" +
        attrCard("Gestionnaire", portInfo.operator) +
        attrCard("Adresse", portInfo.address, true) +
        attrCard("Telephone", portInfo.phone) +
        attrCard("Email", portInfo.email) +
        "</div></div>";
    }
  }
  if (note) bodyHtml += "<div class=\"sheet-section\"><h4>Notes d'exploitation</h4><div class=\"note-box\">" + escapeHtml(note) + "</div></div>";
  if (addrCity) {
    bodyHtml += "<div class=\"sheet-section\"><h4>Localisation</h4><div class=\"attr-grid\">" + attrCard("Commune", addrCity, true) + "</div></div>";
    sheetBody.innerHTML = bodyHtml;
    sheetBody._currentCacheKey = cacheKey || null;
  } else {
    withCommuneSection(sheetBody, cacheKey || null, lon, lat, null, bodyHtml, false);
  }
  openSheet();
}
function openVnfSegmentSheet(props, cacheKey, geometry) {
  const voie = getTag(props, VKEYS.voie) || "Segment DPF";
  const fpkh = pkFromHecto(getTag(props, VKEYS.fpkh));
  const tpkh = pkFromHecto(getTag(props, VKEYS.tpkh));
  const nature = getTag(props, VKEYS.nature);
  const navigabilite = getTag(props, VKEYS.navigabilite);
  const gabarit = getTag(props, VKEYS.gabarit);
  const largeur = getTag(props, VKEYS.largeur);
  const autorite = getTag(props, VKEYS.autorite);
  const exploitant = getTag(props, VKEYS.exploitant);
  const longueur = getTag(props, VKEYS.longueur);
  const statutDom = getTag(props, VKEYS.statutDom);
  sheetCategory.textContent = "Referentiel officiel VNF (DPF)";
  sheetTitle.textContent = voie + (fpkh !== null ? (" - PK " + fpkh) : "");
  sheetIconEl.style.background = "#34495e";
  sheetIconEl.innerHTML = iconPk("#fff");
  const staticHtml =
    "<div class=\"sheet-section\"><h4>Positionnement</h4><div class=\"attr-grid\">" + attrCard("PK debut", fpkh) + attrCard("PK fin", tpkh) + attrCard("Longueur (km)", longueur) + attrCard("Nature", nature) + "</div></div>" +
    "<div class=\"sheet-section\"><h4>Navigation</h4><div class=\"attr-grid\">" + attrCard("Navigabilite", navigabilite) + attrCard("Gabarit", gabarit) + attrCard("Largeur", largeur) + "</div></div>" +
    "<div class=\"sheet-section\"><h4>Domanialite</h4><div class=\"attr-grid\">" + attrCard("Statut domanial", statutDom) + attrCard("Autorite", autorite) + attrCard("Exploitant", exploitant) + "</div></div>";
  withCommuneSection(sheetBody, cacheKey || null, null, null, geometry || null, staticHtml, true);
  openSheet();
}
safeSetup("Initialisation bottom sheet", function () {
  sheet = document.getElementById("bottomSheet");
  sheetCategory = document.getElementById("sheetCategory");
  sheetTitle = document.getElementById("sheetTitle");
  sheetIconEl = document.getElementById("sheetIcon");
  sheetBody = document.getElementById("sheetBody");
  if (!sheet || !sheetCategory || !sheetTitle || !sheetIconEl || !sheetBody) throw new Error("elements DOM bottom sheet manquants");
  document.getElementById("sheetClose").addEventListener("click", closeSheet);

  const zone = document.getElementById("sheetHandleZone");
  let startY = 0, startTransform = 0, dragging = false;
  function getTranslateY() {
    const t = getComputedStyle(sheet).transform;
    if (t === "none") return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    return m ? parseFloat(m[1].split(",")[5]) : 0;
  }
  function onStart(y) { dragging = true; startY = y; startTransform = getTranslateY(); sheet.style.transition = "none"; }
  function onMove(y) {
    if (!dragging) return;
    const delta = y - startY;
    const next = Math.max(0, startTransform + delta);
    sheet.style.transform = "translateY(" + next + "px)";
  }
  function onEnd(y) {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "";
    const delta = y - startY;
    sheet.style.transform = "";
    if (delta > 120) closeSheet(); else openSheet();
  }
  zone.addEventListener("touchstart", function (e) { onStart(e.touches[0].clientY); }, { passive: true });
  zone.addEventListener("touchmove", function (e) { onMove(e.touches[0].clientY); }, { passive: true });
  zone.addEventListener("touchend", function (e) { onEnd(e.changedTouches[0].clientY); });
  zone.addEventListener("mousedown", function (e) {
    onStart(e.clientY);
    const mm = function (ev) { onMove(ev.clientY); };
    const mu = function (ev) { onEnd(ev.clientY); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  });
  sheet.classList.remove("open");
});

let searchInput, searchResults, searchClear;
function extractPkQuery(q) {
  const m = q.match(/pk\s*([0-9]+(?:[.,][0-9]+)?)/i) || q.match(/^([0-9]+(?:[.,][0-9]+)?)$/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}
function renderResults(results) {
  if (!results.length) {
    searchResults.innerHTML = "<div class=\"sr-item\"><div class=\"sr-text\"><div class=\"sr-title\">Aucun resultat</div><div class=\"sr-sub\">Essayez un PK, un nom d'ecluse ou une commune</div></div></div>";
    searchResults.classList.add("show");
    return;
  }
  searchResults.innerHTML = results.map(function (r, i) {
    const catDef = CATS[r.type] || { color: "#7f8c8d", label: r.type };
    const badge = r.type === "pk" ? "PK" : (r.label[0] || "-").toUpperCase();
    return "<div class=\"sr-item\" data-idx=\"" + i + "\"><div class=\"sr-badge\" style=\"background:" + (catDef.color || "#7f8c8d") + "\">" + badge + "</div><div class=\"sr-text\"><div class=\"sr-title\">" + escapeHtml(r.label) + "</div><div class=\"sr-sub\">" + escapeHtml(r.sub || "") + "</div></div></div>";
  }).join("");
  searchResults.classList.add("show");
  Array.prototype.slice.call(searchResults.children).forEach(function (el, i) {
    el.addEventListener("click", function () {
      const r = results[i];
      map.flyTo(r.latlng, Math.max(map.getZoom(), 16), { duration: 0.9 });
      searchResults.classList.remove("show");
      searchInput.value = r.label;
      searchClear.style.display = "flex";
      showToast(r.label);
    });
  });
}
function runSearch(qRaw) {
  const q = norm(qRaw);
  if (!q) { searchResults.classList.remove("show"); searchResults.innerHTML = ""; return; }
  const pkQuery = extractPkQuery(qRaw);
  let results = [];
  if (pkQuery !== null && pkIndex.length) {
    results = results.concat(pkIndex.map(function (p) { return Object.assign({}, p, { dist: Math.abs(p.pk - pkQuery) }); })
      .sort(function (a, b) { return a.dist - b.dist; }).slice(0, 6)
      .map(function (p) { return { label: (p.voie || "Voie") + " - PK " + p.pk.toFixed(2), sub: "Correspondance kilometrique", latlng: p.latlng, type: "pk" }; }));
  }
  results = results.concat(searchIndex.filter(function (e) { return e.norm.indexOf(q) !== -1; }).slice(0, 30)
    .map(function (e) { return { label: e.label, sub: e.sub, latlng: e.latlng, type: e.type }; }));
  const seen = {};
  results = results.filter(function (r) {
    const key = r.label + "|" + r.latlng.join(",");
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 25);
  renderResults(results);
}
safeSetup("Initialisation recherche", function () {
  searchInput = document.getElementById("searchInput");
  searchResults = document.getElementById("searchResults");
  searchClear = document.getElementById("searchClear");
  if (!searchInput || !searchResults || !searchClear) throw new Error("elements DOM recherche manquants");
  let searchDebounce;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchDebounce);
    searchClear.style.display = searchInput.value ? "flex" : "none";
    searchDebounce = setTimeout(function () { runSearch(searchInput.value); }, 120);
  });
  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    searchClear.style.display = "none";
    searchResults.classList.remove("show");
    searchInput.blur();
  });
  searchInput.addEventListener("focus", function () { if (searchInput.value) searchResults.classList.add("show"); });
  map.on("dragstart", function () { searchResults.classList.remove("show"); });
  map.on("click", function () { searchResults.classList.remove("show"); });
});

function buildNavSvg() {
  return "<img src=\"./icons/rectangle-navigation-bateau.svg\" alt=\"Rectangle de navigation\" style=\"max-width:100%;height:auto;display:block;margin:0 auto;\">";
}
safeSetup("Initialisation glossaire", function () {
  const navWrap = document.getElementById("navSvgWrap");
  if (!navWrap) throw new Error("navSvgWrap introuvable");
  navWrap.innerHTML = buildNavSvg();
  const glossModal = document.getElementById("glossModal");
  const glossBtn = document.getElementById("glossBtn");
  const glossClose = document.getElementById("glossClose");
  if (!glossModal || !glossBtn || !glossClose) throw new Error("elements DOM glossaire manquants");
  glossBtn.addEventListener("click", function () { glossModal.classList.add("show"); });
  glossClose.addEventListener("click", function () { glossModal.classList.remove("show"); });
  glossModal.addEventListener("click", function (e) { if (e.target === glossModal) glossModal.classList.remove("show"); });
});

const layerDefs = [
  { key: "waterwaysNav", label: "Biefs / voies navigables (CEMT)", color: "#e67e22" },
  { key: "waterwaysNonNav", label: "Rigoles / voies non navigables", color: "#5bc0de" },
  { key: "dpfManaged", label: "Ligne d'exploitation VNF (DPF confie)", color: "#2ca02c" },
  { key: "locks", label: "Ecluses", color: "#e67e22" },
  { key: "structures", label: "Ponts, souterrains, barrages", color: "#7f8c8d" },
  { key: "harbours", label: "Quais, ports, haltes, acces ferre", color: "#8e44ad" },
  { key: "reservoirs", label: "Reservoirs / etangs d'alimentation", color: "#2980b9" },
  { key: "pci", label: "PCI (Poste de commande d'itineraire)", color: "#6c3fc5" },
  { key: "pkMarkers", label: "Bornage PK (referentiel VNF)", color: "#34495e" }
];
safeSetup("Initialisation gestionnaire de couches", function () {
  const layerPanel = document.getElementById("layerPanel");
  const layersBtn = document.getElementById("layersBtn");
  const layerClose = document.getElementById("layerClose");
  if (!layerPanel || !layersBtn || !layerClose) throw new Error("elements DOM couches manquants");
  function buildLayerPanel() {
    const list = document.getElementById("layerList");
    list.innerHTML = layerDefs.map(function (d) {
      return "<div class=\"layer-row\"><div class=\"sw-icon\" style=\"background:" + d.color + "\"></div><div class=\"lbl\">" + d.label + " (" + layers[d.key].getLayers().length + ")</div>" +
        "<label class=\"switch\"><input type=\"checkbox\" data-layer=\"" + d.key + "\" " + (map.hasLayer(layers[d.key]) ? "checked" : "") + "><div class=\"track\"></div><div class=\"thumb\"></div></label></div>";
    }).join("");
    const checkboxes = list.querySelectorAll("input[type=checkbox]");
    for (let i = 0; i < checkboxes.length; i++) {
      checkboxes[i].addEventListener("change", function () {
        const key = this.dataset.layer;
        if (this.checked) layers[key].addTo(map); else map.removeLayer(layers[key]);
      });
    }
  }
  layersBtn.addEventListener("click", function () { buildLayerPanel(); layerPanel.classList.add("show"); });
  layerClose.addEventListener("click", function () { layerPanel.classList.remove("show"); });
  layerPanel.addEventListener("click", function (e) { if (e.target === layerPanel) layerPanel.classList.remove("show"); });
});

let geoMarker = null, geoCircle = null, watchId = null, tracking = false;
function placeGeoMarker(lat, lng, accuracy) {
  const latlng = [lat, lng];
  if (!geoMarker) geoMarker = L.marker(latlng, { icon: L.divIcon({ className: "vnf-icon", html: "<div class=\"pulse-dot\"></div>", iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
  else geoMarker.setLatLng(latlng);
    if (window.PKProjector) {
    const pkResult = window.PKProjector.findNearestPK(lat, lng, 120);
    const badge = document.getElementById("pkBadge");
    const badgeText = document.getElementById("pkBadgeText");
    if (badge && badgeText) {
      if (pkResult) {
        badgeText.textContent = (pkResult.approx ? "≈ " : "") + "PK " + pkResult.pk.toFixed(2) + " — " + pkResult.voie;
        badge.style.display = "block";
      } else {
        badge.style.display = "none";
      }
    }
  }
  if (accuracy) {
    if (!geoCircle) geoCircle = L.circle(latlng, { radius: accuracy, color: "#1e88e5", weight: 1, fillOpacity: 0.12 }).addTo(map);
    else { geoCircle.setLatLng(latlng); geoCircle.setRadius(accuracy); }
  }
}
safeSetup("Initialisation geolocalisation", function () {
  const geoBtn = document.getElementById("geoBtn");
  if (!geoBtn) throw new Error("geoBtn introuvable");
  function centerOnUser() {
    tracking = !tracking;
    geoBtn.classList.toggle("tracking", tracking);
    if (!tracking) {
      if (watchId !== null) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) window.Capacitor.Plugins.Geolocation.clearWatch({ id: watchId });
        else navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      return;
    }
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) {
      const Geolocation = window.Capacitor.Plugins.Geolocation;
      Geolocation.requestPermissions().then(function (perm) {
        if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
          showToast("Permission de localisation refusee");
          tracking = false;
          geoBtn.classList.remove("tracking");
          return;
        }
        Geolocation.getCurrentPosition({ enableHighAccuracy: true }).then(function (pos) {
          placeGeoMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 });
        });
        Geolocation.watchPosition({ enableHighAccuracy: true }, function (pos2, err) {
          if (err || !pos2) return;
          placeGeoMarker(pos2.coords.latitude, pos2.coords.longitude, pos2.coords.accuracy);
        }).then(function (id) { watchId = id; });
      }).catch(function (e) {
        console.error(e);
        showToast("Erreur de geolocalisation");
        tracking = false;
        geoBtn.classList.remove("tracking");
      });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        placeGeoMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 });
      }, function () { showToast("Geolocalisation indisponible"); }, { enableHighAccuracy: true });
      watchId = navigator.geolocation.watchPosition(function (pos) {
        placeGeoMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      }, null, { enableHighAccuracy: true });
    } else {
      showToast("Geolocalisation non supportee");
    }
  }
  geoBtn.addEventListener("click", centerOnUser);
});

safeSetup("Initialisation zoom personnalise", function () {
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  if (!zoomInBtn || !zoomOutBtn) throw new Error("boutons zoom introuvables");
  zoomInBtn.addEventListener("click", function () { map.zoomIn(); });
  zoomOutBtn.addEventListener("click", function () { map.zoomOut(); });
});
const WATER_STATIONS = [
  { code: "A701061001", label: "Moselle a Custines", sub: "Moselle canalisee - Metz-Custines" },
  { code: "A692101001", label: "Meurthe a Laneuveville-devant-Nancy", sub: "Proche chaine des 13 ecluses de Laneuveville" }
];

function waterLevelRowHtml(station, state) {
  const badgeColor = state.badge === "live" ? "#2ecc71" : (state.badge === "stale" ? "#e67e22" : "#7f8c8d");
  const badgeText = state.badge === "live" ? "EN DIRECT" : (state.badge === "stale" ? "DONNEE ANCIENNE" : "INDISPONIBLE");
  return "<div class=\"wl-row\" data-code=\"" + station.code + "\">" +
    "<div class=\"wl-info\"><div class=\"wl-label\">" + escapeHtml(station.label) + "</div><div class=\"wl-sub\">" + escapeHtml(station.sub) + "</div></div>" +
    "<div class=\"wl-value\">" + escapeHtml(state.text) + "</div>" +
    "<div class=\"wl-badge\" style=\"background:" + badgeColor + "\">" + badgeText + "</div>" +
  "</div>";
}

function renderWaterLevelRow(listEl, station, state) {
  const row = listEl.querySelector("[data-code=\"" + station.code + "\"]");
  if (!row) return;
  row.outerHTML = waterLevelRowHtml(station, state);
}

function loadWaterLevels(listEl) {
  listEl.innerHTML = WATER_STATIONS.map(function (s) {
    return waterLevelRowHtml(s, { text: "Chargement...", badge: "loading" });
  }).join("");

  WATER_STATIONS.forEach(function (s) {
    window.HubEauService.getHauteurEauStation(s.code)
      .then(function (r) {
        if (!r.ok) {
          renderWaterLevelRow(listEl, s, { text: "Indisponible", badge: "unavailable" });
          return;
        }
        const heightText = r.hauteurM.toFixed(2) + " m";
        const badge = (r.source === "network" || r.source === "cache-fresh") ? "live" : (r.fiable ? "live" : "stale");
        const ageInfo = (r.source === "network") ? "" : (" (il y a " + Math.round(r.ageMs / 60000) + " min)");
        renderWaterLevelRow(listEl, s, { text: heightText + ageInfo, badge: badge });
      })
      .catch(function (e) {
        console.error("[waterLevels]", s.code, e);
        renderWaterLevelRow(listEl, s, { text: "Erreur", badge: "unavailable" });
      });
  });
}

safeSetup("Panneau niveaux d'eau", function () {
  const btn = document.getElementById("waterLevelsBtn");
  const modal = document.getElementById("waterLevelsModal");
  const modalClose = document.getElementById("waterLevelsClose");
  const list = document.getElementById("waterLevelsList");
  const refreshBtn = document.getElementById("waterLevelsRefresh");
  if (!btn || !modal || !modalClose || !list || !refreshBtn) throw new Error("elements DOM niveaux d'eau manquants");

  btn.addEventListener("click", function () {
    modal.classList.add("show");
    modal.style.display = "flex";
    loadWaterLevels(list);
  });
  modalClose.addEventListener("click", function () { modal.style.display = "none"; });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.style.display = "none"; });
  refreshBtn.addEventListener("click", function () {
    WATER_STATIONS.forEach(function (s) {
      try { localStorage.removeItem("syncCache_hubeau_" + s.code); } catch (e) {}
    });
    loadWaterLevels(list);
  });
});
renderDiagBanner();
document.title = BUILD_ID;
showToast(BUILD_ID + " - " + n2 + " lignes, " + n3 + " points, " + nSeg + " segments VNF", 6000);

})();
