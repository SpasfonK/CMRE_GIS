const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, '..', 'www');
const required = [
  'index.html',
  'app.js',
  'lib/leaflet/leaflet.js',
  'lib/leaflet/leaflet.css',
  'data/export_2.js',
  'data/export_3.js',
  'data/SegmentationMarne_au_RhinMoselle_1.js',
  'communeResolver.js',
  'data/communes.geojson',
  'vnfDataset.js',
  'data/VNF_NordEst_Rhin_dataset.json',
  'syncCache.js',
  'hubEauService.js',
  'pkProjector.js',
];

let missing = [];
for (const rel of required) {
  const full = path.join(wwwDir, rel);
  if (!fs.existsSync(full)) missing.push('www/' + rel);
}

if (missing.length) {
  console.error('Fichiers manquants dans www/ :\n' + missing.map((m) => ' - ' + m).join('\n'));
  console.error('\nAjoutez ces fichiers au dépôt avant de relancer le build.');
  process.exit(1);
}

console.log('www/ est complet — prêt pour `npx cap sync android`.');
