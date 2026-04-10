/* ═══════════════════════════════════════════════════════════
   cities.js — Morocco city list + IP auto-fill + custom dropdown
   ═══════════════════════════════════════════════════════════ */

/* Default hardcoded list — exact names as Olivraison uses them */
var MOROCCO_CITIES_DEFAULT = [
  "Casablanca","Tangier","Marrakech","Sale","Rabat","Kenitra","Agadir",
  "Temara","Safi","Mohammedia","Ait Melloul","Nador","Settat","Guelmim",
  "Bouskoura","Errachidia","Guercif","Ben Guerir","Sefrou","Essaouira",
  "Tiznit","Youssoufia","Martil","Meknes","Beni Mellal","Khenifra",
  "Benslimane","Sidi Bennour","Azrou","Jerada","Mrirt","Azemmour",
  "Zoumi","Laouamra","Zagora","Ait Ourir","Sidi Bibi","Biougra",
  "Bouznika","Aguelmous","Mediouna","Asilah","Lalla Mimouna","Arfoud",
  "Imzourne","Chichaoua","Tahla","Moulay Bousselham","Sabaa Aiyoun",
  "Skoura","Tighsaline","Tata","Imintanout","Sidi Bouknadel",
  "Ben Ahmed","Targuist - Hoceima","Boukidarne","Sidi Bouaatman",
  "Tamslouht","Tamnsourt","Tahnaout","Ksar Seghir","Ighrem","Agdez",
  "Boumalne Dades","Kelaat Mgouna","Sidi Allal Bahraoui","Bouarfa",
  "Boujdour","Taounat","Beni Drar - Oujda","Es-Semara",
  "Mechrouaa Belksiri","Souk Larbaa","Sidi Yahya El Gharb","Midelt",
  "Rich","Tinghir","Tinjdad","Goulmima","Rissani","Aoufous",
  "Had Soualem","Ahfir","Imouzzar","Tifelt","Demnate","Ouazzane",
  "Bouizakarne","Sidi Ifni","Tantan","Souiria","Chemaaiya",
  "Tlat Bogdra","Jamaat Shaim","Oualidia","Had Hrara","Sebt Gzoula",
  "Skhirat","Tamesna","Ain Aouda","Ain Attiq","Harhoura","Saidia",
  "Attaouia","Khemisset","Belfaa","Oued Amlil","Houara","Taroudant",
  "Sidi Bouzid","Rahma","Deroua","Ain Harouda","Tamariss","Dar Bouaaza",
  "Tit Melil","Hajeb","Mhaya","Oued Jdida","Boufakrane","Ain Taoujdate",
  "Kasbat Tadla","Taourirte","Ifrane","Souk Sebt","Bir Jdid",
  "Khmis Zemmamra","Sidi Sliman","Sidi Kacem","Azilal","Fkih Ben Saleh",
  "Khouribga","Berkan","Kelaat Sraghna","Ouarzazate","Oujda","Dakhla",
  "Berrechid","Eljadida","Laarache","Ksar Kebir","Mdiq","Fnideq",
  "Chefchaouen","El Houcima","Taza","Figuig","Massa","Tarfaya",
  "Tafraout","Afourar","Oulad Zidouh","Zaouiat Cheikh","El Ksiba",
  "Aghbalo","El Kbab","Ait Ishak","Kariat Bamohamed","Ghafsai",
  "Boulemane","Cabo Negro","Nouaceur","Moulay Abdellah","Sidi Rahal",
  "Sebaa Ayoun","Moulay Driss Zarhoun","Bab Bard","Laayoun Port",
  "Keliaa","Skhour El Rhamna","Mehdia","Mhamid El Ghizlane","Chellalate",
  "El Mansouria","Oulmes","Rommani Ville","Laayoun Cherkia","Sidi Hejaj Sbit",
  "Moulay Yaacoub","Sidi Harazem","Ras El Ma Fes","Ain Cheggag",
  "Bni Bouayach","Aghbal","Tafoughalt","Kamouni","Maaziz","Louizia",
  "Jorf Sefar","Agouray","Bouderbala","Gfifat","Oulad Berhil","Dlalha",
  "El Gara","Outat El Haj","Ourika-Ville","Sidi Allal Tazi","Khenichet",
  "Guisser","El Borouj","Oued Laou","Issaguen","Fes","Tetouan",
  "Laayoune","Oulad Teima","Zaio","Inezgane","Tamelelt","Driouch",
  "Sidi Ghanem","Aourir","Targuist","Beni Nsar","Taznakht","Bejaad",
  "Assa","Ait Aiaaza","Kassita","Missour","Oued Zem","Amizmiz","Bentiyeb",
];

var MOROCCO_CITIES = MOROCCO_CITIES_DEFAULT.slice();
var _cityIds = ['info-city', 'bnCity', 'bcoCity', 'af-city', 'omCity'];

/* Load custom list from backend if available */
(function() {
  fetch('/api/cities', { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && Array.isArray(data.cities) && data.cities.length) {
        MOROCCO_CITIES = data.cities;
      }
    })
    .catch(function() {});
})();

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
  var norm = _normCity(detected);
  for (var i = 0; i < MOROCCO_CITIES.length; i++) {
    if (_normCity(MOROCCO_CITIES[i]) === norm) return MOROCCO_CITIES[i];
  }
  for (var i = 0; i < MOROCCO_CITIES.length; i++) {
    if (norm.startsWith(_normCity(MOROCCO_CITIES[i]))) return MOROCCO_CITIES[i];
  }
  for (var i = 0; i < MOROCCO_CITIES.length; i++) {
    if (norm.includes(_normCity(MOROCCO_CITIES[i]))) return MOROCCO_CITIES[i];
  }
  for (var i = 0; i < MOROCCO_CITIES.length; i++) {
    if (_normCity(MOROCCO_CITIES[i]).includes(norm)) return MOROCCO_CITIES[i];
  }
  return null;
}

/* ── Custom dropdown ─────────────────────────────────────── */
function _initCityInput(el) {
  if (!el || el._cityInit) return;
  el._cityInit = true;

  var drop = document.createElement('div');
  drop.style.cssText = [
    'display:none',
    'position:fixed',
    'z-index:99999',
    'background:#fff',
    'border:1.5px solid #e0dbd0',
    'border-radius:8px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.13)',
    'overflow-y:auto',
    'max-height:210px',
    'font-family:inherit',
  ].join(';');
  document.body.appendChild(drop);

  function _position() {
    var r = el.getBoundingClientRect();
    drop.style.top  = (r.bottom + 4) + 'px';
    drop.style.left = r.left + 'px';
    drop.style.width = r.width + 'px';
  }

  function _show(list) {
    if (!list.length) { drop.style.display = 'none'; return; }
    _position();
    drop.innerHTML = list.map(function(c) {
      return '<div style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f2ec;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-val="' + c + '">' + c + '</div>';
    }).join('');
    drop.querySelectorAll('div').forEach(function(item) {
      item.addEventListener('mouseover', function() { this.style.background = '#f5f2ec'; });
      item.addEventListener('mouseout',  function() { this.style.background = ''; });
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        el.value = this.getAttribute('data-val');
        drop.style.display = 'none';
        el.dispatchEvent(new Event('change'));
      });
    });
    drop.style.display = 'block';
  }

  function _filter() {
    var q = _normCity(el.value);
    var list = q
      ? MOROCCO_CITIES.filter(function(c) { return _normCity(c).startsWith(q); }).slice(0,10)
          .concat(MOROCCO_CITIES.filter(function(c) { return !_normCity(c).startsWith(q) && _normCity(c).includes(q); }).slice(0,5))
      : MOROCCO_CITIES.slice(0, 8);
    _show(list.slice(0, 10));
  }

  el.setAttribute('autocomplete', 'off');
  el.addEventListener('input',  _filter);
  el.addEventListener('focus',  _filter);
  el.addEventListener('blur',   function() { setTimeout(function() { drop.style.display = 'none'; }, 180); });
  window.addEventListener('scroll', function() { if (drop.style.display !== 'none') _position(); }, true);
  window.addEventListener('resize', function() { if (drop.style.display !== 'none') _position(); });

  /* remove dropdown when input is removed from DOM */
  var obs = new MutationObserver(function() {
    if (!document.body.contains(el)) { drop.remove(); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function _initAllCityInputs() {
  _cityIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) _initCityInput(el);
  });
}

/* ── IP detection ────────────────────────────────────────── */
function _applyCity(city) {
  _cityIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el && !el.value) el.value = city;
  });
}

var _detectionPromise = null;

async function autoDetectCity() {
  try {
    var res  = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    var data = await res.json();
    if (!data.city) return;
    var matched = matchMoroccoCity(data.city);
    if (!matched) return;
    window._detectedCity = matched;
    _applyCity(matched);
  } catch (e) { /* silent */ }
}

/* Called after dynamic forms (buy-now, bundle) open */
/* Expose so dynamic forms can init a specific input directly */
window._initCityInput = _initCityInput;

window.fillDetectedCity = async function() {
  if (_detectionPromise) await _detectionPromise;
  if (window._detectedCity) _applyCity(window._detectedCity);
  _initAllCityInputs();
};

/* Run on DOM ready */
function _onReady() {
  _initAllCityInputs();
  _detectionPromise = autoDetectCity();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _onReady);
} else {
  _onReady();
}
