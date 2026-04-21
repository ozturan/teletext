(function() {
'use strict';

// ─── CONSTANTS ──────────────────────────────────────
const MS = { SECOND: 1000, MINUTE: 60000, HOUR: 3600000, DAY: 86400000 };

const INTERVALS = {
  SLIDE:       15000,
  DATA:        10 * MS.MINUTE,
  FINANCE:     5  * MS.MINUTE,
  WEATHER:     15 * MS.MINUTE,
  SPORTS:      30 * MS.SECOND,
  PREDICTIONS: 10 * MS.MINUTE,
  WALL_POLL:   10 * MS.SECOND,
  OTD_ADVANCE: 30 * MS.SECOND,
  TIMESTAMPS:  30 * MS.SECOND,
};

const LIMITS = {
  GLOBAL_STORIES: 200,
  LOCAL_STORIES:  20,
  NEWS_PIPS:      50,
  POLYMARKET:     100,
};

const TICKER_PX_PER_SEC    = 60;
const TICKER_RESUME_MS     = 4000;
const SIDEBAR_MIN          = 200;
const SIDEBAR_MAX          = 500;
const KIOSK_SCROLL_MS      = 100;
const PREFS_DEBOUNCE_MS    = 1000;
const SHARE_MSG_MS         = 4000;
const HOLIDAY_WINDOW_DAYS  = 30;
const POLYMARKET_PCT_RANGE = [5, 95];

let slideMs = (() => {
  try { return JSON.parse(localStorage.getItem('teletext-prefs')).slideInterval || INTERVALS.SLIDE; }
  catch { return INTERVALS.SLIDE; }
})();


// ─── USER LOCATION (overwritten by geo detection) ───
let userCountry     = 'CA';
let userCountryName = 'Canada';
let userCity        = 'Vancouver';
let userLat         = 49.28;
let userLon         = -123.12;
let userTZ          = 'America/Vancouver';

// Countries that use 12h clock and Fahrenheit
const COUNTRIES_12H = ['US', 'PH', 'MY', 'AU', 'CA', 'IN', 'EG', 'SA', 'CO', 'PK', 'BD'];
const COUNTRIES_F   = ['US', 'BS', 'KY', 'LR', 'PW', 'FM', 'MH'];

function use12h() { const p = getPrefs(); return p.clock12h !== undefined ? p.clock12h : COUNTRIES_12H.includes(userCountry); }
function useF()   { const p = getPrefs(); return p.tempF !== undefined ? p.tempF : COUNTRIES_F.includes(userCountry); }


// ─── UTILITIES ──────────────────────────────────────
const $ = id => document.getElementById(id);

function el(tag, className, props = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (props.text) e.textContent = props.text;
  if (props.html) e.innerHTML = props.html;
  if (props.title) e.title = props.title;
  if (props.style) Object.assign(e.style, props.style);
  if (props.data) Object.entries(props.data).forEach(([k, v]) => e.dataset[k] = v);
  if (props.on) Object.entries(props.on).forEach(([k, v]) => e.addEventListener(k, v));
  if (props.children) props.children.forEach(c => c && e.appendChild(c));
  return e;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// Escape HTML but preserve <em>/<i> tags from RSS feeds for italic emphasis
function escapeAllowEm(text) {
  return escapeHtml(text)
    .replace(/&lt;(\/?)(em|i)&gt;/g, '<$1$2>');
}

// ─── THEME DERIVATION ────────────────────────────────
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

function luminance(r,g,b) { return (0.299*r + 0.587*g + 0.114*b) / 255; }

function mix(c1, c2, t) {
  return c1.map((v,i) => Math.round(v + (c2[i] - v) * t));
}

function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }
function rgbHex(rgb) { return '#' + rgb.map(v => v.toString(16).padStart(2,'0')).join(''); }

function deriveTheme() {
  const s = getComputedStyle(document.documentElement);
  const bg = s.getPropertyValue('--bg').trim();
  const fg = s.getPropertyValue('--fg').trim();
  const accent = s.getPropertyValue('--accent').trim();
  const green = s.getPropertyValue('--green').trim();
  const red = s.getPropertyValue('--red').trim();
  if (!bg || !fg) return;
  applyDerivedVars(bg, fg, accent, green, red);
}

function applyDerivedVars(bg, fg, accent, green, red) {
  const bgRgb = hexToRgb(bg), fgRgb = hexToRgb(fg);
  const dark = luminance(...bgRgb) < 0.5;
  const r = document.documentElement.style;

  // Surface: bg shifted 5% toward fg
  r.setProperty('--surface', rgbHex(mix(bgRgb, fgRgb, 0.05)));
  // Border: fg at low opacity
  r.setProperty('--border', rgba(fgRgb, dark ? 0.08 : 0.10));
  // Text hierarchy
  r.setProperty('--text-display', fg);
  r.setProperty('--text-primary', dark ? rgba(fgRgb, 0.80) : rgbHex(mix(fgRgb, bgRgb, 0.15)));
  r.setProperty('--text-secondary', dark ? rgba(fgRgb, 0.45) : rgbHex(mix(fgRgb, bgRgb, 0.40)));
  r.setProperty('--text-disabled', dark ? rgba(fgRgb, 0.25) : rgbHex(mix(fgRgb, bgRgb, 0.60)));
  // Status
  r.setProperty('--accent-red', red);
  r.setProperty('--status-green', green);
  r.setProperty('--status-amber', accent);
}

function decodeHtml(text) {
  const t = document.createElement('textarea');
  t.innerHTML = text;
  return t.value;
}

function ago(seconds, suffix = '') {
  if (seconds < 60)    return 'now';
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m${suffix}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h${suffix}`;
  return `${Math.floor(seconds / 86400)}d${suffix}`;
}

const timeAgo      = ds => ds && !isNaN(new Date(ds)) ? ago(Math.floor((Date.now() - new Date(ds)) / 1000), ' ago') : '';
const timestampAgo = ts => ago(Math.floor((Date.now() - ts) / 1000));

function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const c = code.toUpperCase();
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65);
}

function randomShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}


// ─── SETTINGS ENGINE ────────────────────────────────
let myCode = localStorage.getItem('teletext-code') || '';

function getPrefs() {
  try { return JSON.parse(localStorage.getItem('teletext-prefs')) || {}; }
  catch { return {}; }
}

function savePrefs(prefs) {
  localStorage.setItem('teletext-prefs', JSON.stringify(prefs));
  clearTimeout(savePrefs._t);
  savePrefs._t = setTimeout(() => {
    if (!myCode) return;
    fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...prefs, _code: myCode }) })
      .then(r => r.json())
      .then(data => {
        if (data.code && !myCode) {
          myCode = data.code;
          localStorage.setItem('teletext-code', myCode);
          history.replaceState(null, null, '/' + myCode);
        }
      })
      .catch(() => {});
  }, PREFS_DEBOUNCE_MS);
}

// ─── MARKET METADATA ─────────────────────────────────
const MARKET_META = {
  'BTC': { name: 'Bitcoin', group: 'Crypto' },
  'ETH': { name: 'Ethereum', group: 'Crypto' },
  'SOL': { name: 'Solana', group: 'Crypto' },
  'XRP': { name: 'Ripple', group: 'Crypto' },
  'DOGE': { name: 'Dogecoin', group: 'Crypto' },
  'ADA': { name: 'Cardano', group: 'Crypto' },
  'GOLD': { name: 'Gold', group: 'Commodities' },
  'OIL': { name: 'Crude Oil', group: 'Commodities' },
  'SILVER': { name: 'Silver', group: 'Commodities' },
  'S&P 500': { name: 'S&P 500', group: 'Indices' },
  'NASDAQ': { name: 'NASDAQ', group: 'Indices' },
  'TSX': { name: 'Toronto', group: 'Indices' },
  'DOW': { name: 'Dow Jones', group: 'Indices' },
  'FTSE': { name: 'London', group: 'Indices' },
  'DAX': { name: 'Frankfurt', group: 'Indices' },
  'NIKKEI': { name: 'Tokyo', group: 'Indices' },
  'USD/CAD': { name: 'US / Canada', group: 'Forex' },
  'EUR/USD': { name: 'Euro / US', group: 'Forex' },
  'GBP/USD': { name: 'Pound / US', group: 'Forex' },
  'USD/JPY': { name: 'US / Yen', group: 'Forex' },
  'USD/TRY': { name: 'US / Lira', group: 'Forex' },
  'AAPL': { name: 'Apple', group: 'Stocks' },
  'MSFT': { name: 'Microsoft', group: 'Stocks' },
  'GOOGL': { name: 'Alphabet', group: 'Stocks' },
  'AMZN': { name: 'Amazon', group: 'Stocks' },
  'NVDA': { name: 'NVIDIA', group: 'Stocks' },
  'TSLA': { name: 'Tesla', group: 'Stocks' },
  'META': { name: 'Meta', group: 'Stocks' },
};

const MARKET_GROUP_ORDER = ['Indices', 'Crypto', 'Commodities', 'Forex', 'Stocks', 'Custom'];
const MARKET_PRESETS = {
  'Crypto': ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
  'Indices': ['S&P 500', 'NASDAQ', 'TSX', 'DOW', 'FTSE', 'DAX'],
  'Tech': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META'],
};

const SPORT_GROUPS = [
  { key: 'soccer',     label: 'Football' },
  { key: 'basketball', label: 'Basketball' },
  { key: 'football',   label: 'American Football' },
  { key: 'baseball',   label: 'Baseball' },
  { key: 'hockey',     label: 'Hockey' },
  { key: 'tennis',     label: 'Tennis' },
  { key: 'golf',       label: 'Golf' },
  { key: 'racing',     label: 'Motorsport' },
  { key: 'mma',        label: 'MMA' },
  { key: 'cricket',    label: 'Cricket' },
  { key: 'rugby',        label: 'Rugby Union' },
  { key: 'rugby-league', label: 'Rugby League' },
];

const SPORT_PRESETS = {
  'European Football': lg => lg.sport === 'soccer' && ['England','Spain','Germany','Italy','France','Portugal','Netherlands','Belgium','Scotland','Turkey','Europe'].includes(lg.country),
  'US Sports': lg => ['basketball','football','baseball','hockey'].includes(lg.sport) || (lg.sport === 'soccer' && lg.tag === 'MLS'),
  'All': () => true,
  'None': () => false,
};

// ─── SETTINGS UI HELPERS ─────────────────────────────
function renderGrid(items, { dataAttr = 'data-key', isActive, renderLabel, radio = false } = {}) {
  const prefs = getPrefs();
  return items.map(item => {
    const key = item.id || item.tag || item.ms || item;
    const on = isActive ? isActive(key, prefs) : true;
    const check = radio ? (on ? '\u25CF' : '\u25CB') : (on ? '\u25A0' : '\u25A1');
    return `<div class="set-item${on ? ' on' : ''}" ${dataAttr}="${escapeHtml(String(key))}">` +
      `<span class="set-check">${check}</span><span>${renderLabel(item)}</span></div>`;
  }).join('');
}

function bindGrid(container, dataAttr, onToggle) {
  container.querySelectorAll(`[${dataAttr}]`).forEach(el => {
    el.addEventListener('click', () => onToggle(el.getAttribute(dataAttr), el, getPrefs()));
  });
}

function toggleItem(el, on, radio = false) {
  el.classList.toggle('on', on);
  el.querySelector('.set-check').textContent = radio ? (on ? '\u25CF' : '\u25CB') : (on ? '\u25A0' : '\u25A1');
}




// ─── CLOCK ──────────────────────────────────────────
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tick() {
  const now = new Date();
  let h = now.getHours(), suffix = '';
  if (use12h()) {
    suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  }
  const time = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  $('topClock').innerHTML = suffix ? `${time}<span class="clock-ampm">${suffix}</span>` : time;
  $('topDate').textContent =
    `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}
setInterval(tick, 1000);
tick();


// ─── GEOLOCATION ────────────────────────────────────
const countryName = (() => {
  try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); return code => dn.of(code) || code; }
  catch { return code => code; }
})();

async function detectCountry() {
  try {
    const data = await (await fetch('/api/geo')).json();
    if (data.country) {
      userCountry     = data.country;
      userCountryName = countryName(data.country);
      userCity = data.city || userCity;
      if (data.lat) userLat = data.lat;
      if (data.lon) userLon = data.lon;
      if (data.tz)  userTZ  = data.tz;
    }
  } catch { /* defaults are fine */ }

  if (!userTZ || userTZ === 'America/Vancouver') {
    try { userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || userTZ; } catch {}
  }

  // Apply saved city override
  const savedPrefs = getPrefs();
  if (savedPrefs.city && savedPrefs.cityLat) {
    userCity = savedPrefs.city;
    userLat = savedPrefs.cityLat;
    userLon = savedPrefs.cityLon;
    userTZ = savedPrefs.cityTZ || userTZ;
    if (savedPrefs.cityCountry) {
      userCountry = savedPrefs.cityCountry;
      userCountryName = countryName(userCountry);
    }
  }

  $('holCountry').textContent = `${countryFlag(userCountry)} ${userCountryName}`;
  if (userCity) $('cityLabel').textContent = `\u2022 ${userCity}`;

  fetchWeather();
  fetchHolidays();
  fetchOTD();
  loadData();
  fetchFinance();
  fetchSports();
}


// ─── WEATHER ────────────────────────────────────────
let WEATHER_ICONS = {};
const weatherIconsReady = fetch('/weather-icons.json').then(r => r.json()).then(d => { WEATHER_ICONS = d; }).catch(() => {});

function weatherIcon(code) {
  if (code === 0)  return WEATHER_ICONS.clear   || '';
  if (code <= 3)   return WEATHER_ICONS.cloudy  || '';
  if (code <= 49)  return WEATHER_ICONS.fog     || '';
  if (code <= 59)  return WEATHER_ICONS.drizzle || '';
  if (code <= 69)  return WEATHER_ICONS.rain    || '';
  if (code <= 79)  return WEATHER_ICONS.snow    || '';
  if (code <= 82)  return WEATHER_ICONS.rain    || '';
  if (code <= 86)  return WEATHER_ICONS.snow    || '';
  if (code <= 99)  return WEATHER_ICONS.storm   || '';
  return WEATHER_ICONS.unknown || '';
}

function weatherLabel(code) {
  if (code === 0)  return 'CLEAR';
  if (code <= 3)   return 'CLOUDY';
  if (code <= 49)  return 'FOG';
  if (code <= 59)  return 'DRIZZLE';
  if (code <= 69)  return 'RAIN';
  if (code <= 79)  return 'SNOW';
  if (code <= 82)  return 'SHOWERS';
  if (code <= 86)  return 'SNOW';
  if (code <= 99)  return 'STORM';
  return '--';
}

async function fetchWeather() {
  await weatherIconsReady;
  try {
    const data = await (await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${userLat}&longitude=${userLon}` +
      `&current=temperature_2m,weather_code,uv_index,relative_humidity_2m,wind_speed_10m` +
      `&timezone=${encodeURIComponent(userTZ)}`
    )).json();

    const c = data.current;
    $('weatherIcon').innerHTML = weatherIcon(c.weather_code);
    const tempC = c.temperature_2m;
    const temp = useF() ? `${Math.round(tempC * 9/5 + 32)}\u00B0F` : `${Math.round(tempC)}\u00B0C`;
    $('weatherMain').textContent = `${temp}  ${weatherLabel(c.weather_code)}`;

    const rows = [];
    const windKm = c.wind_speed_10m;
    if (windKm) rows.push({ label: 'Wind', value: useF() ? `${Math.round(windKm * 0.621)} mph` : `${Math.round(windKm)} km/h` });
    if (c.relative_humidity_2m) rows.push({ label: 'Humidity',  value: `${c.relative_humidity_2m}%` });
    if (c.uv_index !== undefined) {
      const uv = c.uv_index.toFixed(1);
      const level = uv < 3 ? 'Low' : uv < 6 ? 'Mod' : uv < 8 ? 'High' : uv < 11 ? 'V.High' : 'Extreme';
      rows.push({ label: 'UV', value: `${uv} ${level}` });
    }

    try {
      const aq = await (await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${userLat}&longitude=${userLon}&current=us_aqi`
      )).json();
      const aqi = aq.current.us_aqi;
      const level = aqi <= 50 ? 'Good' : aqi <= 100 ? 'Mod' : aqi <= 150 ? 'Unhlty-SG' : 'Unhealthy';
      rows.push({ label: 'AQI', value: `${aqi} ${level}` });
    } catch {}

    $('weatherExtra').innerHTML = rows.map(r =>
      `<div class="wx-row"><span class="wx-label">${r.label}</span><span class="wx-value">${r.value}</span></div>`
    ).join('');
  } catch {
    $('weatherMain').textContent = 'Weather unavailable';
  }
}
setInterval(fetchWeather, INTERVALS.WEATHER);


// ─── HOLIDAYS ───────────────────────────────────────
async function fetchHolidays() {
  const el = $('holList');
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const windowEnd = new Date(now.getTime() + HOLIDAY_WINDOW_DAYS * MS.DAY);

  try {
    const data = await (await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${userCountry}`)).json();
    if (!data.length) { el.innerHTML = '<span class="loading-state">No data</span>'; return; }

    const upcoming = data.filter(h => {
      const [y, m, d] = h.date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt >= now && dt <= windowEnd;
    });

    if (!upcoming.length) { el.innerHTML = '<span class="loading-state">No holidays in the next 30 days</span>'; return; }

    el.innerHTML = upcoming.map(h => {
      const [y, m, d] = h.date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const label = `${MONTHS[dt.getMonth()]} ${String(dt.getDate()).padStart(2, ' ')} ${DAYS[dt.getDay()]}`;
      const cls = h.date === today ? ' hol-today' : '';
      return `<div class="hol-item${cls}"><span class="hol-date">${label}</span>` +
        `<span class="hol-name">${escapeHtml(decodeHtml(h.localName || h.name))}</span></div>`;
    }).join('');
  } catch {
    el.innerHTML = '<span style="color:var(--accent-red);">Failed to load</span>';
  }
}


// ─── COUNTDOWNS ─────────────────────────────────────
async function searchEvents(query) {
  const q = query.trim();
  if (!q) return [];
  try {
    const now = new Date();
    const thisYear = now.getFullYear();
    const nowStr = now.toISOString().slice(0, 10);

    // Search with the query as-is, plus with upcoming years appended
    const searches = [q];
    if (!/\d{4}/.test(q)) {
      for (let y = thisYear; y <= thisYear + 4; y++) searches.push(`${y} ${q}`);
    }

    // Collect unique entity IDs from all searches (via proxy to avoid CORS)
    const allIds = new Set();
    await Promise.all(searches.map(async s => {
      try {
        const data = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(s)}&language=en&limit=10&format=json&origin=*`)).json();
        (data.search || []).forEach(r => allIds.add(r.id));
      } catch {}
    }));

    if (!allIds.size) return [];
    const ids = [...allIds].slice(0, 50);

    // Fetch claims via proxy
    const entityData = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels|claims&languages=en&format=json&origin=*`)).json();
    const entities = entityData.entities || {};
    const results = [];

    for (const id of ids) {
      const e = entities[id];
      if (!e || !e.claims) continue;
      const label = e.labels?.en?.value;
      if (!label) continue;

      const dateClaim = e.claims.P580?.[0] || e.claims.P585?.[0];
      if (!dateClaim) continue;
      const timeVal = dateClaim.mainsnak?.datavalue?.value?.time;
      if (!timeVal) continue;
      const date = timeVal.replace(/^\+/, '').slice(0, 10);
      if (date < nowStr || date.startsWith('0000')) continue;

      results.push({ name: label, date });
    }

    // Deduplicate by name
    const seen = new Set();
    const unique = results.filter(r => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });

    return unique.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  } catch { return []; }
}

const DEFAULT_COUNTDOWNS = [
  { id: 'wc2026',      name: 'FIFA World Cup 2026',  date: '2026-06-11' },
  { id: 'olympics2028', name: 'Olympics LA 2028',     date: '2028-07-14' },
  { id: 'euro2028',    name: 'UEFA Euro 2028',        date: '2028-06-09' },
  { id: 'uselection',  name: 'US Midterms',          date: '2026-11-03' },
  { id: 'nye2027',     name: 'New Year 2027',         date: '2027-01-01' },
];

function getCountdowns() {
  const prefs = getPrefs();
  const removed = prefs.removedCountdowns || [];
  const custom = prefs.customCountdowns || [];
  const defaults = DEFAULT_COUNTDOWNS.filter(c => !removed.includes(c.id));
  return [...defaults, ...custom].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function formatCountdown(ms) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 365) {
    const y = Math.floor(d / 365);
    const rem = d % 365;
    return `${y}y ${rem}d`;
  }
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function renderCountdowns() {
  const el = $('countdownList');
  const events = getCountdowns();
  if (!events.length) { el.innerHTML = '<span style="color:var(--text-disabled);">No countdowns</span>'; return; }

  const now = Date.now();
  el.innerHTML = events.map(c => {
    const ms = new Date(c.date).getTime() - now;
    const past = ms <= 0;
    return `<div class="cd-row${past ? ' cd-past' : ''}">` +
      `<span class="cd-name">${escapeHtml(c.name)}</span>` +
      `<span class="cd-time">${past ? 'passed' : formatCountdown(ms)}</span></div>`;
  }).join('');
}

renderCountdowns();
setInterval(renderCountdowns, 60000);


// ─── ON THIS DAY ────────────────────────────────────
let otdEvents = [];
let otdIndex  = 0;

async function fetchOTD() {
  try {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const data = await (await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${m}/${d}`)).json();

    const events = (data.events || [])
      .filter(e => e.text && e.year)
      .map(e => {
        let img = '';
        const mainPage = e.pages?.[0];
        for (const p of (e.pages || [])) {
          const src = p.thumbnail?.source || p.originalimage?.source || '';
          if (src) { img = src.replace(/\/\d+px-/, '/400px-'); break; }
        }
        const url = mainPage?.content_urls?.desktop?.page || '';
        return { year: e.year, text: e.text, img, url };
      });

    const withImg = events.filter(e => e.img);
    const noImg   = events.filter(e => !e.img);
    randomShuffle(withImg);
    randomShuffle(noImg);
    otdEvents = [...withImg, ...noImg];
    otdIndex = 0;
    showOTD();
  } catch {
    $('otd').innerHTML = '<span style="color:var(--text-disabled);">&mdash;</span>';
  }
}

function showOTD() {
  if (!otdEvents.length) return;
  const el = $('otd');
  const ev = otdEvents[otdIndex];

  el.innerHTML = '';
  const label = document.querySelector('#otdBlock .section-label');
  if (label) label.textContent = `On This Day \u2014 ${ev.year}`;

  const wrap = document.createElement('div');
  wrap.className = 'otd-content';
  wrap.style.opacity = '0';

  if (ev.img) {
    const img = document.createElement('img');
    img.className = 'otd-img';
    img.src = `/img?url=${encodeURIComponent(ev.img)}`;
    img.onerror = function() { this.remove(); };
    wrap.appendChild(img);
  }

  const text = document.createElement(ev.url ? 'a' : 'div');
  text.className = 'otd-text';
  text.textContent = ev.text;
  if (ev.url) { text.href = ev.url; text.target = '_blank'; text.rel = 'noopener'; text.addEventListener('click', e => e.stopPropagation()); }
  wrap.appendChild(text);

  el.appendChild(wrap);
  wrap.offsetHeight;
  wrap.style.opacity = '1';
}

function advanceOTD() { if (otdEvents.length) { otdIndex = (otdIndex + 1) % otdEvents.length; showOTD(); } }
$('otdBlock').addEventListener('click', advanceOTD);
$('otdBlock').style.cursor = 'pointer';
setInterval(advanceOTD, INTERVALS.OTD_ADVANCE);


// ─── NEWS ───────────────────────────────────────────
let stories       = [];
let financeData    = {};
let currentIndex   = 0;
let slideTimer     = null;
let allCategories  = [];

const SKIP_TITLES  = ['puzzle','crossword','wordle','sudoku','quiz','horoscope','connections','spelling bee','strands','hints and answers','mini crossword','tips for'];
const SKIP_SOURCES = ['bianet'];

async function loadData() {
  try {
    const data = await (await fetch(`data.json?t=${Date.now()}`)).json();

    let worldStories = (data.stories || []).filter(s => {
      const t = (s.title || '').toLowerCase();
      const src = (s.source || '').toLowerCase();
      return !SKIP_SOURCES.some(sk => src.includes(sk)) && !SKIP_TITLES.some(sk => t.includes(sk));
    });

    let localStories = [];
    if (userCountry) {
      try {
        const cd = await (await fetch(`/api/country-news?cc=${userCountry}`)).json();
        localStories = (cd.stories || []).map(s => ({ ...s, local: true }));
      } catch {}
    }

    worldStories = worldStories.filter(s => s.image);
    localStories = localStories.filter(s => s.image);


    // Dedup before shuffle so count stays stable
    const seen = new Set();
    const dedup = arr => arr.filter(s => {
      const key = s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    worldStories = dedup(worldStories);
    localStories = dedup(localStories);

    randomShuffle(worldStories);
    randomShuffle(localStories);

    stories = [...worldStories, ...localStories.slice(0, LIMITS.LOCAL_STORIES)];

    const catSet = new Set();
    stories.forEach(s => { if (s.category) catSet.add(s.category); });
    allCategories = [...catSet].sort();

    const excluded = getPrefs().excludedCategories || [];
    if (excluded.length) {
      stories = stories.filter(s => !s.category || !excluded.includes(s.category));
    }

    // Update source count in info modal
    const srcCount = new Set((data.stories || []).map(s => s.source)).size;
    const el = $('sourceCount');
    if (el) el.textContent = srcCount;

    currentIndex = 0;
    renderNews();
    if (!slideTimer) slideTimer = setInterval(() => showNews(currentIndex + 1), slideMs);
  } catch {
    $('newsArea').innerHTML = '<div class="loading-state">Run fetch.py to load news</div>';
  }
}

function buildCard(story) {
  const card = document.createElement('div');
  card.className = 'news-card';

  let favicon = '';
  if (story.link || story.sourceUrl) {
    try {
      const domain = (story.link || story.sourceUrl).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const gFav = `/img?url=${encodeURIComponent(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`)}`;
      favicon = `<img src="/img?url=${encodeURIComponent(`https://icons.duckduckgo.com/ip3/${domain}.ico`)}" onerror="this.src='${gFav}'; this.onerror=function(){this.style.display='none'}" />`;
    } catch {}
  }

  const sourceHome = (story.sourceUrl || story.link || '').match(/^https?:\/\/[^/]+/)?.[0] || '';
  let src = sourceHome
    ? `${favicon}<a href="${escapeHtml(sourceHome)}" target="_blank" rel="noopener" class="news-source-link">${escapeHtml(decodeHtml(story.source))}</a>`
    : `${favicon}<span>${escapeHtml(decodeHtml(story.source))}</span>`;
  const agoText = timeAgo(story.pubDate);
  if (agoText) src += `<span class="news-ago">${agoText}</span>`;
  if (story.category) src += `<span class="news-cat">${escapeHtml(story.category)}</span>`;
  if (story.link) src += `<span class="news-share" data-url="${escapeHtml(story.link)}" data-title="${escapeHtml(story.title)}" title="Share"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="7" y="0" width="2" height="10"/><rect x="3" y="4" width="2" height="2"/><rect x="5" y="2" width="2" height="2"/><rect x="9" y="2" width="2" height="2"/><rect x="11" y="4" width="2" height="2"/><rect x="2" y="8" width="2" height="6"/><rect x="12" y="8" width="2" height="6"/><rect x="2" y="14" width="12" height="2"/></svg></span>`;

  const imgHtml = (story.image && getPrefs().newsImages !== false)
    ? `<div class="news-img-wrap"><img src="/img?url=${encodeURIComponent(story.image)}" onerror="this.parentElement.remove()" loading="eager" /></div>`
    : '';

  const validBullets = (story.bullets || []).filter(b => b && b !== 'Summary unavailable');
  const bullets = validBullets.length
    ? validBullets.slice(0, 3).map(b => `<div class="line"><span class="bullet">\u2014</span>${escapeAllowEm(decodeHtml(b))}</div>`).join('')
    : '';

  const headline = story.link
    ? `<a class="news-headline" href="${escapeHtml(story.link)}" target="_blank" rel="noopener">${escapeAllowEm(decodeHtml(story.title))}</a>`
    : `<div class="news-headline">${escapeAllowEm(decodeHtml(story.title))}</div>`;

  card.innerHTML =
    `<div class="news-src">${src}</div>` +
    `<div class="news-body-wrap">` +
      `<div class="news-text">${headline}<div class="news-body">${bullets}</div></div>` +
      imgHtml +
    `</div>`;

  const shareBtn = card.querySelector('.news-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = shareBtn.dataset.url;
      const title = shareBtn.dataset.title;
      if (navigator.share) {
        navigator.share({ title, url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(url).then(() => {
          const toast = document.createElement('div');
          toast.className = 'share-toast';
          toast.textContent = 'copied';
          shareBtn.style.position = 'relative';
          shareBtn.appendChild(toast);
          setTimeout(() => toast.remove(), 1500);
        });
      }
    });
  }

  return card;
}

function renderNews() {
  const prog = $('newsProg');
  prog.innerHTML = '';

  const pipCount = Math.min(stories.length, LIMITS.NEWS_PIPS);
  for (let i = 0; i < pipCount; i++) {
    const pip = document.createElement('span');
    pip.className = 'news-pip';
    prog.appendChild(pip);
  }

  const ctr = document.createElement('span');
  ctr.className = 'news-ctr';
  ctr.id = 'newsCtr';
  prog.appendChild(ctr);

  showNews(currentIndex);
}

function showNews(idx, direction = 'left') {
  if (!stories.length) return;
  const area = $('newsArea');

  const loading = area.querySelector('.loading-state');
  if (loading) loading.remove();

  const old = area.querySelector('.news-card.active');
  if (old) {
    old.classList.remove('active');
    old.classList.add(direction === 'left' ? 'exit-left' : 'exit-right');
    setTimeout(() => old.remove(), 400);
  }

  currentIndex = ((idx % stories.length) + stories.length) % stories.length;

  const card = buildCard(stories[currentIndex]);
  if (direction === 'right') card.style.transform = 'translateX(-40px)';
  area.appendChild(card);
  card.offsetHeight;
  card.classList.add('active');
  card.style.transform = '';

  const pips = document.querySelectorAll('.news-pip');
  const pipIdx = pips.length > 0 ? Math.floor(currentIndex / stories.length * pips.length) : 0;
  pips.forEach(p => { p.classList.remove('active', 'filling'); p.style.setProperty('--slide-ms', slideMs + 'ms'); });
  if (pips[pipIdx]) pips[pipIdx].classList.add('filling');
  for (let i = 0; i < pipIdx; i++) pips[i]?.classList.add('active');

  const ctr = $('newsCtr');
  if (ctr) ctr.textContent = `${currentIndex + 1}/${stories.length}`;
}

function resetSlide() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => showNews(currentIndex + 1, 'left'), slideMs);
}

$('newsArea').addEventListener('click', e => {
  if (e.target.closest('.settings-overlay')) return;
  if (stories.length) { showNews(currentIndex + 1, 'left'); resetSlide(); }
});

// Swipe left/right on news
{
  const area = $('newsArea');
  let startX = 0, startY = 0;
  area.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
  area.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return; // too short or vertical
    if (dx < 0) { showNews(currentIndex + 1, 'left'); resetSlide(); }
    else { showNews(currentIndex - 1, 'right'); resetSlide(); }
  }, { passive: true });
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); if (stories.length) { showNews(currentIndex + 1, 'left'); resetSlide(); } }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (stories.length) { showNews(currentIndex - 1, 'right'); resetSlide(); } }
});


// ─── TICKERS (shared) ───────────────────────────────
function tickerHTML(label, items) {
  const charCount = items.replace(/<[^>]*>/g, '').length;
  const imgCount  = (items.match(/<img/g) || []).length;
  const oneSetWidth = (charCount * 7) + (imgCount * 20);
  const screenWidth = window.innerWidth || 1400;

  // Always scroll — repeat items to fill the viewport
  const reps = Math.max(1, Math.ceil(screenWidth / Math.max(oneSetWidth, 1)));
  const half = items.repeat(reps);
  const halfWidth = oneSetWidth * reps;
  const speed = Math.max(20, Math.round(halfWidth / TICKER_PX_PER_SEC));
  const delay = -Math.floor(Math.random() * speed);
  return `<span class="ticker-label">${label}</span>` +
    `<div class="ticker-scroll-wrap"><span class="ticker-track auto-scroll" style="--ticker-speed:${speed}s; animation-delay:${delay}s;">` +
    half + half + `</span></div>`;
}

function formatPrice(price, isCurrency) {
  if (price > 999)  return (isCurrency ? '$' : '') + price.toLocaleString('en', { maximumFractionDigits: 0 });
  if (price > 10)   return (isCurrency ? '$' : '') + price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (isCurrency ? '$' : '') + price.toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}


// ─── FINANCE ────────────────────────────────────────
const DEFAULT_MARKETS = ['BTC', 'ETH', 'GOLD', 'OIL', 'S&P 500', 'NASDAQ', 'TSX', 'USD/CAD'];

function getActiveMarkets() {
  const prefs = getPrefs();
  const removed = prefs.removedDefaults || [];
  const base = DEFAULT_MARKETS.filter(m => !removed.includes(m));
  (prefs.customMarkets || []).forEach(m => { if (!base.includes(m)) base.push(m); });
  return (prefs.markets?.length > 0) ? prefs.markets : base;
}

function renderFinance() {
  const labels = getActiveMarkets();
  const bar = $('finTicker');
  let items = '', hasData = false;

  labels.forEach(label => {
    const d = financeData[label];
    let price = '---', change = '';

    if (d?.price) {
      hasData = true;
      price = formatPrice(d.price, !label.includes('/'));
      if (d.change != null) {
        const cls = d.change >= 0 ? 'up' : 'down';
        const sign = d.change >= 0 ? '+' : '';
        change = `<span class="fin-chg ${cls}">${sign}${d.change.toFixed(1)}%</span>`;
      }
    }

    const finUrl = `https://www.google.com/finance/quote/${encodeURIComponent(label)}`;
    items += `<a class="fin-item" href="${finUrl}" target="_blank" rel="noopener"><span class="fin-sym">${label}</span><span class="fin-price">${price}</span>${change}</a><span class="fin-sep">\u00B7</span>`;
  });

  if (!hasData) { bar.style.display = 'none'; return; }
  bar.innerHTML = tickerHTML('Markets', items);
  bar.style.display = 'flex';
}

async function fetchFinance() {
  try { financeData = await (await fetch('/api/finance')).json(); } catch {}

  const custom = (getPrefs().customMarkets || []).filter(m => !financeData[m]);
  if (custom.length) {
    await Promise.all(custom.map(async sym => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
        if (res.ok) financeData[sym] = await res.json();
      } catch {}
    }));
  }

  renderFinance();
}
setInterval(fetchFinance, INTERVALS.FINANCE);


// ─── SPORTS ─────────────────────────────────────────
const ALL_LEAGUES = [
  // Basketball
  { sport: 'basketball', league: 'nba',             tag: 'NBA',           country: 'USA' },
  { sport: 'basketball', league: 'wnba',            tag: 'WNBA',          country: 'USA' },
  // American Football
  { sport: 'football',   league: 'nfl',             tag: 'NFL',           country: 'USA' },
  { sport: 'football',   league: 'cfl',             tag: 'CFL',           country: 'Canada' },
  // Baseball
  { sport: 'baseball',   league: 'mlb',             tag: 'MLB',           country: 'USA' },
  // Hockey
  { sport: 'hockey',     league: 'nhl',             tag: 'NHL',           country: 'USA' },
  // Football — Europe top leagues
  { sport: 'soccer',     league: 'eng.1',           tag: 'PL',            country: 'England' },
  { sport: 'soccer',     league: 'eng.2',           tag: 'Championship',  country: 'England' },
  { sport: 'soccer',     league: 'esp.1',           tag: 'La Liga',       country: 'Spain' },
  { sport: 'soccer',     league: 'ger.1',           tag: 'Bundesliga',    country: 'Germany' },
  { sport: 'soccer',     league: 'ita.1',           tag: 'Serie A',       country: 'Italy' },
  { sport: 'soccer',     league: 'fra.1',           tag: 'Ligue 1',       country: 'France' },
  { sport: 'soccer',     league: 'por.1',           tag: 'Liga Portugal', country: 'Portugal' },
  { sport: 'soccer',     league: 'ned.1',           tag: 'Eredivisie',    country: 'Netherlands' },
  { sport: 'soccer',     league: 'bel.1',           tag: 'JPL',           country: 'Belgium' },
  { sport: 'soccer',     league: 'sco.1',           tag: 'SPFL',          country: 'Scotland' },
  { sport: 'soccer',     league: 'gre.1',           tag: 'Super League',  country: 'Greece' },
  { sport: 'soccer',     league: 'sui.1',           tag: 'Swiss SL',      country: 'Switzerland' },
  { sport: 'soccer',     league: 'aut.1',           tag: 'Austrian BL',   country: 'Austria' },
  { sport: 'soccer',     league: 'den.1',           tag: 'Superliga',     country: 'Denmark' },
  { sport: 'soccer',     league: 'swe.1',           tag: 'Allsvenskan',   country: 'Sweden' },
  { sport: 'soccer',     league: 'nor.1',           tag: 'Eliteserien',   country: 'Norway' },
  { sport: 'soccer',     league: 'cze.1',           tag: 'Czech Liga',    country: 'Czech Rep.' },
  // Football — rest of world
  { sport: 'soccer',     league: 'tur.1',           tag: 'Super Lig',     country: 'Turkey' },
  { sport: 'soccer',     league: 'sau.1',           tag: 'SPL',           country: 'Saudi Arabia' },
  { sport: 'soccer',     league: 'usa.1',           tag: 'MLS',           country: 'USA' },
  { sport: 'soccer',     league: 'bra.1',           tag: 'Brasileirao',   country: 'Brazil' },
  { sport: 'soccer',     league: 'arg.1',           tag: 'Liga Pro',      country: 'Argentina' },
  { sport: 'soccer',     league: 'mex.1',           tag: 'Liga MX',       country: 'Mexico' },
  { sport: 'soccer',     league: 'aus.1',           tag: 'A-League',      country: 'Australia' },
  { sport: 'soccer',     league: 'jpn.1',           tag: 'J1 League',     country: 'Japan' },
  { sport: 'soccer',     league: 'chn.1',           tag: 'CSL',           country: 'China' },
  { sport: 'soccer',     league: 'kor.1',           tag: 'K League',      country: 'South Korea' },
  // UEFA competitions
  { sport: 'soccer',     league: 'uefa.champions',  tag: 'UCL',           country: 'Europe' },
  { sport: 'soccer',     league: 'uefa.europa',     tag: 'UEL',           country: 'Europe' },
  { sport: 'soccer',     league: 'uefa.europa.conf',tag: 'UECL',          country: 'Europe' },
  // South American competitions
  { sport: 'soccer',     league: 'conmebol.libertadores', tag: 'Libertadores', country: 'S. America' },
  { sport: 'soccer',     league: 'conmebol.sudamericana', tag: 'Sudamericana', country: 'S. America' },
  // Tennis
  { sport: 'tennis',     league: 'atp',             tag: 'ATP',           country: 'World' },
  { sport: 'tennis',     league: 'wta',             tag: 'WTA',           country: 'World' },
  // Golf
  { sport: 'golf',       league: 'pga',             tag: 'PGA',           country: 'USA' },
  // Motorsport
  { sport: 'racing',     league: 'f1',              tag: 'F1',            country: 'World' },
  { sport: 'racing',     league: 'irl',             tag: 'IndyCar',       country: 'USA' },
  { sport: 'racing',     league: 'motogp',          tag: 'MotoGP',        country: 'World' },
  // MMA / Boxing
  { sport: 'mma',        league: 'ufc',             tag: 'UFC',           country: 'USA' },
  // Cricket
  { sport: 'cricket',    league: 'ipl',             tag: 'IPL',           country: 'India' },
  // Rugby
  { sport: 'rugby',      league: 'super-rugby',     tag: 'Super Rugby',   country: 'World' },
  { sport: 'rugby',      league: 'top14',           tag: 'Top 14',        country: 'France' },
  { sport: 'rugby',      league: 'prem',            tag: 'Prem Rugby',    country: 'England' },
  { sport: 'rugby-league', league: 'nrl',           tag: 'NRL',           country: 'Australia' },
];

function parseGames(events, tag) {
  return events.map(e => {
    const comp = e.competitions[0];
    const [home, away] = [comp.competitors[0], comp.competitors[1]];
    const state = comp.status.type;
    const live = state.state === 'in', final = state.state === 'post';
    if (!live && !final) return '';

    const awayWin = final && parseInt(away.score) > parseInt(home.score);
    const homeWin = final && parseInt(home.score) > parseInt(away.score);
    const logo = team => team.logo ? `<img class="sport-logo" src="/img?url=${encodeURIComponent(team.logo)}" onerror="this.style.display='none'" />` : '';

    const gameUrl = e.links?.[0]?.href || '';
    const gameTag = gameUrl ? 'a' : 'span';
    const gameHref = gameUrl ? ` href="${gameUrl}" target="_blank" rel="noopener"` : '';
    return `<${gameTag} class="sport-game"${gameHref}>` +
      `<span class="sport-league">${tag}</span>` +
      `<span class="sport-team${awayWin ? ' sport-winner' : ''}">${logo(away.team)}${away.team.abbreviation}<span class="sport-score">${away.score || '-'}</span></span>` +
      `<span class="sport-at">@</span>` +
      `<span class="sport-team${homeWin ? ' sport-winner' : ''}">${logo(home.team)}${home.team.abbreviation}<span class="sport-score">${home.score || '-'}</span></span>` +
      (live ? `<span class="sport-status sport-live"> <span class="sport-blink">●</span> ${escapeHtml(state.shortDetail || 'LIVE')}</span>` : '') +
      `</${gameTag}><span class="sport-sep">\u00B7</span>`;
  }).join('');
}

async function fetchSports() {
  const bar = $('sportsTicker');
  const prefs = getPrefs();
  const active = ALL_LEAGUES.filter(lg => !prefs.sports?.length || prefs.sports.includes(lg.tag));

  const results = await Promise.all(active.map(lg =>
    fetch(`https://site.api.espn.com/apis/site/v2/sports/${lg.sport}/${lg.league}/scoreboard`)
      .then(r => r.json())
      .then(d => d.events?.length ? parseGames(d.events, lg.tag) : '')
      .catch(() => '')
  ));

  const all = results.join('');
  if (!all) { bar.style.display = 'none'; return; }
  bar.innerHTML = tickerHTML('Scores', all);
  bar.style.display = 'flex';
}
setInterval(fetchSports, INTERVALS.SPORTS);


// ─── PREDICTIONS ────────────────────────────────────
async function fetchPredictions() {
  const bar = $('polyTicker');
  let items = '';
  const filtered = [];

  try {
    const data = await (await fetch(`/api/proxy?url=${encodeURIComponent('https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=' + POLYMARKET_PCT_RANGE[1] * 2)}`)).json();

    for (const ev of data) {
      if (!ev.markets?.length) continue;

      let bestQuestion = '', bestPct = 0, bestImg = ev.image || '';
      for (const m of ev.markets) {
        const prices = JSON.parse(m.outcomePrices || '[]');
        const pct = prices.length ? Math.round(parseFloat(prices[0]) * 100) : 0;
        if (pct > bestPct && pct < 96) {
          bestPct = pct;
          bestQuestion = m.question || m.groupItemTitle || ev.title || '';
        }
      }

      if (bestPct < POLYMARKET_PCT_RANGE[0] || bestPct > POLYMARKET_PCT_RANGE[1] || !bestQuestion) continue;

      const display = (ev.markets.length > 1 && ev.title)
        ? `${ev.title}: ${bestQuestion.replace(/^Will /i, '').replace(/\?.*$/, '')}`
        : bestQuestion;

      filtered.push({ display, bestPct, bestImg: ev.image || '', slug: ev.slug || '' });
    }

    randomShuffle(filtered);
    for (const p of filtered.slice(0, LIMITS.POLYMARKET)) {
      const icon = p.bestImg ? `<img class="poly-icon" src="/img?url=${encodeURIComponent(p.bestImg)}" onerror="this.style.display='none'" />` : '';
      const tag = p.slug ? 'a' : 'span';
      const href = p.slug ? ` href="https://polymarket.com/event/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener"` : '';
      items += `<${tag} class="poly-item"${href}>${icon}<span class="poly-q">${escapeHtml(p.display)}</span><span class="poly-pct">${p.bestPct}%</span></${tag}><span class="poly-sep">\u00B7</span>`;
    }
  } catch {}

  if (!items) { bar.style.display = 'none'; return; }
  bar.innerHTML = tickerHTML('Predict', items);
  bar.style.display = 'flex';
}
fetchPredictions();
setInterval(fetchPredictions, INTERVALS.PREDICTIONS);


// ─── WALL ───────────────────────────────────────────
let wallPosts   = [];
let wallPostIds = new Set();
let replyToId   = null;
let replyToName = null;
let isSubmitting = false;

const nameInput      = $('wName');
const messageInput   = $('wMsg');
const charCounter    = $('wChars');
const errorDisplay   = $('wErr');
const sendButton     = $('wSend');
const postsContainer = $('wPosts');
const emptyMessage   = $('wEmpty');
const replyBar       = $('wReplyBar');
const replyLabel     = $('wReplyText');

const savedName = localStorage.getItem('teletext-wall-name');
if (savedName) nameInput.value = savedName;
nameInput.addEventListener('input', () => localStorage.setItem('teletext-wall-name', nameInput.value));
messageInput.addEventListener('input', () => { charCounter.textContent = messageInput.value.length; });
messageInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPost(); } });
sendButton.addEventListener('click', submitPost);
$('wReplyX').addEventListener('click', clearReply);

function setReply(id, name) {
  replyToId = id;
  replyToName = name;
  replyLabel.textContent = `\u21B3 ${name}`;
  replyBar.classList.add('active');
  messageInput.focus();
}

function clearReply() {
  replyToId = null;
  replyToName = null;
  replyBar.classList.remove('active');
}

setInterval(fetchPosts, INTERVALS.WALL_POLL);

async function submitPost() {
  if (isSubmitting) return;
  const msg = messageInput.value.trim();
  if (!msg) return;

  isSubmitting = true;
  sendButton.disabled = true;
  errorDisplay.textContent = '';

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim(), message: msg, replyTo: replyToId, replyName: replyToName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errorDisplay.textContent = data.error || 'error'; return; }

    wallPosts.push(data);
    wallPostIds.add(data.id);
    renderPosts();
    messageInput.value = '';
    charCounter.textContent = '0';
    clearReply();
  } catch {
    errorDisplay.textContent = 'network error';
  } finally {
    isSubmitting = false;
    sendButton.disabled = false;
  }
}

async function fetchPosts() {
  try {
    const data = await (await fetch('/api/posts')).json();
    const posts = data.posts || [];
    let changed = false;

    for (const p of posts) {
      if (!wallPostIds.has(p.id)) {
        wallPosts.push(p);
        wallPostIds.add(p.id);
        changed = true;
      } else {
        const existing = wallPosts.find(x => x.id === p.id);
        if (existing && existing.extendedCount !== p.extendedCount) changed = true;
        if (existing) { existing.extendedCount = p.extendedCount; existing.timestamp = p.timestamp; }
      }
    }

    const serverIds = new Set(posts.map(p => p.id));
    const previousCount = wallPosts.length;
    wallPosts = wallPosts.filter(p => serverIds.has(p.id));
    if (wallPosts.length !== previousCount) changed = true;
    wallPostIds = new Set(wallPosts.map(p => p.id));
    if (changed) renderPosts();
    if (data.online !== undefined) {
      $('wOnlineSidebar').textContent = data.online;
    }
  } catch {}
}


function renderPosts() {
  const seen = new Set();
  wallPosts = wallPosts.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  wallPostIds = new Set(wallPosts.map(p => p.id));

  const sorted = [...wallPosts].sort((a, b) => b.timestamp - a.timestamp);
  postsContainer.innerHTML = '';

  for (const post of sorted) {
    const displayName = post.name || 'anon';
    const pct = calcLifespan(post.timestamp, post.extendedCount);

    const voteBtn = el('button', `w-btn${post.isExtended ? ' voted' : ''}`, {
      text: `\u2665 ${post.extendedCount || 0}`,
      on: { click: e => { e.stopPropagation(); votePost(post.id, voteBtn, post); } },
    });

    postsContainer.appendChild(
      el('div', 'w-post', { data: { id: post.id }, children: [
        el('div', 'w-post-head', { children: [
          el('div', 'w-post-who', { children: [
            el('span', 'w-post-name', { text: displayName }),
            post.country ? el('span', 'w-post-flag', { text: countryFlag(post.country) }) : null,
          ]}),
          el('span', 'w-post-when', { text: timestampAgo(post.timestamp) }),
        ]}),

        (post.reply_to && post.reply_name)
          ? el('div', 'w-post-ref', {
              text: `\u21B3 ${post.reply_name}`,
              on: { click: e => { e.stopPropagation(); document.querySelector(`.w-post[data-id="${post.reply_to}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
            })
          : null,

        el('div', 'w-post-text', {
          text: post.message,
          on: { click: () => setReply(post.id, displayName) },
        }),

        el('div', 'w-post-acts', { children: [
          voteBtn,
          el('button', 'w-btn', { text: 'reply', on: { click: e => { e.stopPropagation(); setReply(post.id, displayName); } } }),
          el('button', `w-btn${post.isReported ? ' reported' : ''}`, {
            text: '\u26A0', title: post.isReported ? 'reported' : 'report',
            on: { click: e => { e.stopPropagation(); reportPost(post.id, e.currentTarget); } },
          }),
        ]}),

        el('div', 'w-life', { children: [
          el('div', `w-life-fill${pct < 20 ? ' fading' : ''}`, { style: { width: `${pct}%` } }),
        ]}),
      ]}),
    );
  }

  checkEmpty();
}

async function votePost(id, btn, post) {
  try {
    const res = await fetch(`/api/posts/${id}/extend`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { btn.textContent = `\u2665 ${data.extendedCount}`; btn.classList.toggle('voted'); post.extendedCount = data.extendedCount; }
  } catch {}
}

async function reportPost(id, btn) {
  try {
    const res = await fetch(`/api/posts/${id}/report`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      btn.classList.add('reported');
      btn.title = 'reported';
      if (data.deleted) { wallPosts = wallPosts.filter(p => p.id !== id); wallPostIds.delete(id); renderPosts(); }
    }
  } catch {}
}

function calcLifespan(ts, extendedCount) {
  const life = MS.DAY + (Math.floor((extendedCount || 0) / 5) * MS.DAY);
  return Math.max(0, (life - (Date.now() - ts)) / life) * 100;
}

function checkEmpty() { emptyMessage.style.display = wallPosts.length ? 'none' : 'block'; }

setInterval(() => {
  document.querySelectorAll('.w-post-when').forEach(el => {
    const postEl = el.closest('.w-post');
    const post = postEl && wallPosts.find(x => x.id === postEl.dataset.id);
    if (post) el.textContent = timestampAgo(post.timestamp);
  });
}, INTERVALS.TIMESTAMPS);


// ─── SETTINGS ───────────────────────────────────────
const ALL_MODULES = [
  { id: 'news',    name: 'News',        desc: 'headline carousel' },
  { id: 'finance', name: 'Finance',     desc: 'market ticker' },
  { id: 'sports',  name: 'Sports',      desc: 'live scores' },
  { id: 'predict', name: 'Predictions', desc: 'Polymarket bets' },
  { id: 'wall',    name: 'Wall',        desc: 'public message board' },
];

const THEMES_DARK  = [{ id: 'midnight', name: 'Midnight', desc: 'teal on dark' }, { id: 'teletext-og', name: 'Teletext OG', desc: 'classic Ceefax' }, { id: 'ember', name: 'Ember', desc: 'amber on dark' }];
const THEMES_LIGHT = [{ id: 'paper', name: 'Paper', desc: 'editorial cream' }, { id: 'brutalist', name: 'Brutalist', desc: 'bold contrast' }, { id: 'minimal', name: 'Minimal', desc: 'whisper quiet' }];

const THEME_DEFAULTS = {
  'midnight':    { bg: '#0e1214', fg: '#e8eaec', accent: '#7EBEC5', green: '#6aaa80', red: '#c47070', fontSans: 1, fontMono: 1 },
  'paper':       { bg: '#f8f5f0', fg: '#1a1a1a', accent: '#8b4513', green: '#2d6a3f', red: '#b8433a', fontSans: 2, fontMono: 2 },
  'teletext-og': { bg: '#000000', fg: '#ffffff', accent: '#e8e87c', green: '#7ccf8e', red: '#e8827c', fontSans: 6, fontMono: 6 },
  'brutalist':   { bg: '#ffffff', fg: '#000000', accent: '#cc0000', green: '#008000', red: '#ff0000', fontSans: 3, fontMono: 3 },
  'minimal':     { bg: '#fafafa', fg: '#222222', accent: '#997755', green: '#66aa77', red: '#aa6666', fontSans: 4, fontMono: 4 },
  'ember':       { bg: '#12100e', fg: '#d4c8b0', accent: '#c8a96e', green: '#7a9a6a', red: '#a87060', fontSans: 5, fontMono: 5 },
};

const FONT_OPTIONS = [
  { label: 'System', sans: 'system-ui, sans-serif', mono: "'Menlo', monospace" },
  { label: 'Open Sans', sans: "'Open Sans', system-ui, sans-serif", mono: "'Departure Mono', 'Source Code Pro', 'Menlo', monospace" },
  { label: 'Source Serif', sans: "'Source Serif 4', 'Georgia', serif", mono: "'Source Code Pro', 'Menlo', monospace" },
  { label: 'Inter', sans: "'Inter', 'Helvetica', sans-serif", mono: "'JetBrains Mono', 'Menlo', monospace" },
  { label: 'DM Sans', sans: "'DM Sans', system-ui, sans-serif", mono: "'DM Mono', 'Menlo', monospace" },
  { label: 'Outfit', sans: "'Outfit', system-ui, sans-serif", mono: "'IBM Plex Mono', 'Menlo', monospace" },
  { label: 'Doto', sans: "'Doto', monospace", mono: "'Doto', monospace" },
];

let activeSettingsTab = 'content';

function applyModules() {
  const active = getPrefs().modules || ALL_MODULES.map(m => m.id);
  ALL_MODULES.forEach(mod => {
    if (mod.id === 'wall') {
      const isMobile = window.innerWidth <= 900;
      const wallEl = document.querySelector('.wall');
      const handleEl = $('resizeRight');
      const show = active.includes('wall') || isMobile;
      if (wallEl) wallEl.style.display = show ? '' : 'none';
      if (handleEl) handleEl.style.display = (active.includes('wall') && !isMobile) ? '' : 'none';
    } else {
      const el = $('mod' + mod.id.charAt(0).toUpperCase() + mod.id.slice(1));
      if (el) el.classList.toggle('hidden', !active.includes(mod.id));
    }
  });
}

// ─── TAB BUILDERS ────────────────────────────────────

const SIDEBAR_SECTIONS = [
  { id: 'weather',    name: 'Weather',     sel: '.weather-block' },
  { id: 'holidays',   name: 'Holidays',    sel: '.holidays-block' },
  { id: 'countdowns', name: 'Countdowns',  sel: '.countdown-block' },
  { id: 'otd',        name: 'On This Day', sel: '.otd-block' },
];

function applySidebar() {
  const prefs = getPrefs();
  // Clean up old key from previous implementation
  if (prefs.sidebar) { delete prefs.sidebar; savePrefs(prefs); }
  const hidden = prefs.hiddenSidebar || [];
  SIDEBAR_SECTIONS.forEach(s => {
    const el = document.querySelector(s.sel);
    if (el) el.style.display = hidden.includes(s.id) ? 'none' : '';
  });
}

function buildContentTab(container) {
  let html = '';
  html += '<div class="set-sec">Modules</div>';
  html += '<div class="set-hint">Toggle what appears on the page</div>';
  html += '<div class="set-grid">' + renderGrid(ALL_MODULES, {
    dataAttr: 'data-mod',
    isActive: (id, prefs) => (prefs.modules || ALL_MODULES.map(m => m.id)).includes(id),
    renderLabel: m => `${m.name} <span style="opacity:0.5;">${m.desc}</span>`,
  }) + '</div>';

  // Sidebar sections
  html += '<div class="set-sec">Sidebar</div>';
  html += '<div class="set-hint">Toggle sidebar widgets</div>';
  html += '<div class="set-grid">' + renderGrid(SIDEBAR_SECTIONS, {
    dataAttr: 'data-side',
    isActive: (id, prefs) => !(prefs.hiddenSidebar || []).includes(id),
    renderLabel: s => s.name,
  }) + '</div>';

  // News images toggle
  const showImg = getPrefs().newsImages !== false;
  html += '<div class="set-sec">News Display</div>';
  html += '<div class="set-grid">' +
    `<div class="set-item${showImg ? ' on' : ''}" data-newsimg style="min-width:100%;">` +
    `<span class="set-check">${showImg ? '\u25CF' : '\u25CB'}</span>` +
    `<span>Show images</span></div>` +
    '</div>';

  html += '<div class="set-sec">News Categories</div>';
  if (!allCategories.length) {
    html += '<div class="set-hint">Load news first to see categories</div>';
  } else {
    html += '<div class="set-hint">Exclude categories you don\'t want</div>';
    html += '<div class="set-grid">' + renderGrid(allCategories, {
      dataAttr: 'data-cat',
      isActive: (cat, prefs) => !(prefs.excludedCategories || []).includes(cat),
      renderLabel: cat => escapeHtml(cat),
    }) + '</div>';
  }

  // Countdowns
  const prefs = getPrefs();
  const countdowns = getCountdowns();
  const removed = prefs.removedCountdowns || [];
  html += '<div class="set-sec">Countdowns</div>';
  html += '<div class="set-hint">Manage countdown timers</div>';
  html += '<div class="set-grid">';
  countdowns.forEach(c => {
    html += `<div class="set-item on" style="justify-content:space-between;min-width:100%;">` +
      `<span>${escapeHtml(c.name)} <span style="opacity:0.4;">${c.date}</span></span>` +
      `<span class="set-remove cd-remove" data-cdremove="${escapeHtml(c.id)}" title="Remove" style="opacity:1;">\u00D7</span></div>`;
  });
  html += '</div>';

  // Add countdown
  html += '<div class="set-add-row" style="position:relative;">';
  html += '<input type="text" class="set-add-input" id="_cdNameInput" placeholder="Search events..." autocomplete="off">';
  html += '<div class="set-dropdown" id="_cdDropdown"></div>';
  html += '</div>';

  container.innerHTML = html;

  bindGrid(container, 'data-mod', (id, el, prefs) => {
    if (!prefs.modules) prefs.modules = ALL_MODULES.map(m => m.id);
    const idx = prefs.modules.indexOf(id);
    if (idx !== -1) prefs.modules.splice(idx, 1); else prefs.modules.push(id);
    toggleItem(el, prefs.modules.includes(id));
    savePrefs(prefs);
    applyModules();
  });

  bindGrid(container, 'data-cat', (cat, el, prefs) => {
    if (!prefs.excludedCategories) prefs.excludedCategories = [];
    const idx = prefs.excludedCategories.indexOf(cat);
    if (idx !== -1) prefs.excludedCategories.splice(idx, 1); else prefs.excludedCategories.push(cat);
    toggleItem(el, !prefs.excludedCategories.includes(cat));
    savePrefs(prefs);
  });

  // News image toggle
  const newsImgBtn = container.querySelector('[data-newsimg]');
  if (newsImgBtn) {
    newsImgBtn.addEventListener('click', () => {
      const prefs = getPrefs();
      prefs.newsImages = !(prefs.newsImages !== false);
      toggleItem(newsImgBtn, prefs.newsImages !== false);
      savePrefs(prefs);
      if (stories.length) {
        const area = $('newsArea');
        area.innerHTML = '';
        const card = buildCard(stories[currentIndex]);
        card.classList.add('active');
        area.appendChild(card);
      }
    });
  }

  // Sidebar sections
  bindGrid(container, 'data-side', (id, el, prefs) => {
    if (!prefs.hiddenSidebar) prefs.hiddenSidebar = [];
    const idx = prefs.hiddenSidebar.indexOf(id);
    if (idx !== -1) prefs.hiddenSidebar.splice(idx, 1); else prefs.hiddenSidebar.push(id);
    toggleItem(el, !prefs.hiddenSidebar.includes(id));
    savePrefs(prefs);
    applySidebar();
  });

  // Countdown toggles (remove defaults)
  container.querySelectorAll('.cd-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.cdremove;
      const prefs = getPrefs();
      // Check if it's a default or custom
      if (DEFAULT_COUNTDOWNS.find(c => c.id === id)) {
        if (!prefs.removedCountdowns) prefs.removedCountdowns = [];
        if (!prefs.removedCountdowns.includes(id)) prefs.removedCountdowns.push(id);
      } else {
        prefs.customCountdowns = (prefs.customCountdowns || []).filter(c => c.id !== id);
      }
      savePrefs(prefs);
      renderCountdowns();
      buildContentTab(container);
    });
  });

  // Event search dropdown for countdowns
  const cdNameInput = container.querySelector('#_cdNameInput');
  const cdDropdown = container.querySelector('#_cdDropdown');
  if (cdNameInput && cdDropdown) {
    let cdSearchTimer = null;
    cdNameInput.addEventListener('input', () => {
      const q = cdNameInput.value.trim();
      if (q.length < 3) { cdDropdown.style.display = 'none'; return; }
      clearTimeout(cdSearchTimer);
      cdSearchTimer = setTimeout(async () => {
        cdDropdown.innerHTML = '<div class="set-dropdown-item" style="opacity:0.4;">Searching...</div>';
        cdDropdown.style.display = 'block';
        const results = await searchEvents(q);
        if (!results.length) {
          cdDropdown.innerHTML = '<div class="set-dropdown-item" style="opacity:0.4;">No events found</div>';
          return;
        }
        cdDropdown.innerHTML = results.map(r =>
          `<div class="set-dropdown-item" data-evname="${escapeHtml(r.name)}" data-evdate="${r.date}">${escapeHtml(r.name)} <span style="opacity:0.4;">${r.date}</span></div>`
        ).join('');
        cdDropdown.querySelectorAll('[data-evname]').forEach(item => {
          item.addEventListener('click', () => {
            const prefs = getPrefs();
            if (!prefs.customCountdowns) prefs.customCountdowns = [];
            prefs.customCountdowns.push({ id: 'cd_' + Date.now(), name: item.dataset.evname, date: item.dataset.evdate });
            savePrefs(prefs);
            cdDropdown.style.display = 'none';
            cdNameInput.value = '';
            renderCountdowns();
            buildContentTab(container);
          });
        });
      }, 400);
    });
    cdNameInput.addEventListener('blur', () => { setTimeout(() => { cdDropdown.style.display = 'none'; }, 200); });
  }
}

function buildMarketsTab(container) {
  const prefs = getPrefs();
  const removed = prefs.removedDefaults || [];
  const allSyms = [...DEFAULT_MARKETS.filter(m => !removed.includes(m))];
  (prefs.customMarkets || []).forEach(m => { if (!allSyms.includes(m)) allSyms.push(m); });

  let html = '';

  const groups = {};
  allSyms.forEach(sym => {
    const g = (MARKET_META[sym] || {}).group || 'Custom';
    if (!groups[g]) groups[g] = [];
    groups[g].push(sym);
  });

  MARKET_GROUP_ORDER.forEach(g => {
    if (!groups[g] || !groups[g].length) return;
    html += `<div class="set-group">${g}</div>`;
    html += '<div class="set-grid">' + renderGrid(groups[g], {
      dataAttr: 'data-sym',
      isActive: (sym) => !prefs.markets?.length || prefs.markets.includes(sym),
      renderLabel: sym => {
        const meta = MARKET_META[sym];
        const label = meta ? `${sym} <span style="opacity:0.5;">${meta.name}</span>` : sym;
        return `${label}<span class="set-remove" data-remove="${escapeHtml(sym)}" title="Remove">\u00D7</span>`;
      },
    }) + '</div>';
  });

  html += '<div class="set-add-row" style="position:relative;">';
  html += '<input type="text" class="set-add-input" id="_addMarketInput" placeholder="Search or type a symbol..." autocomplete="off">';
  html += '<button class="set-add-btn" id="_addMarketBtn">Add</button>';
  html += '<div class="set-dropdown" id="_marketDropdown"></div>';
  html += '</div>';

  if (removed.length) {
    html += `<div class="set-hint" style="cursor:pointer;text-decoration:underline;" id="_restoreDefaults">Restore removed defaults (${removed.length})</div>`;
  }

  container.innerHTML = html;

  bindGrid(container, 'data-sym', (sym, el, prefs) => {
    if (!prefs.markets?.length) prefs.markets = [...allSyms];
    const idx = prefs.markets.indexOf(sym);
    if (idx !== -1) {
      prefs.markets.splice(idx, 1);
      if (DEFAULT_MARKETS.includes(sym)) {
        if (!prefs.removedDefaults) prefs.removedDefaults = [];
        if (!prefs.removedDefaults.includes(sym)) prefs.removedDefaults.push(sym);
      }
      if ((prefs.customMarkets || []).includes(sym)) {
        prefs.customMarkets = prefs.customMarkets.filter(m => m !== sym);
      }
    } else {
      prefs.markets.push(sym);
      if (prefs.removedDefaults) prefs.removedDefaults = prefs.removedDefaults.filter(m => m !== sym);
    }
    if (prefs.markets.length >= allSyms.length) prefs.markets = [];
    toggleItem(el, !prefs.markets?.length || prefs.markets.includes(sym));
    savePrefs(prefs);
  });

  // Remove buttons
  container.querySelectorAll('.set-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sym = btn.dataset.remove;
      const prefs = getPrefs();
      if (DEFAULT_MARKETS.includes(sym)) {
        if (!prefs.removedDefaults) prefs.removedDefaults = [];
        if (!prefs.removedDefaults.includes(sym)) prefs.removedDefaults.push(sym);
      }
      if ((prefs.customMarkets || []).includes(sym)) {
        prefs.customMarkets = prefs.customMarkets.filter(m => m !== sym);
      }
      if (prefs.markets?.length) prefs.markets = prefs.markets.filter(m => m !== sym);
      savePrefs(prefs);
      buildMarketsTab(container);
    });
  });

  const addBtn = container.querySelector('#_addMarketBtn');
  const addInput = container.querySelector('#_addMarketInput');
  if (addBtn && addInput) {
    const doAdd = () => {
      const val = addInput.value.trim().toUpperCase();
      if (!val) return;
      const prefs = getPrefs();
      if (!prefs.customMarkets) prefs.customMarkets = [];
      if (!prefs.customMarkets.includes(val) && !DEFAULT_MARKETS.includes(val)) {
        prefs.customMarkets.push(val);
        savePrefs(prefs);
      }
      addInput.value = '';
      buildMarketsTab(container);
    };
    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { doAdd(); dropdown.style.display = 'none'; } });

    const dropdown = container.querySelector('#_marketDropdown');
    let searchTimer = null;
    addInput.addEventListener('input', () => {
      const q = addInput.value.trim();
      if (!q) { dropdown.style.display = 'none'; return; }

      // Local matches first (instant)
      const local = Object.entries(MARKET_META)
        .filter(([sym, m]) => !allSyms.includes(sym) && (sym.toLowerCase().includes(q.toLowerCase()) || m.name.toLowerCase().includes(q.toLowerCase())))
        .slice(0, 4)
        .map(([sym, m]) => ({ sym, name: m.name, type: m.group }));
      renderDropdown(local);

      // Live search (debounced)
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
          const data = await (await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)).json();
          const results = (data.quotes || [])
            .filter(r => r.symbol && !allSyms.includes(r.symbol))
            .slice(0, 8)
            .map(r => ({ sym: r.symbol, name: r.shortname || r.longname || '', type: r.quoteType || '' }));
          // Merge local + live, dedup
          const seen = new Set(local.map(r => r.sym));
          const merged = [...local, ...results.filter(r => !seen.has(r.sym))].slice(0, 8);
          renderDropdown(merged);
        } catch {}
      }, 300);

      function renderDropdown(items) {
        if (!items.length) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = items.map(r =>
          `<div class="set-dropdown-item" data-addsym="${escapeHtml(r.sym)}">${escapeHtml(r.sym)} <span style="opacity:0.5;">${escapeHtml(r.name)}</span> <span style="opacity:0.3;">${escapeHtml(r.type)}</span></div>`
        ).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.set-dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            const sym = item.dataset.addsym;
            const prefs = getPrefs();
            if (!prefs.customMarkets) prefs.customMarkets = [];
            if (!prefs.customMarkets.includes(sym) && !DEFAULT_MARKETS.includes(sym)) prefs.customMarkets.push(sym);
            if (prefs.removedDefaults) prefs.removedDefaults = prefs.removedDefaults.filter(m => m !== sym);
            savePrefs(prefs);
            addInput.value = '';
            dropdown.style.display = 'none';
            buildMarketsTab(container);
          });
        });
      }
    });
    addInput.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); });
  }

  const restoreEl = container.querySelector('#_restoreDefaults');
  if (restoreEl) {
    restoreEl.addEventListener('click', () => {
      const prefs = getPrefs();
      prefs.removedDefaults = [];
      prefs.markets = [];
      savePrefs(prefs);
      buildMarketsTab(container);
    });
  }
}

function buildSportsTab(container) {
  let html = '';

  SPORT_GROUPS.forEach(sg => {
    const leagues = ALL_LEAGUES.filter(lg => lg.sport === sg.key);
    if (!leagues.length) return;
    html += `<div class="set-group">${sg.label}</div>`;
    html += '<div class="set-grid">' + renderGrid(leagues, {
      dataAttr: 'data-lg',
      isActive: (tag, prefs) => !prefs.sports?.length || prefs.sports.includes(tag),
      renderLabel: lg => `${lg.tag} <span style="opacity:0.5;">${lg.country}</span>`,
    }) + '</div>';
  });

  container.innerHTML = html;

  bindGrid(container, 'data-lg', (tag, el, prefs) => {
    if (!prefs.sports?.length) prefs.sports = ALL_LEAGUES.map(l => l.tag);
    const idx = prefs.sports.indexOf(tag);
    if (idx !== -1) prefs.sports.splice(idx, 1); else prefs.sports.push(tag);
    if (prefs.sports.length === ALL_LEAGUES.length) prefs.sports = [];
    toggleItem(el, !prefs.sports?.length || prefs.sports.includes(tag));
    savePrefs(prefs);
  });

}

function buildDisplayTab(container) {
  const prefs = getPrefs();
  let html = '';

  // Themes
  html += '<div class="set-sec">Theme</div>';
  const current = localStorage.getItem('teletext-theme') || 'midnight';
  const themeCol = (themes) => themes.map(t => {
    const on = t.id === current;
    return `<div class="set-item set-theme-item${on ? ' on' : ''}" data-pick="${t.id}">` +
      `<span class="set-check">${on ? '\u25CF' : '\u25CB'}</span>` +
      `<span>${t.name} <span style="opacity:0.5;">${t.desc}</span></span></div>`;
  }).join('');
  const customOn = current === 'custom';
  html += `<div style="display:flex;gap:16px;width:100%;padding:6px 0 12px;">` +
    `<div style="flex:1;"><div class="set-hint" style="margin-bottom:6px;">Dark</div>${themeCol(THEMES_DARK)}</div>` +
    `<div style="flex:1;"><div class="set-hint" style="margin-bottom:6px;">Light</div>${themeCol(THEMES_LIGHT)}</div>` +
    `</div>`;

  // Custom theme
  html += '<div class="set-sec">Custom Theme</div>';
  const baseTheme = current !== 'custom' ? (THEME_DEFAULTS[current] || THEME_DEFAULTS.midnight) : THEME_DEFAULTS.midnight;
  const ct = prefs.customTheme || { ...baseTheme };
  const colorFields = [
    { key: 'bg', label: 'Background' },
    { key: 'fg', label: 'Text' },
    { key: 'accent', label: 'Accent' },
    { key: 'green', label: 'Positive' },
    { key: 'red', label: 'Negative' },
  ];
  html += '<div class="set-color-row">';
  colorFields.forEach(f => {
    html += `<label class="set-color-field"><span class="set-color-label">${f.label}</span>` +
      `<input type="color" class="set-color-input" data-ckey="${f.key}" value="${ct[f.key]}"></label>`;
  });
  html += '</div>';

  // Font pickers
  html += '<div style="display:flex;gap:10px;padding:6px 0;">';
  html += '<label class="set-color-field"><span class="set-color-label">Body font</span><select class="set-font-select" id="_fontSans">';
  FONT_OPTIONS.forEach((f, i) => { html += `<option value="${i}"${(ct.fontSans || 0) === i ? ' selected' : ''}>${f.label}</option>`; });
  html += '</select></label>';
  html += '<label class="set-color-field"><span class="set-color-label">Mono font</span><select class="set-font-select" id="_fontMono">';
  FONT_OPTIONS.forEach((f, i) => { html += `<option value="${i}"${(ct.fontMono || 0) === i ? ' selected' : ''}>${f.label}</option>`; });
  html += '</select></label>';
  html += '</div>';

  html += `<div class="set-item${customOn ? ' on' : ''}" id="_applyCustom" style="cursor:pointer;padding:8px 0;">` +
    `<span class="set-check">${customOn ? '\u25CF' : '\u25CB'}</span><span>Use custom theme</span></div>`;

  // Slideshow speed
  html += '<div class="set-sec">Slideshow Speed</div>';
  html += '<div class="set-hint">News card auto-advance interval</div>';
  const curSlide = prefs.slideInterval || slideMs;
  const slideLabel = curSlide >= 60000 ? `${Math.round(curSlide / 60000)}m` : `${Math.round(curSlide / 1000)}s`;
  html += '<div class="set-slider-row">';
  html += '<span class="set-slider-label">5s</span>';
  html += `<input type="range" class="set-slider" id="_slideSlider" min="5000" max="60000" step="1000" value="${curSlide}">`;
  html += `<span class="set-slider-val" id="_slideVal">${slideLabel}</span>`;
  html += '</div>';

  // Font size
  html += '<div class="set-sec">Font Size</div>';
  const curScale = prefs.fontScale || 100;
  html += '<div class="set-slider-row">';
  html += '<span class="set-slider-label">80%</span>';
  html += `<input type="range" class="set-slider" id="_fontSlider" min="80" max="130" step="5" value="${curScale}">`;
  html += `<span class="set-slider-val" id="_fontVal">${curScale}%</span>`;
  html += '</div>';

  // Clock format
  html += '<div class="set-sec">Clock</div>';
  const is12 = use12h();
  html += '<div class="set-grid">';
  html += `<div class="set-item${!is12 ? ' on' : ''}" data-clock="24h"><span class="set-check">${!is12 ? '\u25CF' : '\u25CB'}</span><span>24h</span></div>`;
  html += `<div class="set-item${is12 ? ' on' : ''}" data-clock="12h"><span class="set-check">${is12 ? '\u25CF' : '\u25CB'}</span><span>12h</span></div>`;
  html += '</div>';

  // Temperature
  html += '<div class="set-sec">Temperature</div>';
  const isF = useF();
  html += '<div class="set-grid">';
  html += `<div class="set-item${!isF ? ' on' : ''}" data-temp="C"><span class="set-check">${!isF ? '\u25CF' : '\u25CB'}</span><span>Celsius</span></div>`;
  html += `<div class="set-item${isF ? ' on' : ''}" data-temp="F"><span class="set-check">${isF ? '\u25CF' : '\u25CB'}</span><span>Fahrenheit</span></div>`;
  html += '</div>';

  // City
  html += '<div class="set-sec">Location</div>';
  html += '<div class="set-hint">Override auto-detected city for weather</div>';
  html += '<div class="set-add-row" style="position:relative;">';
  html += `<input type="text" class="set-add-input" id="_cityInput" placeholder="${userCity || 'Type a city...'}" value="${escapeHtml(prefs.city || '')}">`;
  html += '<button class="set-add-btn" id="_cityBtn">Set</button>';
  html += '</div>';
  if (prefs.city) {
    html += '<div class="set-hint" style="cursor:pointer;text-decoration:underline;" id="_clearCity">Reset to auto-detect</div>';
  }

  container.innerHTML = html;

  // Theme clicks
  container.querySelectorAll('[data-pick]').forEach(item => {
    item.addEventListener('click', () => {
      const theme = item.dataset.pick;
      localStorage.setItem('teletext-theme', theme);
      const prefs = getPrefs();
      prefs.theme = theme;
      savePrefs(prefs);
      // Clear any inline style overrides from custom theme
      const r = document.documentElement.style;
      ['--bg','--fg','--accent','--green','--red','--surface','--border',
       '--text-display','--text-primary','--text-secondary','--text-disabled',
       '--accent-red','--status-green','--status-amber','--font-sans','--font-mono'].forEach(p => r.removeProperty(p));
      document.documentElement.setAttribute('data-theme', theme);
      deriveTheme();
      buildDisplayTab(container);
    });
  });

  // Custom theme color pickers
  function applyCustomTheme() {
    const prefs = getPrefs();
    const ct = prefs.customTheme || {};
    const r = document.documentElement.style;
    r.setProperty('--bg', ct.bg);
    r.setProperty('--fg', ct.fg);
    r.setProperty('--accent', ct.accent);
    r.setProperty('--green', ct.green);
    r.setProperty('--red', ct.red);
    const sf = FONT_OPTIONS[ct.fontSans || 0];
    const mf = FONT_OPTIONS[ct.fontMono || 0];
    r.setProperty('--font-sans', sf.sans);
    r.setProperty('--font-mono', mf.mono);
    applyDerivedVars(ct.bg, ct.fg, ct.accent, ct.green, ct.red);
  }

  function activateCustom() {
    const prefs = getPrefs();
    localStorage.setItem('teletext-theme', 'custom');
    prefs.theme = 'custom';
    savePrefs(prefs);
    document.documentElement.setAttribute('data-theme', 'custom');
    applyCustomTheme();
  }

  container.querySelectorAll('.set-color-input').forEach(input => {
    const handler = () => {
      const prefs = getPrefs();
      if (!prefs.customTheme) prefs.customTheme = { ...(THEME_DEFAULTS[current] || THEME_DEFAULTS.midnight) };
      prefs.customTheme[input.dataset.ckey] = input.value;
      savePrefs(prefs);
      activateCustom();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });

  const fontSansSelect = container.querySelector('#_fontSans');
  const fontMonoSelect = container.querySelector('#_fontMono');
  [fontSansSelect, fontMonoSelect].forEach(sel => {
    if (!sel) return;
    sel.addEventListener('change', () => {
      const prefs = getPrefs();
      if (!prefs.customTheme) prefs.customTheme = { ...(THEME_DEFAULTS[current] || THEME_DEFAULTS.midnight) };
      prefs.customTheme.fontSans = parseInt(fontSansSelect.value);
      prefs.customTheme.fontMono = parseInt(fontMonoSelect.value);
      savePrefs(prefs);
      activateCustom();
    });
  });

  const applyCustomBtn = container.querySelector('#_applyCustom');
  if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', () => {
      const prefs = getPrefs();
      // Initialize customTheme from current theme if not set
      if (!prefs.customTheme) {
        prefs.customTheme = { ...(THEME_DEFAULTS[current] || THEME_DEFAULTS.midnight) };
      }
      localStorage.setItem('teletext-theme', 'custom');
      prefs.theme = 'custom';
      savePrefs(prefs);
      document.documentElement.setAttribute('data-theme', 'custom');
      applyCustomTheme();
      // Just update the radio buttons, don't rebuild
      container.querySelectorAll('[data-pick]').forEach(el => {
        toggleItem(el, false, true);
      });
      toggleItem(applyCustomBtn, true, true);
    });
  }

  // On load, if custom theme is active, apply it
  if (current === 'custom') applyCustomTheme();

  // Slide slider
  const slideSlider = container.querySelector('#_slideSlider');
  const slideValEl = container.querySelector('#_slideVal');
  if (slideSlider) {
    slideSlider.addEventListener('input', () => {
      const ms = parseInt(slideSlider.value);
      slideValEl.textContent = ms >= 60000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 1000)}s`;
      const prefs = getPrefs();
      prefs.slideInterval = ms;
      slideMs = ms;
      savePrefs(prefs);
      if (slideTimer) { clearInterval(slideTimer); slideTimer = setInterval(() => showNews(currentIndex + 1), slideMs); }
    });
  }

  // Font slider
  const fontSlider = container.querySelector('#_fontSlider');
  const fontValEl = container.querySelector('#_fontVal');
  if (fontSlider) {
    fontSlider.addEventListener('input', () => {
      const scale = parseInt(fontSlider.value);
      fontValEl.textContent = `${scale}%`;
      document.documentElement.style.setProperty('--font-scale', scale / 100);
      const prefs = getPrefs();
      prefs.fontScale = scale;
      savePrefs(prefs);
    });
  }

  // Clock toggle
  container.querySelectorAll('[data-clock]').forEach(el => {
    el.addEventListener('click', () => {
      const prefs = getPrefs();
      prefs.clock12h = el.dataset.clock === '12h';
      savePrefs(prefs);
      tick();
      buildDisplayTab(container);
    });
  });

  // Temp toggle
  container.querySelectorAll('[data-temp]').forEach(el => {
    el.addEventListener('click', () => {
      const prefs = getPrefs();
      prefs.tempF = el.dataset.temp === 'F';
      savePrefs(prefs);
      fetchWeather();
      buildDisplayTab(container);
    });
  });

  // City input
  const cityBtn = container.querySelector('#_cityBtn');
  const cityInput = container.querySelector('#_cityInput');
  if (cityBtn && cityInput) {
    const setCity = async () => {
      const val = cityInput.value.trim();
      if (!val) return;
      try {
        const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(val)}&count=1`)).json();
        const r = geo.results?.[0];
        if (!r) { cityInput.value = 'Not found'; return; }
        userCity = r.name;
        userLat = r.latitude;
        userLon = r.longitude;
        userTZ = r.timezone || userTZ;
        userCountry = r.country_code || userCountry;
        userCountryName = countryName(userCountry);
        const prefs = getPrefs();
        prefs.city = r.name;
        prefs.cityLat = r.latitude;
        prefs.cityLon = r.longitude;
        prefs.cityTZ = r.timezone;
        prefs.cityCountry = r.country_code;
        savePrefs(prefs);
        $('cityLabel').textContent = `\u2022 ${userCity}`;
        fetchWeather();
        fetchHolidays();
        buildDisplayTab(container);
      } catch { cityInput.value = 'Error'; }
    };
    cityBtn.addEventListener('click', setCity);
    cityInput.addEventListener('keydown', e => { if (e.key === 'Enter') setCity(); });
  }

  // Clear city
  const clearCity = container.querySelector('#_clearCity');
  if (clearCity) {
    clearCity.addEventListener('click', async () => {
      const prefs = getPrefs();
      delete prefs.city; delete prefs.cityLat; delete prefs.cityLon; delete prefs.cityTZ; delete prefs.cityCountry;
      savePrefs(prefs);
      await detectCountry();
      buildDisplayTab(container);
    });
  }
}

// ─── TAB SWITCHING ───────────────────────────────────
function buildSettingsTab(tabId) {
  activeSettingsTab = tabId;
  const container = $('tabContent');
  document.querySelectorAll('.set-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  switch (tabId) {
    case 'content':  buildContentTab(container); break;
    case 'markets':  buildMarketsTab(container); break;
    case 'sports':   buildSportsTab(container);  break;
    case 'display':  buildDisplayTab(container);  break;
  }
}

document.querySelectorAll('.set-tab').forEach(tab => {
  tab.addEventListener('click', () => buildSettingsTab(tab.dataset.tab));
});

// Open settings
$('settingsBtn').addEventListener('click', () => {
  const panel = $('settingsPanel');
  const isMobile = window.innerWidth <= 900;
  if (isMobile) {
    const tabs = document.querySelectorAll('.mobile-tab');
    const panels = { sidebar: document.querySelector('.sidebar'), main: document.querySelector('.main'), wall: document.querySelector('.wall') };
    tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === 'sidebar'));
    Object.entries(panels).forEach(([k, v]) => v.classList.toggle('mobile-active', k === 'sidebar'));
    document.querySelector('.sidebar').appendChild(panel);
  } else {
    document.querySelector('.main').appendChild(panel);
  }
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) buildSettingsTab(activeSettingsTab);
});

// Close settings
$('settingsClose').addEventListener('click', () => {
  $('settingsPanel').classList.remove('open');
  applyModules();
  applySidebar();
  renderCountdowns();
  loadData();
  fetchFinance();
  fetchSports();
  fetchPredictions();
  if (window.innerWidth <= 900) {
    const tabs = document.querySelectorAll('.mobile-tab');
    const panels = { sidebar: document.querySelector('.sidebar'), main: document.querySelector('.main'), wall: document.querySelector('.wall') };
    tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === 'main'));
    Object.entries(panels).forEach(([k, v]) => v.classList.toggle('mobile-active', k === 'main'));
  }
});

// Share
$('shareBtn').addEventListener('click', () => {
  const url = `${window.location.origin}/${myCode || ''}`;
  const msg = $('shareMsg');
  navigator.clipboard.writeText(url).then(() => {
    msg.style.display = 'block';
    msg.textContent = url;
    setTimeout(() => { msg.style.display = 'none'; }, SHARE_MSG_MS);
  });
});

// Reset
$('resetPrefsBtn').addEventListener('click', () => {
  localStorage.removeItem('teletext-prefs');
  localStorage.setItem('teletext-theme', 'midnight');
  document.documentElement.setAttribute('data-theme', 'midnight');
  deriveTheme();
  document.documentElement.style.fontSize = '';
  savePrefs({});
  buildSettingsTab(activeSettingsTab);
  const msg = $('shareMsg');
  msg.textContent = 'Settings reset';
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 2000);
});

// Export
$('exportPrefsBtn').addEventListener('click', () => {
  const json = JSON.stringify(getPrefs(), null, 2);
  navigator.clipboard.writeText(json).then(() => {
    const msg = $('shareMsg');
    msg.textContent = 'Settings copied to clipboard';
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });
});

// Import
$('importPrefsBtn').addEventListener('click', () => {
  const json = prompt('Paste settings JSON:');
  if (!json) return;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object') throw new Error('Invalid');
    savePrefs(parsed);
    if (parsed.theme) {
      localStorage.setItem('teletext-theme', parsed.theme);
      document.documentElement.setAttribute('data-theme', parsed.theme);
      deriveTheme();
    }
    if (parsed.fontScale) document.documentElement.style.setProperty('--font-scale', parsed.fontScale / 100);
    buildSettingsTab(activeSettingsTab);
    const msg = $('shareMsg');
    msg.textContent = 'Settings imported';
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  } catch {
    alert('Invalid JSON');
  }
});


// ─── USER CODE (persistent config links) ────────────
async function initUserCode() {
  const path = window.location.pathname.slice(1);
  const hasCodeInUrl = /^[a-z0-9]{4}$/.test(path);

  if (hasCodeInUrl) {
    // Visiting a code URL — load its config if it exists
    try {
      const res = await fetch(`/api/config/${path}`);
      if (res.ok) {
        const config = await res.json();
        myCode = path;
        localStorage.setItem('teletext-code', myCode);
        savePrefs(config);
        if (config.theme) {
          localStorage.setItem('teletext-theme', config.theme);
          document.documentElement.setAttribute('data-theme', config.theme);
          deriveTheme();
        }
      } else {
        // Code doesn't exist — redirect to fresh
        history.replaceState(null, null, '/');
        myCode = '';
      }
    } catch {
      history.replaceState(null, null, '/');
      myCode = '';
    }
  } else {
    // Fresh visit to / — reset to defaults
    localStorage.removeItem('teletext-prefs');
    localStorage.removeItem('teletext-code');
    localStorage.removeItem('teletext-theme');
    document.documentElement.removeAttribute('data-theme');
    myCode = '';

    try {
      const data = await (await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getPrefs()),
      })).json();
      if (data.code) {
        myCode = data.code;
        localStorage.setItem('teletext-code', myCode);
        history.replaceState(null, null, '/' + myCode);
      }
    } catch {}
  }

  applyModules();
  applySidebar();

  // Apply font scale
  const fontScale = getPrefs().fontScale;
  if (fontScale && fontScale !== 100) document.documentElement.style.setProperty('--font-scale', fontScale / 100);
}

initUserCode();

// Apply theme on load
(function() {
  const theme = localStorage.getItem('teletext-theme') || 'midnight';
  if (theme === 'custom') {
    const ct = getPrefs().customTheme;
    if (ct) {
      const r = document.documentElement.style;
      r.setProperty('--bg', ct.bg);
      r.setProperty('--fg', ct.fg);
      r.setProperty('--accent', ct.accent);
      r.setProperty('--green', ct.green);
      r.setProperty('--red', ct.red);
      const sf = FONT_OPTIONS[ct.fontSans || 0];
      const mf = FONT_OPTIONS[ct.fontMono || 0];
      r.setProperty('--font-sans', sf.sans);
      r.setProperty('--font-mono', mf.mono);
      applyDerivedVars(ct.bg, ct.fg, ct.accent, ct.green, ct.red);
    }
  } else {
    deriveTheme();
  }
})();


// ─── TICKER TOUCH ───────────────────────────────────
['finTicker', 'sportsTicker', 'polyTicker'].forEach(id => {
  const el = $(id);
  let resumeTimer = null;

  function pause() {
    const track = el.querySelector('.ticker-track');
    if (!track) return;
    track.classList.remove('auto-scroll');
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      const wrap = el.querySelector('.ticker-scroll-wrap');
      if (wrap) wrap.scrollLeft = 0;
      track.classList.add('auto-scroll');
    }, TICKER_RESUME_MS);
  }

  el.addEventListener('touchstart', pause, { passive: true });
  el.addEventListener('mousedown', e => {
    if (e.target.closest('a')) return;
    pause();
  });
});


// ─── MOBILE TABS ────────────────────────────────────
{
  const tabs = document.querySelectorAll('.mobile-tab');
  const panels = { sidebar: document.querySelector('.sidebar'), main: document.querySelector('.main'), wall: document.querySelector('.wall') };

  const switchTab = name => {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    Object.entries(panels).forEach(([k, v]) => v.classList.toggle('mobile-active', k === name));
  };

  tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.panel)));

  const checkMobile = () => {
    if (window.innerWidth <= 900) {
      const active = document.querySelector('.mobile-tab.active');
      switchTab(active ? active.dataset.panel : 'main');
    } else {
      Object.values(panels).forEach(p => { p.classList.remove('mobile-active'); p.style.display = ''; });
    }
  };
  window.addEventListener('resize', checkMobile);
  checkMobile();
}


// ─── RESIZABLE SIDEBARS ────────────────────────────
{
  const sidebar = document.querySelector('.sidebar');
  const wall = document.querySelector('.wall');

  try {
    const s = JSON.parse(localStorage.getItem('teletext-layout'));
    if (s?.left) {
      sidebar.style.width = s.left + 'px';
      sidebar.style.zoom = Math.max(0.65, Math.min(1.15, s.left / 340));
    }
    if (s?.right) wall.style.width = s.right + 'px';
  } catch {}

  const saveLayout = () => localStorage.setItem('teletext-layout', JSON.stringify({ left: sidebar.offsetWidth, right: wall.offsetWidth }));

  const initDrag = (handle, target, isLeft) => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX, startW = target.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = e => {
        const dx = e.clientX - startX;
        const newW = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, isLeft ? startW + dx : startW - dx));
        target.style.width = newW + 'px';
        if (isLeft) {
          const scale = Math.max(0.65, Math.min(1.15, newW / 340));
          target.style.zoom = scale;
        }
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveLayout();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  };

  initDrag($('resizeLeft'), sidebar, true);
  initDrag($('resizeRight'), wall, false);
}




// ─── KIOSK MODE ─────────────────────────────────────
let kioskScrollTimer = null;

function enterKiosk() {
  document.documentElement.classList.add('kiosk');
  document.documentElement.requestFullscreen?.().catch(() => {});
  kioskScrollTimer = setInterval(() => {
    const posts = $('wPosts');
    if (!posts) return;
    posts.scrollTop = (posts.scrollTop >= posts.scrollHeight - posts.clientHeight) ? 0 : posts.scrollTop + 1;
  }, KIOSK_SCROLL_MS);
}

function exitKiosk() {
  document.documentElement.classList.remove('kiosk');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (kioskScrollTimer) { clearInterval(kioskScrollTimer); kioskScrollTimer = null; }
}

document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitKiosk(); });
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'f' || e.key === 'F') { document.documentElement.classList.contains('kiosk') ? exitKiosk() : enterKiosk(); }
});
$('refreshBtn').addEventListener('click', () => { location.reload(); });
$('fullscreenBtn').addEventListener('click', () => { document.documentElement.classList.contains('kiosk') ? exitKiosk() : enterKiosk(); });


// ─── RADIO ──────────────────────────────────────────
const RADIO_PRESETS = [
  {
    name: 'Slow Jazz', title: 'SomaFM Illinois Street Lounge',
    stream: 'https://ice1.somafm.com/illstreet-128-aac',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="2" height="8"/><rect x="6" y="3" width="2" height="2"/><rect x="8" y="5" width="2" height="2"/><rect x="10" y="3" width="2" height="2"/><rect x="10" y="5" width="2" height="6"/><rect x="2" y="11" width="4" height="2"/><rect x="8" y="11" width="4" height="2"/></svg>',
  },
  {
    name: 'Lofi', title: 'SomaFM Fluid',
    stream: 'https://ice1.somafm.com/fluid-128-aac',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="2" height="10"/><rect x="5" y="1" width="2" height="2"/><rect x="7" y="3" width="2" height="2"/><rect x="9" y="1" width="2" height="12"/><rect x="11" y="3" width="2" height="2"/><rect x="5" y="11" width="2" height="2"/><rect x="11" y="11" width="2" height="2"/></svg>',
  },
  {
    name: 'Ambient', title: 'SomaFM Groove Salad',
    stream: 'https://ice1.somafm.com/groovesalad-128-aac',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="2" width="6" height="2"/><rect x="3" y="4" width="2" height="6"/><rect x="11" y="4" width="2" height="6"/><rect x="5" y="10" width="6" height="2"/><rect x="7" y="6" width="2" height="2"/></svg>',
  },
  {
    name: 'Drone', title: 'SomaFM Drone Zone',
    stream: 'https://ice1.somafm.com/dronezone-128-aac',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="1" width="4" height="2"/><rect x="4" y="3" width="2" height="2"/><rect x="10" y="3" width="2" height="2"/><rect x="2" y="5" width="2" height="6"/><rect x="12" y="5" width="2" height="6"/><rect x="4" y="11" width="2" height="2"/><rect x="10" y="11" width="2" height="2"/><rect x="6" y="13" width="4" height="2"/><rect x="7" y="7" width="2" height="2"/></svg>',
  },
];

let radioCurrent = null;

function playRadio(streamUrl, title) {
  const audio = $('radioAudio');
  try { audio.pause(); } catch {}
  audio.src = streamUrl;
  radioCurrent = { streamUrl, title };
  audio.dataset.loading = '1';
  updatePresetHighlight();
  // iOS needs load() before play() after changing src
  try { audio.load(); } catch {}
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      audio.dataset.loading = '';
      localStorage.setItem('teletext-radio', JSON.stringify(radioCurrent));
      updatePresetHighlight();
    }).catch(err => {
      console.error('Radio play failed:', err.name, err.message, streamUrl);
      audio.dataset.loading = '';
      showRadioError(err.message || 'Playback failed');
      updatePresetHighlight();
    });
  }
}

function showRadioError(msg) {
  const el = $('radioPresets');
  if (!el) return;
  const existing = el.querySelector('.radio-error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'radio-error';
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function stopRadio() {
  const audio = $('radioAudio');
  audio.dataset.stopping = '1';
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setTimeout(() => { audio.dataset.stopping = ''; }, 200);
  updatePresetHighlight();
}

function updatePresetHighlight() {
  const playing = radioCurrent && !$('radioAudio').paused;
  const loading = $('radioAudio').dataset.loading === '1';
  document.querySelectorAll('.radio-preset').forEach(el => {
    const isCurrent = radioCurrent && el.dataset.stream === radioCurrent.streamUrl;
    el.classList.toggle('playing', playing && isCurrent);
    el.classList.toggle('loading', loading && isCurrent);
  });
}

const EQ_HTML = '<span class="eq"><span></span><span></span><span></span></span>';

function renderPresets() {
  const el = $('radioPresets');
  el.innerHTML = RADIO_PRESETS.map((p, i) =>
    `<button class="radio-preset" data-idx="${i}" data-stream="${escapeHtml(p.stream)}">` +
      `<span class="radio-icon">${p.icon}</span>` +
      `<span class="radio-label">${escapeHtml(p.name)}</span>` +
      `<span class="radio-state">${EQ_HTML}</span>` +
    `</button>`
  ).join('') + '<button class="radio-preset radio-stop-btn" data-stop="1">Stop</button>';

  el.querySelectorAll('.radio-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.stop) { stopRadio(); return; }
      const preset = RADIO_PRESETS[btn.dataset.idx];
      playRadio(preset.stream, preset.title);
    });
  });
  updatePresetHighlight();
}

$('radioBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const panel = $('radioPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderPresets();
});

// Close when clicking outside
document.addEventListener('click', (e) => {
  const panel = $('radioPanel');
  if (panel.classList.contains('open') && !panel.contains(e.target) && e.target.id !== 'radioBtn' && !e.target.closest('#radioBtn')) {
    panel.classList.remove('open');
  }
});

// Audio event listeners for state sync
['play', 'pause', 'ended', 'waiting', 'playing'].forEach(ev => {
  $('radioAudio').addEventListener(ev, updatePresetHighlight);
});

// Surface audio errors (ignore errors during intentional stop)
$('radioAudio').addEventListener('error', () => {
  const audio = $('radioAudio');
  if (audio.dataset.stopping === '1' || !audio.currentSrc) return;
  const err = audio.error;
  const codes = { 1: 'Aborted', 2: 'Network error', 3: 'Decode error', 4: 'Format not supported' };
  const msg = err ? (codes[err.code] || 'Audio error ' + err.code) : 'Unknown audio error';
  console.error('Audio error:', err);
  showRadioError(msg);
  audio.dataset.loading = '';
  updatePresetHighlight();
});
$('radioAudio').addEventListener('stalled', () => {
  if ($('radioAudio').dataset.stopping !== '1') showRadioError('Stream stalled');
});

// Restore last station
try {
  const saved = JSON.parse(localStorage.getItem('teletext-radio'));
  if (saved && saved.streamUrl) radioCurrent = saved;
} catch {}


// ─── INIT ───────────────────────────────────────────
detectCountry();
fetchPosts();
setInterval(loadData, INTERVALS.DATA);

// PWA service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

})();
