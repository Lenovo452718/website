/* ═══════════════════════════════════════════════════════════
   cities.js — Morocco city list + silent IP-based auto-fill
   ═══════════════════════════════════════════════════════════ */

const MOROCCO_CITIES = [
  "Casablanca","Tangier","Marrakech","Salé","Rabat","Kénitra","Agadir",
  "Témara","Safi","Mohammedia","Ait Melloul","Nador","Settat","Guelmim",
  "Bouskoura","Errachidia","Guercif","Ben Guerir","Sefrou","Essaouira",
  "Tiznit","Youssoufia","Martil","Meknès","Béni Mellal","Khénifra",
  "Benslimane","Sidi Bennour","Azrou","Jerada","Mrirt","Azemmour",
  "Zoumi","Laouamra","Zagora","Ait Ourir","Sidi Bibi","Biougra",
  "Bouznika","Aguelmous","Mediouna","Asilah","Lalla Mimouna","Arfoud",
  "Imzourne","Chichaoua","Tahla","Moulay Bousselham","Sabaa Aiyoun",
  "Skoura","Tighsaline","Tata","Imintanout","Sidi Bouknadel",
  "Ben Ahmed","Targuist","Boukidarne","Sidi Bouaatman","Tamslouht",
  "Tamnsourt","Tahnaout","Ksar Seghir","Ighrem","Agdez",
  "Boumalne Dades","Kelaat Mgouna","Sidi Allal Bahraoui","Bouarfa",
  "Boujdour","Taounat","Beni Drar","Es-Semara","Mechrouaa Belksiri",
  "Souk Larbaa","Sidi Yahya El Gharb","Midelt","Rich","Tinghir",
  "Tinjdad","Goulmima","Rissani","Aoufous","Had Soualem","Ahfir",
  "Imouzzar","Tifelt","Demnate","Ouazzane","Bouizakarne","Sidi Ifni",
  "Tantan","Souiria","Chemaaiya","Tlat Bogdra","Jamaat Shaim",
  "Oualidia","Had Hrara","Sebt Gzoula","Skhirat","Tamesna",
  "Ain Aouda","Ain Attiq","Harhoura","Saïdia","Attaouia","Khemisset",
  "Belfaa","Oued Amlil","Houara","Taroudant","Sidi Bouzid","Rahma",
  "Deroua","Ain Harouda","Tamariss","Dar Bouaaza","Tit Melil","Hajeb",
  "Mhaya","Oued Jdida","Boufakrane","Ain Taoujdate","Kasbat Tadla",
  "Taourirte","Ifrane","Souk Sebt","Bir Jdid","Khmis Zemmamra",
  "Sidi Slimane","Sidi Kacem","Azilal","Fkih Ben Saleh","Khouribga",
  "Berkan","Kelaat Sraghna","Ouarzazate","Oujda","Dakhla","Berrechid",
  "El Jadida","Larache","Ksar El Kebir","M'diq","Fnideq","Chefchaouen",
  "Al Hoceima","Taza","Figuig","Massa","Tarfaya","Tafraout","Afourar",
  "Oulad Zidouh","Zaouiat Cheikh","El Ksiba","Aghbalo","El Kbab",
  "Ait Ishak","Kariat Bamohamed","Ghafsai","Boulemane","Cabo Negro",
  "Nouaceur","Moulay Abdellah","Sidi Rahal","Sebaa Ayoun",
  "Moulay Driss Zarhoun","Bab Bard","Laayoune","Keliaa",
  "Skhour El Rhamna","Mehdia","Mhamid El Ghizlane","Chellalate",
  "El Mansouria","Oulmes","Rommani","Moulay Yaacoub","Sidi Harazem",
  "Ras El Ma","Ain Cheggag","Bni Bouayach","Aghbal","Tafoughalt",
  "Maaziz","Louizia","Jorf Sefar","Agouray","Bouderbala","Gfifat",
  "Oulad Berhil","El Gara","Outat El Haj","Ourika","Sidi Allal Tazi",
  "Khenichet","Guisser","El Borouj","Oued Laou","Issaguen","Fès",
  "Tétouan","Inezgane","Tamelelt","Driouch","Oulad Teïma","Aourir",
  "Beni Nsar","Taznakht","Bejaad","Assa","Ait Aiaaza","Kassita",
  "Missour","Oued Zem","Amizmiz","Bentiyeb","Sale",
];

/* Normalise: lowercase, strip accents, remove non-alphanumeric */
function _normCity(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/* Find best matching city from the list */
function matchMoroccoCity(detected) {
  if (!detected) return null;
  const norm = _normCity(detected);

  // 1. Exact match
  for (const c of MOROCCO_CITIES) {
    if (_normCity(c) === norm) return c;
  }

  // 2. Detected string starts with city name (e.g. "Casablanca Prefecture" → "Casablanca")
  for (const c of MOROCCO_CITIES) {
    if (norm.startsWith(_normCity(c))) return c;
  }

  // 3. City name is contained in detected string
  for (const c of MOROCCO_CITIES) {
    if (norm.includes(_normCity(c))) return c;
  }

  // 4. Detected string is contained in city name
  for (const c of MOROCCO_CITIES) {
    if (_normCity(c).includes(norm)) return c;
  }

  return null;
}

var _cityIds = ['info-city', 'bnCity', 'bcoCity', 'af-city'];

/* Also add a <datalist> to every city input so the user can correct if wrong */
function _attachCityDatalist() {
  var dl = document.getElementById('_moroccoDatalist');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = '_moroccoDatalist';
    MOROCCO_CITIES.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    });
    document.body.appendChild(dl);
  }
  _cityIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.setAttribute('list', '_moroccoDatalist');
  });
}

function _applyCity(city) {
  _cityIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el && !el.value) el.value = city;
  });
  _attachCityDatalist();
}

/* Store promise so dynamic forms can await detection that may still be in flight */
var _detectionPromise = null;

async function autoDetectCity() {
  try {
    const res  = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    const data = await res.json();
    if (!data.city) return;
    const matched = matchMoroccoCity(data.city);
    if (!matched) return;
    window._detectedCity = matched;
    _applyCity(matched);
  } catch (e) {
    // Silent — never block checkout on geolocation failure
  }
}

/* Called after dynamic forms (buy-now, bundle) are injected into DOM */
window.fillDetectedCity = async function() {
  // If detection is still running, wait for it
  if (_detectionPromise) await _detectionPromise;
  if (window._detectedCity) _applyCity(window._detectedCity);
  _attachCityDatalist();
};

/* Run on DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    _attachCityDatalist();
    _detectionPromise = autoDetectCity();
  });
} else {
  _attachCityDatalist();
  _detectionPromise = autoDetectCity();
}
