"use strict";
/* Plonk Tarjetas — app personal de repaso de pistas de GeoGuessr.
   Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0.
   Panorámicas © Google Street View. */

const DAY = 86400000;
const STORE_KEY = "plonk_state_v1";
const RES_KEY = "plonk_res_v4";
const TR_VER = "3";
const DATA_CACHE = "plonk-data-v1";
const EASY_ORDER = [
  "spain", "united-states", "japan", "brazil", "russia", "united-kingdom", "france",
  "germany", "italy", "australia", "canada", "mexico", "south-africa", "india",
  "thailand", "poland", "argentina", "indonesia", "turkey", "netherlands", "sweden",
  "norway", "finland", "portugal", "south-korea", "new-zealand", "chile", "colombia",
  "peru", "philippines", "malaysia", "kenya", "greece", "romania", "ukraine",
  "ireland", "belgium", "austria", "switzerland", "denmark", "czechia", "hungary",
  "slovakia", "croatia", "slovenia", "serbia", "bulgaria", "lithuania", "latvia",
  "estonia", "israel-west-bank", "taiwan", "bangladesh", "sri-lanka", "cambodia",
  "vietnam", "mongolia", "kazakhstan", "ecuador", "bolivia", "uruguay", "guatemala",
  "dominican-republic", "botswana", "ghana", "nigeria", "senegal", "uganda", "tunisia",
  "united-arab-emirates", "jordan",
];
// Territorios que forman parte de otro país (no deben salir como opción "trampa")
const FAMILY = { UM: "US", GU: "US", PR: "US", VI: "US", MP: "US", AS: "US", RE: "FR", MQ: "FR", PM: "FR",
  CX: "AU", CC: "AU", FO: "DK", GL: "DK", GI: "GB", IM: "GB", JE: "GB", BM: "GB", FK: "GB", PN: "GB", GS: "GB", IO: "GB",
  CW: "NL", SJ: "NO" };
function family(slug) { const c = (BY_SLUG[slug]?.code || "").slice(0, 2).toUpperCase(); return FAMILY[c] || c; }
const START_UNLOCKED = 3;
const UNLOCK_THRESHOLD = 0.8;
const LEVELS = {
  facil: { name: "Fácil", desc: "Los 25 países que más salen", count: 25 },
  medio: { name: "Medio", desc: "Los 70 países más comunes", count: 70 },
  dificil: { name: "Difícil", desc: "Todos los países de Plonkit", count: Infinity },
};
const CATS = [
  { id: "mezcla", name: "Todo mezclado", icon: "🎲" },
  { id: "ubicacion", name: "Ubicación aleatoria", icon: "📍" },
  { id: "bolardos", name: "Bolardos", icon: "🚧", tags: ["bollard"], re: /bollard/i },
  { id: "postes", name: "Postes", icon: "⚡", tags: ["pole"], re: /\bpoles?\b|utility pole|electricity|power ?lines?/i },
  { id: "lineas", name: "Líneas de carretera", icon: "🛣️", tags: ["roadline"], re: /road ?lines?|cent(re|er) ?lines?|outer ?lines?|edge ?lines?|dashed|road ?markings?/i },
  { id: "senales", name: "Señales", icon: "⚠️", tags: ["chevron/sign"], re: /\bsigns?\b|chevrons?|sign ?posts?|signage/i },
  { id: "matriculas", name: "Matrículas", icon: "🚘", tags: ["license plates"], re: /licen[cs]e ?plates?|number ?plates?|^(?!.*\bpoles?\b).*\bplates?\b/i },
  { id: "idioma", name: "Idioma y escritura", icon: "🔤", tags: ["language"], re: /language|alphabet|\bscript\b|word for|diacritic|spelling|characters|letters?\b/i },
  { id: "naturaleza", name: "Naturaleza y paisaje", icon: "🌿", tags: ["vegetation", "landscape"], re: /vegetation|\bsoil\b|\btrees?\b|\bpalms?\b|landscape|mountains?|desert|forest|grass|terrain|climate|\bhills?\b/i },
  { id: "arquitectura", name: "Arquitectura", icon: "🏠", tags: ["architecture"], re: /\bhouses?\b|buildings?|\broofs?\b|architecture|\bwalls?\b|fences?/i },
  { id: "coche", name: "Coche y cámara", icon: "📷", tags: [], re: /google car|\bcamera\b|\bgen ?[1-4]\b|generation [1-4]|antenna|snorkel|\bblur|follow car|trekker|roof ?rack|car meta/i },
  { id: "guardarrailes", name: "Guardarraíles", icon: "🛡️", tags: ["guardrail"], re: /guard ?rails?/i },
];
const NAME_OVERRIDES = {
  "US-AK": "Alaska", "US-HI": "Hawái", "UM-MQ": "Islas menores de EE. UU.",
  "PT-AZ": "Azores", "PT-MA": "Madeira",
};

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esNames = (() => { try { return new Intl.DisplayNames(["es"], { type: "region" }); } catch { return null; } })();

/* ---------------- Estado ---------------- */

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function defaultState() {
  return {
    v: 1, unlocked: [], cards: {}, introduced: {}, confusion: {}, hidden: {},
    day: today(), newToday: 0, settings: { newPerDay: 10, level: "facil", original: false }, history: [],
  };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.v === 1) {
      const st = Object.assign(defaultState(), s);
      st.settings = Object.assign(defaultState().settings, s.settings || {});
      delete st.res; delete st.res2;
      return st;
    }
  } catch {}
  return defaultState();
}
let S = loadState();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast("No se pudo guardar el progreso (almacenamiento lleno)"); }
}
function rollDay() {
  if (S.day !== today()) { S.day = today(); S.newToday = 0; save(); }
}

// Resoluciones de enlaces de Google Maps → panorámica (o false si no tiene)
let RES = {};
try { RES = JSON.parse(localStorage.getItem(RES_KEY)) || {}; } catch {}
let resSaveT;
function saveRes() {
  clearTimeout(resSaveT);
  resSaveT = setTimeout(() => {
    const keys = Object.keys(RES);
    if (keys.length > 6000) for (const k of keys.slice(0, keys.length - 5000)) delete RES[k];
    try { localStorage.setItem(RES_KEY, JSON.stringify(RES)); } catch { RES = {}; }
  }, 500);
}

/* ---------------- Almacén de datos (Cache API) ---------------- */

async function dataGet(key) {
  try {
    const c = await caches.open(DATA_CACHE);
    const r = await c.match("/__data/" + key);
    return r ? await r.json() : null;
  } catch { return null; }
}
async function dataSet(key, val) {
  try {
    const c = await caches.open(DATA_CACHE);
    await c.put("/__data/" + key, new Response(JSON.stringify(val), { headers: { "content-type": "application/json" } }));
  } catch {}
}

/* ---------------- Datos de Plonkit ---------------- */

let COUNTRIES = [];
const BY_SLUG = {};
const DATA = {};

// Cola para no saturar a Plonkit (si nos pasamos devuelve 429)
let plonkChain = Promise.resolve();
let lastPlonk = 0;
let userWaiting = 0;
let plonkCooldown = 0;
function plonkPage(path) {
  const run = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = 900 - (Date.now() - lastPlonk);
      if (wait > 0) await sleep(wait);
      lastPlonk = Date.now();
      const r = await fetch("/pk" + path);
      if (r.status === 429) {
        plonkCooldown = Date.now() + 60000;
        if (attempt >= 1) break;
        await sleep(5000); continue;
      }
      if (!r.ok) throw new Error(`Plonkit respondió ${r.status}`);
      const html = await r.text();
      const m = html.match(/<script id="__PRELOADED_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) throw new Error("Plonkit no devolvió datos (" + path + ")");
      return JSON.parse(m[1]);
    }
    throw new Error("Plonkit está limitando las peticiones, prueba en un rato");
  };
  const p = plonkChain.then(run, run);
  plonkChain = p.catch(() => {});
  return p;
}

const MAPS_LINK = /https?:\/\/(?:goo\.gl\/maps|maps\.app\.goo\.gl|(?:www\.)?google\.[a-z.]+\/maps)[^\s)\]]*/g;

function classify(tip) {
  // Primero las etiquetas de Plonkit; si no hay, el subtítulo y la primera frase
  const byTag = CATS.filter((c) => (c.tags || []).some((t) => (tip.tags || []).includes(t))).map((c) => c.id);
  if (byTag.length) return byTag;
  const first = String(tip.text[0] || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split(/(?<=[.!?])\s/)[0];
  const text = (tip.sub || "") + " " + first;
  return CATS.filter((c) => c.re && c.re.test(text)).map((c) => c.id);
}

// Nombres (inglés y español) de los demás países para no usar enlaces de contraejemplos
function otherCountryMatcher(slug) {
  const norm = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const own = new Set([norm(BY_SLUG[slug]?.title || ""), norm(countryName(slug))]);
  const names = [];
  for (const c of COUNTRIES) {
    if (c.slug === slug) continue;
    for (const n of [norm(c.title), norm(countryName(c.slug))]) if (n && !own.has(n)) names.push(n);
  }
  const res = names.map((n) => new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`));
  return (anchor) => {
    const a = norm(anchor).trim();
    if (!a || /,/.test(a)) return false; // "Jordan, Utah", "Peru, Illinois"…
    return res.some((re) => re.test(a));
  };
}

// Recalcula enlaces útiles y categorías de cada pista (vale para datos viejos y nuevos)
function enrich(d) {
  const isOther = otherCountryMatcher(d.slug);
  for (const st of d.steps) for (const t of st.tips) {
    const all = t.text.join("\n");
    const imageLinks = (t.links || []).filter((l) => !all.includes(l));
    if (t.imageLink !== undefined) { imageLinks.length = 0; if (t.imageLink && /^https?:/.test(t.imageLink) && t.imageLink.match(MAPS_LINK)) imageLinks.push(t.imageLink); }
    const good = [...imageLinks];
    for (const line of t.text) {
      const L = String(line);
      if (/^\s*(\*\*)?\s*(note|nota|however|in contrast)\b/i.test(L)) continue; // contraejemplos
      for (const m of L.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
        const [, anchor, url] = m;
        if (!url.match(MAPS_LINK) || isOther(anchor) || good.includes(url)) continue;
        good.push(url);
      }
    }
    t.links = good;
    t.cats = classify(t);
    t.info = !t.cats.length && !good.length; // pistas informativas (mapas, explicaciones): fuera de las tarjetas
  }
  return d;
}

async function fetchCountries() {
  const d = await plonkPage("/guide");
  return d.data
    .filter((c) => c.code && !c.code.startsWith("XX") && (c.cat || []).length)
    .map((c) => ({ slug: c.slug, title: c.title, code: c.code, cat: c.cat }));
}
async function fetchCountry(slug) {
  const d = (await plonkPage("/" + slug)).data.public;
  const steps = [];
  (d.steps || []).forEach((s, si) => {
    if (s.kind !== "tip") return;
    let sub = null;
    const tips = [];
    for (const it of s.items || []) {
      if (it.kind === "subsection") sub = it.title;
      if (it.kind !== "tip") continue;
      const text = it.data?.text || [];
      const imageLink = it.data?.image?.imageLink || null;
      tips.push({ id: it.id, sub, text, img: it.data?.image?.imageUrl || null, imageLink, links: [], tags: it.tags || [] });
    }
    steps.push({ index: si, title: s.title, tips });
  });
  return enrich({ v: 2, slug: d.slug, title: d.title, code: d.code, cat: d.cat, updatedAt: d.updatedAt, steps });
}

async function loadCountries() {
  const c = await dataGet("countries");
  if (c && Date.now() - c.t < 14 * DAY) COUNTRIES = c.d;
  else {
    try { COUNTRIES = await fetchCountries(); dataSet("countries", { t: Date.now(), d: COUNTRIES }); }
    catch (e) { if (c) COUNTRIES = c.d; else throw e; }
  }
  for (const x of COUNTRIES) BY_SLUG[x.slug] = x;
}

// Solo de la caché local (rápido, sin red)
async function loadCountryLocal(slug) {
  if (DATA[slug]) return DATA[slug];
  const c = await dataGet("c_" + slug);
  if (c && c.d && c.d.v === 2) { DATA[slug] = enrich(c.d); DATA[slug]._t = c.t; return c.d; }
  return null;
}
async function loadCountry(slug) {
  const local = await loadCountryLocal(slug);
  if (local && Date.now() - (local._t || 0) < 30 * DAY) return local;
  userWaiting++;
  try {
    let d = null;
    // 1) Caché compartida en Netlify (rápida, sin límites)
    try {
      const r = await fetch("/api/c/" + slug);
      if (r.ok) { d = await r.json(); if (d.v !== 2 || Date.now() - (d._t || 0) > 30 * DAY) d = null; else enrich(d); }
    } catch {}
    // 2) Directamente de Plonkit, y se guarda en la caché compartida
    if (!d) {
      d = await fetchCountry(slug);
      fetch("/api/c/" + slug, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(d) }).catch(() => {});
    }
    DATA[slug] = d; d._t = d._t || Date.now();
    await dataSet("c_" + slug, { t: Date.now(), d });
    return d;
  } catch (e) {
    if (local) return local;
    throw e;
  } finally { userWaiting--; }
}
async function loadMany(slugs, onProgress) {
  let i = 0, next = 0;
  const worker = async () => {
    while (next < slugs.length) {
      const s = slugs[next++];
      try { await loadCountry(s); } catch {}
      onProgress && onProgress(++i, slugs.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// Descarga en segundo plano de los países que falten
let prefetching = false;
async function prefetchAll() {
  if (prefetching || !navigator.onLine) return;
  prefetching = true;
  try {
    for (const s of unlockOrder()) {
      if (await loadCountryLocal(s)) continue;
      while (userWaiting || session || Date.now() < plonkCooldown) await sleep(3000);
      try { await loadCountry(s); } catch { await sleep(20000); }
      await sleep(800);
    }
  } finally { prefetching = false; }
}

function countryName(slug) {
  const c = BY_SLUG[slug];
  if (!c) return slug;
  if (NAME_OVERRIDES[c.code]) return NAME_OVERRIDES[c.code];
  if (esNames && /^[A-Z]{2}$/.test(c.code)) {
    try { const n = esNames.of(c.code); if (n && n !== c.code) return n; } catch {}
  }
  return c.title;
}
function flag(slug) {
  const c = BY_SLUG[slug];
  const code = ((c && c.code) || "").slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((ch) => 127397 + ch.charCodeAt(0)));
}
function unlockOrder() {
  const slugs = COUNTRIES.map((c) => c.slug);
  const easy = EASY_ORDER.filter((s) => BY_SLUG[s]);
  return [...easy, ...slugs.filter((s) => !easy.includes(s))];
}
function levelCountries(level) {
  return unlockOrder().slice(0, LEVELS[level].count === Infinity ? undefined : LEVELS[level].count);
}

function idStep(d) { return d.steps.find((s) => /^identif/i.test(s.title)) || d.steps[0]; }
function withMeta(t, slug) { return { ...t, slug, key: slug + "/" + t.id }; }
// Mazo diario: el bloque "Identifying X" de cada país
function deckTips(slug) {
  const d = DATA[slug];
  if (!d || !d.steps.length) return [];
  return idStep(d).tips.filter((t) => (t.img || t.links.length) && !t.info && !S.hidden[slug + "/" + t.id]).map((t) => withMeta(t, slug));
}
function allTips(slug, extraSteps) {
  const d = DATA[slug];
  if (!d) return [];
  const steps = extraSteps ? d.steps : [idStep(d)];
  return steps.flatMap((s) => s.tips.filter((t) => (t.img || t.links.length) && !t.info && !S.hidden[slug + "/" + t.id]).map((t) => withMeta(t, slug)));
}
function findTip(key) {
  const [slug, id] = key.split("/");
  const d = DATA[slug];
  if (!d) return null;
  for (const s of d.steps) { const t = s.tips.find((x) => x.id === id); if (t) return withMeta(t, slug); }
  return null;
}

/* ---------------- Imágenes y Street View ---------------- */

function imgHTML(path, alt = "") {
  if (!path || !/^\/images\/[\w\-./%() ]+$/.test(path)) return "";
  const clean = path.replace(/^\/images\//, "").split("/").map(encodeURIComponent).join("/");
  return `<img src="/pimg/${esc(clean)}" data-fb="https://www.plonkit.net/images/resize/600/80/${esc(clean)}" alt="${esc(alt)}" loading="lazy">`;
}
// Si el proxy de imágenes falla, se intenta directamente en Plonkit
document.addEventListener("error", (e) => {
  const i = e.target;
  if (i && i.tagName === "IMG" && i.dataset.fb && !i.dataset.f) { i.dataset.f = 1; i.src = i.dataset.fb; }
}, true);

function parseMaps(u) {
  try {
    const p = new URL(u);
    if (p.hostname.startsWith("consent.") && p.searchParams.get("continue")) u = p.searchParams.get("continue");
  } catch {}
  try {
    const q = new URL(u).searchParams;
    if (q.get("pano")) {
      const vp = (q.get("viewpoint") || "").split(",");
      return { pano: q.get("pano"), lat: +vp[0] || 0, lng: +vp[1] || 0, heading: +q.get("heading") || 0, pitch: +q.get("pitch") || 0, fov: +q.get("fov") || 75 };
    }
  } catch {}
  const pano = u.match(/!1s([A-Za-z0-9_\-]{10,})!2e0/);
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+),([^/?]*)/);
  if (!pano) return null;
  const out = { pano: pano[1] };
  if (at) {
    out.lat = +at[1]; out.lng = +at[2];
    for (const tok of at[3].split(",")) {
      const m = tok.match(/^(-?[\d.]+)([yht])$/);
      if (!m) continue;
      if (m[2] === "y") out.fov = +m[1];
      if (m[2] === "h") out.heading = +m[1];
      if (m[2] === "t") out.pitch = +m[1] - 90;
    }
  }
  return out;
}

async function resolveLink(link) {
  if (link in RES) return RES[link];
  // El servidor resuelve el enlace y comprueba que la panorámica siga existiendo
  let r = null;
  try {
    const res = await fetch("/api/resolve?u=" + encodeURIComponent(link), { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (!res.ok) return null; // fallo temporal: se reintenta otro día
    r = await res.json();
    if (r && r.dead) r = null;
  } catch { return null; }
  RES[link] = r && r.pano ? { p: r.pano, a: r.lat, o: r.lng, h: r.heading || 0, t: r.pitch || 0, f: r.fov || 75 } : false;
  saveRes();
  return RES[link];
}
// Una ubicación al azar entre los ejemplos de la pista (distinta de la última si se puede)
async function pickLocation(tip, avoid, mustDiffer) {
  const links = shuffle([...(tip.links || [])]).filter((l) => !(mustDiffer && l === avoid && tip.links.length > 1));
  if (avoid && links.length > 1) links.sort((a, b) => (a === avoid) - (b === avoid));
  const ready = links.find((l) => RES[l] && l !== avoid) || links.find((l) => RES[l]);
  if (ready) return { ...RES[ready], link: ready };
  let tries = 0;
  for (const l of links) {
    if (RES[l] === false) continue;
    if (++tries > 2) break; // no hacer esperar: como mucho 2 intentos por tarjeta
    const r = await resolveLink(l);
    if (r) return { ...r, link: l };
  }
  return null;
}

function svHTML(r) {
  if (!/^[\w-]{10,}$/.test(String(r.p))) return "";
  const zoom = Math.max(0, Math.min(2.5, Math.log2(90 / (r.f || 75)) - 0.3));
  const pb = `!4v0!6m8!1m7!1s${r.p}!2m2!1d${r.a || 0}!2d${r.o || 0}!3f${(+r.h || 0).toFixed(2)}!4f${(+r.t || 0).toFixed(2)}!5f${zoom.toFixed(2)}`;
  return `<div class="sv"><iframe src="https://www.google.com/maps/embed?pb=${pb}" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></div>`;
}

/* ---------------- Traducción ---------------- */

const LOWER_CAPS = /\b(NOTE|NOTES|IMPORTANT|TIP|WARNING|ONLY|NOT|ALWAYS|NEVER|AND|OR|ALSO|VERY|ALL|BUT|THE|IS|ARE|DO|DOES|NO)\b/g;
const KEEP_RE = /"[^"\n]{1,40}"|“[^”\n]{1,40}”|‘[^’\n]{1,40}’|(?<=^|[\s(])'[^'\n]{1,40}'(?=$|[\s.,;:!?)])|\b(?:Google cars?|Street View|snorkel|trekker|follow cars?|NMPZ|[Gg]en ?[1-4](?: ?(?:trekker|car))?|meta|metas|chevrons?|rifts?|tapering)\b|\b[A-ZÀ-Ý][A-ZÀ-Ý0-9]+(?:[- ][A-ZÀ-Ý0-9]{2,})*\b/g;

function protect(line) {
  const keep = [];
  let s = String(line).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(LOWER_CAPS, (m) => m[0] + m.slice(1).toLowerCase());
  s = s.replace(KEEP_RE, (m) => { keep.push(m); return `ZQ${keep.length - 1}QZ`; });
  return { s, keep };
}
function restore(s, keep) {
  return s.replace(/Z\s*Q\s*(\d+)\s*Q\s*Z/gi, (m, i) => (keep[+i] !== undefined ? keep[+i] : m));
}

const TR_MEM = {};
// Arreglos tras traducir (límites de palabra que entienden tildes)
const W = (w, flags = "gu") => new RegExp(`(?<![\\p{L}\\d])${w}(?![\\p{L}\\d])`, flags);
const POST_FIX = [
  [W("los signos"), "las señales"], [W("Los signos"), "Las señales"], [W("signos"), "señales"], [W("Signos"), "Señales"],
  [W("los platos"), "las matrículas"], [W("Los platos"), "Las matrículas"], [W("platos"), "matrículas"], [W("Platos"), "Matrículas"],
  [W("placas de matrícula"), "matrículas"], [W("los polos"), "los postes"], [W("polos"), "postes"], [W("Polos"), "Postes"],
  [W("encontrará"), "encontrarás"], [W("Encontrará"), "Encontrarás"], [W("verá"), "verás"], [W("Verá"), "Verás"],
  [W("notará"), "notarás"], [W("podrá"), "podrás"], [W("Podrá"), "Podrás"], [W("puede ver"), "puedes ver"], [W("Puede ver"), "Puedes ver"],
  [W("Tenga en cuenta"), "Ten en cuenta"], [W("tenga en cuenta"), "ten en cuenta"], [W("Tenga cuidado"), "Ten cuidado"], [W("tenga cuidado"), "ten cuidado"],
  [W("asegúrese"), "asegúrate"], [W("Asegúrese"), "Asegúrate"], [W("consulte"), "consulta"], [W("Consulte"), "Consulta"],
  [W("Busque"), "Busca"], [W("busque"), "busca"], [W("Observe"), "Fíjate en"], [W("Fíjese"), "Fíjate"], [W("fíjese"), "fíjate"],
  [W("Si ve"), "Si ves"], [W("si ve"), "si ves"], [W("Recuerde"), "Recuerda"], [W("recuerde"), "recuerda"],
  [W("marcadores de carretera"), "líneas de la carretera"], [W("rieles en el techo"), "baca"], [W("rieles de techo"), "baca"],
  [W("en forma de diamante"), "en forma de rombo"], [W("diamantes amarillos"), "rombos amarillos"], [W("autos"), "coches"], [W("auto"), "coche"],
  [W("el US"), "EE. UU."], [W("El US"), "EE. UU."], [W("los US"), "EE. UU."], [W("US"), "EE. UU."],
  [W("el UK"), "el Reino Unido"], [W("El UK"), "El Reino Unido"], [W("UK"), "Reino Unido"], [W("EU"), "UE"],
];
// Arregla ** sueltos o pegados que deja el traductor
function fixBold(t) {
  if (((t.match(/\*\*/g) || []).length) % 2) t = t.replace(/\*\*/g, "");
  return t.replace(/\*\*\s*([^*]+?)\s*\*\*/g, "**$1**").replace(/(\S)\*\*([^*]+?)\*\*(?=[\p{L}\d])/gu, "$1 **$2** ").replace(/(^|\s)\*\*([^*]+?)\*\*(?=[\p{L}\d])/gu, "$1**$2** ");
}
function preFix(line) {
  // Da contexto al traductor: "plates" casi siempre son matrículas
  if (!/\bpoles?\b/i.test(line)) line = line.replace(/\b(?<!licen[cs]e |number )(plates?)\b/gi, "license $1");
  return line;
}
async function mtLines(lines) {
  // 1) Todo el texto junto: el traductor tiene más contexto y traduce mejor
  try {
    const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=" + encodeURIComponent(lines.join("\n")));
    if (r.ok) {
      const data = await r.json();
      const out = (data[0] || []).map((seg) => seg[0] || "").join("").split("\n");
      if (out.length === lines.length) return out;
    }
  } catch {}
  // 2) Alternativa línea a línea
  const r = await fetch("https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=es&" + lines.map((l) => "q=" + encodeURIComponent(l)).join("&"));
  if (!r.ok) throw new Error("traducción " + r.status);
  const data = await r.json();
  const arr = (Array.isArray(data) ? data : [data]).map((x) => (Array.isArray(x) ? x[0] : x));
  if (arr.length !== lines.length) throw new Error("traducción incompleta");
  return arr;
}
// Cola de traducción: agrupa varias pistas por petición y da prioridad a lo que se ve
const trPending = [];
let trBusy = false;
function prepTip(tip) {
  const lines = tip.text.flatMap((l) => String(l).split("\n")).filter((l) => l.trim());
  return { lines, prot: lines.map((l) => protect(preFix(l))) };
}
function finishTr(prep, out) {
  return {
    text: out.map((l, i) => {
      let t = restore(String(l || ""), (prep.prot[i] || { keep: [] }).keep);
      for (const [re, rep] of POST_FIX) t = t.replace(re, rep);
      return fixBold(t);
    }),
  };
}
async function trFlush() {
  if (trBusy) return;
  trBusy = true;
  try {
    while (trPending.length) {
      // Lote de hasta ~1800 caracteres
      const batch = [];
      let size = 0;
      while (trPending.length && (batch.length === 0 || size + trPending[0].chars < 1800) && batch.length < 12) {
        const j = trPending.shift();
        batch.push(j); size += j.chars;
      }
      let outs = null;
      if (batch.length > 1) {
        try {
          const all = batch.flatMap((j, i) => (i ? ["§§§", ...j.prep.prot.map((p) => p.s)] : j.prep.prot.map((p) => p.s)));
          const flat = await mtLines(all);
          const groups = [[]];
          for (const l of flat) { if (l.trim() === "§§§") groups.push([]); else groups[groups.length - 1].push(l); }
          if (groups.length === batch.length && groups.every((g, i) => g.length === batch[i].prep.lines.length)) outs = groups;
        } catch {}
      }
      for (let i = 0; i < batch.length; i++) {
        const j = batch[i];
        try {
          const out = outs ? outs[i] : await mtLines(j.prep.prot.map((p) => p.s));
          const res = finishTr(j.prep, out);
          TR_MEM[j.key] = res;
          dataSet(j.key, res);
          j.resolve.forEach((f) => f(res));
        } catch (e) { j.reject.forEach((f) => f(e)); }
      }
    }
  } finally { trBusy = false; }
}
async function translateTip(tip, priority) {
  const key = "tr" + TR_VER + "_" + tip.key;
  if (TR_MEM[key]) return TR_MEM[key];
  const cached = await dataGet(key);
  if (cached) return (TR_MEM[key] = cached);
  const existing = trPending.find((j) => j.key === key);
  return new Promise((resolve, reject) => {
    if (existing) {
      existing.resolve.push(resolve); existing.reject.push(reject);
      if (priority) { trPending.splice(trPending.indexOf(existing), 1); trPending.unshift(existing); }
    } else {
      const prep = prepTip(tip);
      const job = { key, prep, chars: prep.lines.join(" ").length, resolve: [resolve], reject: [reject] };
      if (priority) trPending.unshift(job); else trPending.push(job);
    }
    setTimeout(trFlush, 60);
  });
}

// Pinta el texto de una pista y lo cambia por la traducción cuando llega
function tipTextHTML(tip) {
  return `<div class="tiptext" data-tr="${esc(tip.key)}">${textHTML(tip.text)}</div>`;
}
let trObserver = null;
function fillTranslations(root = app, priority = false) {
  const els = [...root.querySelectorAll("[data-tr]")];
  const work = async (el) => {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const tip = findTip(el.dataset.tr);
    if (!tip) return;
    const render = (tr, pending) => {
      const showOrig = el.dataset.orig === "1" || (S.settings.original && el.dataset.orig !== "0");
      const useTr = tr && !showOrig;
      el.innerHTML = (pending ? `<div class="trwait">Traduciendo…</div>` : "") +
        `<div class="${pending ? "faded" : ""}">${textHTML(useTr ? tr.text : tip.text)}</div>` +
        (pending ? "" : `<button class="linkbtn">${useTr ? "Ver original (inglés)" : tr ? "Ver en español" : "Traducir"}</button>`);
      const b = el.querySelector(".linkbtn");
      if (b) b.onclick = async () => {
        if (!tr) { el.dataset.orig = "0"; render(null, true); try { render(await translateTip(tip, true)); } catch { render(null); } return; }
        el.dataset.orig = useTr ? "1" : "0";
        render(tr);
      };
    };
    if (S.settings.original) return render(null);
    const cached = TR_MEM["tr" + TR_VER + "_" + tip.key];
    if (cached) return render(cached);
    render(null, true);
    try { render(await translateTip(tip, priority)); } catch { render(null); }
  };
  if (priority || !("IntersectionObserver" in window)) return els.forEach(work);
  if (!trObserver) trObserver = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { trObserver.unobserve(e.target); work(e.target); }
  }, { rootMargin: "800px 0px" });
  els.forEach((el) => trObserver.observe(el));
}

/* ---------------- Texto ---------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inlineMd(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "<u>$1</u>")
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s.,;:!?)])/g, "$1<i>$2</i>");
}
function textHTML(lines) {
  let html = "", list = false;
  for (const raw of lines || []) {
    for (const line of String(raw).split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (/^[-•]\s+/.test(t)) {
        if (!list) { html += "<ul>"; list = true; }
        html += `<li>${inlineMd(t.replace(/^[-•]\s+/, ""))}</li>`;
      } else {
        if (list) { html += "</ul>"; list = false; }
        html += `<p>${inlineMd(t)}</p>`;
      }
    }
  }
  if (list) html += "</ul>";
  return html;
}
function catsHTML(tip) {
  const cats = (tip.cats || []).map((id) => CATS.find((c) => c.id === id)).filter(Boolean);
  if (!cats.length) return "";
  return `<div class="tags">${cats.map((c) => `<span class="badge">${c.icon} ${esc(c.name)}</span>`).join("")}</div>`;
}

/* ---------------- Planificador (repaso espaciado) ---------------- */

function newCard() { return { s: "learn", step: 0, ivl: 0, ease: 2.5, due: Date.now(), reps: 0, lapses: 0 }; }

function grade(key, correct) {
  const c = S.cards[key];
  const now = Date.now();
  c.reps++;
  if (c.s === "learn") {
    if (correct) {
      c.step++;
      if (c.step >= 2) {
        c.s = "review";
        c.ivl = Math.max(1, c.ivl || 1);
        c.due = now + c.ivl * DAY - 3 * 3600000;
        return false;
      }
      c.due = now;
      return true;
    }
    c.step = 0; c.due = now;
    return true;
  }
  if (correct) {
    const fuzz = 0.95 + Math.random() * 0.1;
    c.ivl = Math.max(c.ivl + 1, Math.round(c.ivl * c.ease * fuzz));
    c.ease = Math.min(3, c.ease + 0.02);
    c.due = now + c.ivl * DAY - 3 * 3600000;
    return false;
  }
  c.lapses++;
  c.ease = Math.max(1.3, c.ease - 0.2);
  c.ivl = Math.max(1, Math.round(c.ivl * 0.4));
  c.s = "learn"; c.step = 0; c.due = now;
  return true;
}

/* ---------------- Progreso y desbloqueo ---------------- */

function countryProgress(slug) {
  const tips = deckTips(slug);
  if (!tips.length) return { total: 0, seen: 0, mastered: 0, pct: 0 };
  let seen = 0, mastered = 0;
  for (const t of tips) {
    if (S.introduced[t.key]) seen++;
    const c = S.cards[t.key + "|p"];
    if (c && c.s === "review" && c.ivl >= 3) mastered++;
  }
  return { total: tips.length, seen, mastered, pct: mastered / tips.length };
}
function overallMastery() {
  let total = 0, mastered = 0;
  for (const slug of S.unlocked) {
    if (!DATA[slug]) continue;
    const p = countryProgress(slug);
    total += p.total; mastered += p.mastered;
  }
  return total ? mastered / total : 0;
}
function nextLocked() { return unlockOrder().find((s) => !S.unlocked.includes(s)) || null; }

async function unlock(slug, silent) {
  if (!slug || S.unlocked.includes(slug)) return;
  S.unlocked.push(slug);
  save();
  if (!silent) toast(`🔓 Nuevo país: ${flag(slug)} ${countryName(slug)}`);
  loadCountry(slug).catch(() => {});
}
function unlockAll() {
  for (const s of unlockOrder()) if (!S.unlocked.includes(s)) S.unlocked.push(s);
  save();
  toast("🔓 Todos los países desbloqueados");
  prefetchAll();
}
async function maybeUnlock() {
  if (!S.unlocked.length || S.unlocked.some((s) => !DATA[s]) || overallMastery() < UNLOCK_THRESHOLD) return;
  const n = nextLocked();
  if (!n) return;
  try { await loadCountry(n); } catch { return; }
  await unlock(n);
}

/* ---------------- Opciones (distractores) ---------------- */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function options(slug, poolSlugs) {
  const fam = family(slug);
  const pool = (poolSlugs && poolSlugs.length > 6 ? poolSlugs : COUNTRIES.map((c) => c.slug)).filter((s) => s !== slug && BY_SLUG[s] && family(s) !== fam);
  const picked = new Set();
  const conf = S.confusion[slug] || {};
  // Como mucho 1 país con el que te sueles confundir (si has fallado 2+ veces), y no siempre
  const confused = Object.entries(conf).filter(([s, n]) => n >= 2 && pool.includes(s)).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  if (confused.length && Math.random() < 0.7) picked.add(confused[Math.floor(Math.random() * Math.min(3, confused.length))]);
  const cats = BY_SLUG[slug]?.cat || [];
  const sameCat = shuffle(pool.filter((s) => (BY_SLUG[s].cat || []).some((c) => cats.includes(c))));
  for (const s of sameCat) { if (picked.size >= 3) break; picked.add(s); }
  for (const s of shuffle([...pool])) { if (picked.size >= 3) break; picked.add(s); }
  return shuffle([slug, ...[...picked].slice(0, 3)]);
}

/* ---------------- Sesiones ---------------- */

let session = null;
let lastLink = {};

function dueCards() {
  const now = Date.now();
  return Object.entries(S.cards)
    .filter(([k, c]) => c.due <= now && S.unlocked.includes(k.split("/")[0]) && DATA[k.split("/")[0]] && !S.hidden[k.replace(/\|[pl]$/, "")])
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);
}
function newTipsAvailable(limit) {
  const out = [];
  const lists = S.unlocked.filter((s) => DATA[s]).map((s) => deckTips(s).filter((t) => !S.introduced[t.key]));
  let i = 0;
  while (out.length < limit && lists.some((l) => l.length)) {
    const l = lists[i % lists.length];
    if (l.length) out.push(l.shift().key);
    i++;
  }
  return out;
}
function newLeftToday() { return Math.max(0, S.settings.newPerDay - S.newToday); }

function loadingScreen(msg) {
  app.innerHTML = `<div class="loading">${esc(msg)}</div>`;
}

let starting = false;
async function startDaily() {
  if (starting || session) return;
  starting = true;
  try { await startDailyInner(); } finally { starting = false; }
}
async function startDailyInner() {
  rollDay();
  loadingScreen("Preparando…");
  // Carga los países desbloqueados que hagan falta (de la caché o, si no, de Plonkit)
  const need = S.unlocked.filter((s) => !DATA[s]);
  if (need.length) {
    const slugsWithCards = new Set(Object.keys(S.cards).map((k) => k.split("/")[0]));
    const first = need.filter((s) => slugsWithCards.has(s)).concat(need.filter((s) => !slugsWithCards.has(s)).slice(0, 6));
    for (const s of need) await loadCountryLocal(s);
    const still = first.filter((s) => !DATA[s]);
    if (still.length) await loadMany(still, (i, n) => loadingScreen(`Descargando pistas… ${i}/${n}`));
  }
  const due = dueCards().slice(0, 80);
  const fresh = newTipsAvailable(newLeftToday());
  const queue = [];
  let di = 0;
  for (const k of fresh) {
    for (let n = 0; n < 3 && di < due.length; n++) queue.push({ type: "card", key: due[di++] });
    queue.push({ type: "intro", key: k });
  }
  while (di < due.length) queue.push({ type: "card", key: due[di++] });
  if (!queue.length) { toast("No hay nada pendiente ahora mismo 👌"); return go("home"); }
  beginSession({ mode: "daily", queue });
}

async function startPractice(catId, level) {
  if (starting || session) return;
  starting = true;
  try { await startPracticeInner(catId, level); } finally { starting = false; }
}
async function startPracticeInner(catId, level) {
  const tab = currentTab;
  loadingScreen("Preparando…");
  const slugs = levelCountries(level);
  const missing = [];
  for (const s of slugs) if (!(await loadCountryLocal(s))) missing.push(s);
  if (missing.length) await loadMany(missing, (i, n) => { if (currentTab === tab) loadingScreen(`Preparando países… ${i}/${n}\n(solo la primera vez)`); });
  if (currentTab !== tab) return;
  const loaded = slugs.filter((s) => DATA[s]);
  let pool = loaded.flatMap((s) => allTips(s, true));
  if (catId === "ubicacion") pool = pool.filter((t) => t.links.length);
  else if (catId !== "mezcla") pool = pool.filter((t) => (t.cats || []).includes(catId));
  if (!pool.length) { toast("No hay pistas de este tipo en este nivel"); return go("practice"); }
  // Reparte entre países para que no salga siempre el mismo
  const byCountry = {};
  for (const t of shuffle(pool)) (byCountry[t.slug] = byCountry[t.slug] || []).push(t);
  const picked = [];
  const lists = shuffle(Object.values(byCountry));
  for (let i = 0; picked.length < 32 && lists.some((l) => l.length); i++) {
    const l = lists[i % lists.length];
    if (l.length) picked.push(l.shift());
  }
  const queue = picked.map((t) => ({ type: "practice", key: t.key, locOnly: catId === "ubicacion" }));
  beginSession({ mode: "practice", queue, pool: loaded, catId, level, goal: Math.min(20, queue.length) });
}

function beginSession(s) {
  session = Object.assign({ done: 0, right: 0, wrong: 0, shown: 0, total: s.queue.length }, s);
  document.body.classList.add("in-session");
  prefetchSessionLocations();
  nextItem();
}

// Prepara las siguientes tarjetas (ubicaciones y traducciones) mientras respondes
function prefetchSessionLocations() {
  if (!session) return;
  const tips = session.queue.slice(0, 4).map((q) => findTip(q.key.replace(/\|[pl]$/, ""))).filter(Boolean);
  for (const t of tips) {
    translateTip(t).catch(() => {});
    if (t.links.length && !t.links.some((l) => RES[l])) {
      (async () => { for (const l of shuffle([...t.links])) { if (await resolveLink(l)) break; } })();
    }
  }
}

function endSession() {
  document.body.classList.remove("in-session", "answered");
  const s = session;
  session = null;
  if (s && !s.done && s.total) toast(navigator.onLine ? "No se pudo cargar ninguna tarjeta" : "Sin conexión: prueba más tarde");
  if (s && s.done) {
    if (s.mode === "daily") {
      S.history.push({ d: today(), right: s.right, wrong: s.wrong });
      S.history = S.history.slice(-200);
      save();
    }
    app.innerHTML = `
      <h1>${s.mode === "daily" ? "Sesión terminada" : "Práctica terminada"}</h1>
      <div class="stats">
        <div class="stat"><b>${s.right}</b><span>aciertos</span></div>
        <div class="stat"><b>${s.wrong}</b><span>fallos</span></div>
      </div>
      ${s.mode === "practice" ? `<button class="btn" id="again">Otra ronda</button><div style="height:10px"></div>` : ""}
      <button class="btn ghost" id="home">Volver</button>`;
    if ($("#again")) $("#again").onclick = () => startPractice(s.catId, s.level);
    $("#home").onclick = () => go(s.mode === "daily" ? "home" : "practice");
  } else go(currentTab === "practice" ? "practice" : "home");
  prefetchAll();
}

function requeue(item, gap) {
  // Si no quedan otras tarjetas, no repetirla seguida: vuelve en 10 minutos
  if (!session.queue.length) { const c = S.cards[item.key]; if (c) { c.due = Date.now() + 10 * 60000; save(); } return; }
  session.queue.splice(Math.min(session.queue.length, gap), 0, item);
  session.total++;
}

async function nextItem() {
  if (!session) return;
  window.scrollTo(0, 0);
  if (session.goal && session.shown >= session.goal) return endSession();
  const item = session.queue.shift();
  if (!item) return endSession();
  prefetchSessionLocations();
  if (item.type === "intro") return showIntro(item);
  const tipKey = item.key.replace(/\|[pl]$/, "");
  const tip = findTip(tipKey);
  if (!tip) { if (S.cards[item.key]) { delete S.cards[item.key]; save(); } return nextItem(); }
  app.innerHTML = topbar() + `<div class="loading">Cargando ubicación…</div>`;
  bindQuit();
  const loc = tip.links.length && navigator.onLine ? await pickLocation(tip, lastLink[tip.key], item.retry) : null;
  if (!session) return;
  if (!loc && (item.locOnly || !tip.img)) {
    if (item.type === "card" && S.cards[item.key]) {
      if (tip.links.length && tip.links.every((l) => RES[l] === false)) S.hidden[tip.key] = 1; // ya no tiene ubicaciones
      else S.cards[item.key].due = Date.now() + 3600e3; // sin conexión: más tarde
      save();
    }
    return nextItem();
  }
  if (loc) lastLink[tip.key] = loc.link;
  session.shown++;
  showCard(item, tip, loc);
}

function topbar() {
  let pct, label;
  if (session.goal) { pct = (session.shown / session.goal) * 100; label = `${session.shown}/${session.goal}`; }
  else { pct = session.total ? (session.done / session.total) * 100 : 0; label = `${session.queue.length + 1} restantes`; }
  return `<div class="topbar"><button class="x" id="quit" aria-label="Salir">✕</button>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <span class="small muted">${label}</span></div>`;
}
function bindQuit() { $("#quit").onclick = () => endSession(); }

function showIntro(item) {
  const tip = findTip(item.key);
  if (!tip) return nextItem();
  app.innerHTML = `${topbar()}
    <div class="kind">✨ Pista nueva</div>
    ${tip.img ? `<div class="clue">${imgHTML(tip.img)}</div>` : ""}
    <div class="intro-head"><span class="flag">${flag(tip.slug)}</span><b>${esc(countryName(tip.slug))}</b></div>
    ${catsHTML(tip)}
    ${tipTextHTML(tip)}
    <p class="small muted">${tip.links.length ? `En el repaso te saldrá en ${tip.links.length > 1 ? tip.links.length + " ubicaciones reales distintas" : "una ubicación real"} de Street View.` : ""}</p>
    <div class="sticky"><button class="btn" id="ok">Entendido</button></div>`;
  bindQuit();
  fillTranslations(app, true);
  const ok = $("#ok");
  ok.disabled = true; setTimeout(() => (ok.disabled = false), 400);
  ok.onclick = () => {
    if (ok.dataset.used) return;
    ok.dataset.used = 1;
    S.introduced[tip.key] = today();
    S.newToday++;
    S.cards[tip.key + "|p"] = S.cards[tip.key + "|p"] || newCard();
    save();
    session.done++;
    requeue({ type: "card", key: tip.key + "|p" }, 2);
    nextItem();
  };
}

function showCard(item, tip, loc) {
  const opts = options(tip.slug, session.mode === "practice" ? session.pool : null);
  app.innerHTML = `${topbar()}
    <div class="kind">${loc ? "📍 ¿En qué país estás?" : "🔎 ¿De qué país es esta pista?"}</div>
    ${loc ? svHTML(loc) : `<div class="clue">${imgHTML(tip.img)}</div>`}
    ${loc && session.mode === "practice" && session.catId !== "mezcla" && session.catId !== "ubicacion" ? `<p class="small muted" style="margin:6px 0 0">Fíjate en: ${CATS.find((c) => c.id === session.catId).icon} ${esc(CATS.find((c) => c.id === session.catId).name.toLowerCase())}</p>` : ""}
    <div class="opts">${opts.map((s) => `<button class="opt" data-s="${s}"><span class="f">${flag(s)}</span><span class="n">${esc(countryName(s))}</span></button>`).join("")}</div>
    <div id="back"></div>`;
  bindQuit();
  let answered = false;
  app.querySelectorAll(".opt").forEach((b) => (b.onclick = () => { if (answered) return; answered = true; answer(item, tip, !!loc, b.dataset.s); }));
}

function answer(item, tip, isLoc, chosen) {
  const correct = chosen === tip.slug;
  app.querySelectorAll(".opt").forEach((b) => {
    b.disabled = true;
    if (b.dataset.s === tip.slug) b.classList.add("good");
    else if (b.dataset.s === chosen) b.classList.add("bad");
  });
  if (!correct) {
    const c = (S.confusion[tip.slug] = S.confusion[tip.slug] || {});
    c[chosen] = (c[chosen] || 0) + 1;
  }
  let again = false;
  if (item.type === "card") {
    if (!S.cards[item.key]) S.cards[item.key] = newCard();
    again = grade(item.key, correct);
  }
  session.done++;
  if (correct) session.right++; else session.wrong++;
  if (again) requeue(item, correct ? 4 : 3);
  if (!correct && item.type === "practice" && !item.retry) { requeue({ ...item, retry: true }, 5); if (session.goal) session.goal = Math.min(session.goal + 1, 25); }
  save();
  if (navigator.vibrate) try { navigator.vibrate(correct ? 15 : [30, 40, 30]); } catch {}
  // Hoja inferior: veredicto + Siguiente siempre a mano, explicación desplazable debajo
  $("#back").innerHTML = `<div class="sheet ${correct ? "good" : "bad"}">
      <div class="sheet-head">
        <div class="verdict ${correct ? "good" : "bad"}">${correct ? "✓ ¡Correcto! " + flag(tip.slug) + " " + esc(countryName(tip.slug))
          : `<span class="small muted">Elegiste ${esc(countryName(chosen))}</span><br>✗ Era ${flag(tip.slug)} ${esc(countryName(tip.slug))}`}</div>
        <button class="btn" id="next">Siguiente</button>
      </div>
      <div class="sheet-body">
        ${catsHTML(tip)}
        ${tipTextHTML(tip)}
        ${tip.img && isLoc ? `<div class="clue small-clue" data-zoom>${imgHTML(tip.img)}</div>` : ""}
        <button class="linkbtn muted" id="hide">🙈 No volver a mostrar esta tarjeta</button>
      </div>
    </div>`;
  $("#hide").onclick = () => {
    if (!confirm("¿Ocultar esta tarjeta? Puedes recuperarla en Ajustes.")) return;
    S.hidden[tip.key] = 1; save();
    const before = session.queue.length;
    session.queue = session.queue.filter((q) => q.key.replace(/\|[pl]$/, "") !== tip.key);
    session.total -= before - session.queue.length;
    toast("Tarjeta oculta");
  };
  document.body.classList.add("answered");
  fillTranslations($("#back"), true);
  const nx = $("#next");
  nx.disabled = true; setTimeout(() => (nx.disabled = false), 350);
  nx.onclick = async () => {
    if (nx.dataset.used) return;
    nx.dataset.used = 1;
    document.body.classList.remove("answered");
    if (session.mode === "daily") await maybeUnlock();
    nextItem();
  };
}

/* ---------------- Pantallas ---------------- */

let currentTab = "home";
function go(tab, arg) {
  currentTab = tab;
  if (trObserver) { trObserver.disconnect(); trObserver = null; }
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab || (tab === "country" && b.dataset.tab === "countries")));
  window.scrollTo(0, 0);
  if (tab === "home") renderHome();
  else if (tab === "practice") renderPractice();
  else if (tab === "countries") renderCountries();
  else if (tab === "country") renderCountry(arg);
  else if (tab === "settings") renderSettings();
}
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => { if (!session) go(b.dataset.tab); }));

async function renderHome() {
  rollDay();
  for (const s of S.unlocked) await loadCountryLocal(s);
  if (currentTab !== "home") return;
  const due = dueCards().length;
  const fresh = Math.min(newLeftToday(), newTipsAvailable(999).length || (S.unlocked.some((s) => !DATA[s]) ? newLeftToday() : 0));
  const mastery = overallMastery();
  const next = nextLocked();
  const shown = S.unlocked.slice(0, 40);
  app.innerHTML = `
    <h1>Repaso diario</h1>
    <div class="stats">
      <div class="stat"><b>${due}</b><span>para repasar</span></div>
      <div class="stat"><b>${fresh}</b><span>pistas nuevas hoy</span></div>
    </div>
    <button class="btn" id="start" ${due + fresh ? "" : "disabled"}>${due + fresh ? "Empezar" : "Todo hecho por hoy ✅"}</button>
    <div style="height:10px"></div>
    <button class="btn ghost" id="toPractice">🎯 Practicar por tipo de pista</button>
    <h2>Tus países (${S.unlocked.length})</h2>
    <div class="panel">
      <div class="small muted" style="display:flex;justify-content:space-between">
        <span>Dominio global</span><span>${Math.round(mastery * 100)}% / ${UNLOCK_THRESHOLD * 100}%</span>
      </div>
      <div class="progress" style="margin:8px 0 6px"><i style="width:${Math.min(100, (mastery / UNLOCK_THRESHOLD) * 100)}%"></i></div>
      <div class="small muted">${next ? `Siguiente país al llegar al ${UNLOCK_THRESHOLD * 100}%: ${flag(next)} ${esc(countryName(next))}` : "¡Tienes todos los países desbloqueados!"}</div>
    </div>
    <div class="clist">${shown.map(countryItem).join("")}</div>
    ${S.unlocked.length > shown.length ? `<p class="small muted">…y ${S.unlocked.length - shown.length} más en la pestaña Países.</p>` : ""}
    <p class="small muted" style="margin-top:20px">Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0. Panorámicas © Google.</p>`;
  $("#start").onclick = startDaily;
  $("#toPractice").onclick = () => go("practice");
  bindCountryItems();
}

function renderPractice() {
  const level = S.settings.level;
  app.innerHTML = `
    <h1>Practicar</h1>
    <p class="muted small">Rondas de 20 tarjetas: ubicaciones reales de Street View siempre que la pista las tenga (si no, la foto de la pista). No cuentan para tu repaso diario.</p>
    <h3>Nivel</h3>
    <div class="seg">${Object.entries(LEVELS).map(([id, l]) => `<button data-l="${id}" class="${id === level ? "on" : ""}">${l.name}</button>`).join("")}</div>
    <p class="small muted" style="margin-top:6px">${esc(LEVELS[level].desc)}${level === "dificil" ? ` (${COUNTRIES.length})` : ""}</p>
    <h3>Modo</h3>
    <div class="modes">${CATS.map((c) => `<button class="mode" data-c="${c.id}"><span>${c.icon}</span>${esc(c.name)}</button>`).join("")}</div>`;
  app.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { S.settings.level = b.dataset.l; save(); renderPractice(); }));
  app.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => startPractice(b.dataset.c, S.settings.level)));
}

function countryItem(slug) {
  const unlocked = S.unlocked.includes(slug);
  const p = DATA[slug] ? countryProgress(slug) : null;
  const right = unlocked ? (p ? `<span class="badge on">${Math.round(p.pct * 100)}%</span>` : `<span class="badge on">✓</span>`) : `<span class="badge">🔒</span>`;
  const CONT = { Europe: "Europa", Asia: "Asia", Africa: "África", "North America": "Norteamérica", "South America": "Sudamérica", Oceania: "Oceanía", Antarctica: "Antártida" };
  const sub = p && unlocked ? `${p.seen}/${p.total} vistas · ${p.mastered} dominadas` : (BY_SLUG[slug]?.cat || []).map((c) => CONT[c] || c).join(", ");
  return `<button class="citem ${unlocked ? "" : "locked"}" data-slug="${slug}">
    <span class="flag">${flag(slug)}</span>
    <span class="info"><b>${esc(countryName(slug))}</b><span class="small muted">${esc(sub)}</span>
    ${p && unlocked ? `<div class="progress" style="margin-top:6px"><i style="width:${p.pct * 100}%"></i></div>` : ""}</span>
    ${right}</button>`;
}
function bindCountryItems() {
  app.querySelectorAll(".citem").forEach((b) => (b.onclick = () => go("country", b.dataset.slug)));
}

async function renderCountries() {
  for (const s of S.unlocked) await loadCountryLocal(s);
  if (currentTab !== "countries") return;
  const order = unlockOrder();
  const unl = order.filter((s) => S.unlocked.includes(s));
  const locked = order.filter((s) => !S.unlocked.includes(s));
  app.innerHTML = `
    <h1>Países</h1>
    <p class="muted small">Toca un país para leer su guía completa en español.</p>
    ${locked.length ? `<button class="btn ghost small" id="all">🔓 Desbloquear todos los países (${order.length})</button>` : ""}
    <h2>Desbloqueados (${unl.length})</h2>
    <div class="clist">${unl.map(countryItem).join("")}</div>
    ${locked.length ? `<h2>Bloqueados (${locked.length})</h2><div class="clist">${locked.map(countryItem).join("")}</div>` : ""}`;
  if ($("#all")) $("#all").onclick = () => { unlockAll(); renderCountries(); };
  bindCountryItems();
}

let guideReq = 0;
async function renderCountry(slug) {
  const my = ++guideReq;
  loadingScreen(`Cargando ${countryName(slug)}…`);
  let d;
  try { d = await loadCountry(slug); }
  catch (e) {
    if (my !== guideReq) return;
    app.innerHTML = `<div class="panel">No se pudo cargar ${esc(countryName(slug))}. ${navigator.onLine ? "Inténtalo de nuevo en un rato." : "Parece que no tienes conexión."}</div><button class="btn ghost" id="b">Volver</button>`;
    $("#b").onclick = () => go("countries"); return;
  }
  if (currentTab !== "country" || my !== guideReq) return;
  const unlocked = S.unlocked.includes(slug);
  const p = countryProgress(slug);
  app.innerHTML = `
    <div class="guidebar"><button class="x" id="b" aria-label="Volver">←</button><b>${flag(slug)} ${esc(countryName(slug))}</b>
      <span class="chips">${d.steps.map((st, i) => `<button class="chip" data-go="${i}">${esc(stepTitle(st.title))}</button>`).join("")}</span></div>
    ${unlocked
      ? `<div class="panel small"><div class="progress" style="margin-bottom:6px"><i style="width:${p.pct * 100}%"></i></div>${p.seen}/${p.total} pistas vistas · ${p.mastered} dominadas</div>`
      : `<button class="btn" id="unl">🔓 Desbloquear ahora</button>`}
    ${d.steps.map((st, i) => `
      <details class="gsec" id="sec${i}" ${i === 0 ? "open" : ""}>
        <summary>${esc(stepTitle(st.title))} <span class="muted small">(${st.tips.length})</span></summary>
        ${st.tips.map((t) => `<div class="guide-tip">
            ${t.img ? `<div class="clue" data-zoom>${imgHTML(t.img)}</div>` : ""}
            <div class="body">${t.sub ? `<div class="small muted">${esc(t.sub)}</div>` : ""}${catsHTML(t)}${tipTextHTML(withMeta(t, slug))}</div>
          </div>`).join("")}
      </details>`).join("")}
    <p class="small muted">Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0.</p>`;
  app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => {
    const sec = $("#sec" + b.dataset.go); sec.open = true;
    sec.scrollIntoView({ block: "start" });
    setTimeout(() => sec.scrollIntoView({ block: "start" }), 400);
  }));
  $("#b").onclick = () => go("countries");
  const u = $("#unl");
  if (u) u.onclick = async () => { await unlock(slug); go("country", slug); };
  fillTranslations();
}
function stepTitle(t) {
  if (/maps and resources/i.test(t)) return "Mapas";
  if (/^identif/i.test(t)) return "Cómo identificarlo";
  if (/spotlight/i.test(t)) return "Destacados";
  if (/regional|region|province|state|county|district/i.test(t)) return "Pistas regionales";
  if (/coverage/i.test(t)) return "Cobertura";
  return t;
}

async function renderSettings() {
  let cached = 0;
  for (const s of unlockOrder()) if (await loadCountryLocal(s)) cached++;
  if (currentTab !== "settings") return;
  app.innerHTML = `
    <h1>Ajustes</h1>
    <div class="panel">
      <label class="set">Pistas nuevas al día
        <select id="npd">${[5, 10, 15, 20, 30, 50].map((n) => `<option ${n === S.settings.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>
      <label class="set">Textos en inglés (sin traducir)
        <input type="checkbox" id="orig" ${S.settings.original ? "checked" : ""}>
      </label>
    </div>
    <h2>Datos sin conexión</h2>
    <p class="small muted">Países descargados: ${cached}/${COUNTRIES.length}. Se descargan solos poco a poco mientras usas la app.</p>
    ${cached < COUNTRIES.length ? `<button class="btn ghost small" id="dl">Descargar todos ahora</button>` : ""}
    <h2>Copia de seguridad</h2>
    <p class="small muted">El progreso se guarda solo en este móvil. Exporta una copia de vez en cuando por si borras los datos del navegador.</p>
    <div class="row">
      <button class="btn ghost small" id="exp">Exportar</button>
      <button class="btn ghost small" id="imp">Importar</button>
    </div>
    <input type="file" id="file" accept="application/json" hidden>
    ${Object.keys(S.hidden).length ? `<h2>Tarjetas ocultas</h2><p class="small muted">Has ocultado ${Object.keys(S.hidden).length}.</p><button class="btn ghost small" id="unhide">Volver a mostrarlas</button>` : ""}
    <h2>Avanzado</h2>
    <div class="row">
      <button class="btn ghost small" id="refresh">Actualizar pistas</button>
      <button class="btn ghost small" id="reset" style="color:var(--bad)">Borrar progreso</button>
    </div>
    <p class="small muted" style="margin-top:20px">Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0. Panorámicas © Google Street View. Traducción automática.</p>`;
  $("#npd").onchange = (e) => { S.settings.newPerDay = +e.target.value; save(); toast("Guardado"); };
  $("#orig").onchange = (e) => { S.settings.original = e.target.checked; save(); toast("Guardado"); };
  if ($("#unhide")) $("#unhide").onclick = () => { S.hidden = {}; save(); toast("Listo"); go("settings"); };
  if ($("#dl")) $("#dl").onclick = async () => {
    const missing = [];
    for (const s of unlockOrder()) if (!(await loadCountryLocal(s))) missing.push(s);
    await loadMany(missing, (i, n) => loadingScreen(`Descargando países… ${i}/${n}`));
    toast("Listo");
    go("settings");
  };
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify(S)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `plonk-progreso-${today()}.json`;
    a.click();
  };
  $("#imp").onclick = () => $("#file").click();
  $("#file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    e.target.value = "";
    try {
      const s = JSON.parse(await f.text());
      if (s.v !== 1 || !s.cards) throw new Error();
      if (!confirm("¿Sustituir tu progreso actual por el de la copia?")) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
      S = loadState(); save();
      await initUnlocked();
      toast("Progreso importado");
      go("home");
    } catch { toast("Ese archivo no es una copia válida"); }
  };
  $("#refresh").onclick = async () => {
    if (!confirm("¿Volver a descargar las pistas de Plonkit? Tu progreso y las traducciones se mantienen.")) return;
    try {
      const c = await caches.open(DATA_CACHE);
      for (const r of await c.keys()) if (/\/__data\/(c_|countries)/.test(new URL(r.url).pathname)) await c.delete(r);
    } catch {}
    for (const k in DATA) delete DATA[k];
    toast("Se volverán a descargar al usarlas");
    go("settings");
  };
  $("#reset").onclick = async () => {
    if (!confirm("¿Seguro? Se borrará todo tu progreso de este móvil.")) return;
    S = defaultState(); save();
    await initUnlocked();
    toast("Progreso borrado");
    go("home");
  };
}

/* ---------------- Utilidades ---------------- */

// Tocar una imagen de Plonkit la amplía
document.addEventListener("click", (e) => {
  const z = e.target.closest("[data-zoom] img");
  if (!z) return;
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<img src="${z.src}" alt=""><span>Toca para cerrar</span>`;
  box.onclick = () => box.remove();
  document.body.appendChild(box);
});

let toastT;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2600);
}

async function initUnlocked() {
  if (S.unlocked.length) return;
  for (const s of unlockOrder().slice(0, START_UNLOCKED)) await unlock(s, true);
}

/* ---------------- PIN ---------------- */
// SHA-256 del PIN. No es seguridad real: solo evita que alguien entre por casualidad.
const PIN_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function pinGate() {
  if (localStorage.getItem("plonk_pin_ok") === PIN_HASH) return Promise.resolve();
  document.body.classList.add("in-session");
  return new Promise((resolve) => {
    let entered = "";
    const draw = (msg = "") => {
      app.innerHTML = `
        <div style="text-align:center;padding-top:10vh">
          <h1>Plonk Tarjetas</h1>
          <p class="muted">Introduce el PIN</p>
          <div class="pindots">${[0, 1, 2, 3].map((i) => `<i class="${i < entered.length ? "on" : ""}"></i>`).join("")}</div>
          <p style="color:var(--bad);min-height:1.4em">${msg}</p>
          <div class="opts" style="grid-template-columns:repeat(3,1fr);max-width:300px;margin:0 auto">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => (k === "" ? "<span></span>" : `<button class="opt" data-k="${k}">${k}</button>`)).join("")}
          </div>
        </div>`;
      app.querySelectorAll("[data-k]").forEach((b) => (b.onclick = async () => {
        const k = b.dataset.k;
        if (k === "⌫") entered = entered.slice(0, -1);
        else if (entered.length < 4) entered += k;
        if (entered.length === 4) {
          if ((await sha256(entered)) === PIN_HASH) {
            localStorage.setItem("plonk_pin_ok", PIN_HASH);
            document.body.classList.remove("in-session");
            return resolve();
          }
          entered = "";
          if (navigator.vibrate) try { navigator.vibrate([40, 40, 40]); } catch {}
          return draw("PIN incorrecto");
        }
        draw();
      }));
    };
    draw();
  });
}

async function boot() {
  // Limpieza de la caché antigua (versión 1 guardaba los países en localStorage)
  try { Object.keys(localStorage).filter((k) => k.startsWith("plonk_c_") || k === "plonk_countries" || k === "plonk_res_v3").forEach((k) => localStorage.removeItem(k)); } catch {}
  await pinGate();
  try {
    loadingScreen("Cargando…");
    await loadCountries();
    await initUnlocked();
    go("home");
    setTimeout(prefetchAll, 4000);
  } catch (e) {
    app.innerHTML = `<h1>Plonk Tarjetas</h1><div class="panel">No se pudieron cargar los datos de Plonkit.<br><span class="small muted">${esc(e.message)}</span></div><button class="btn" onclick="location.reload()">Reintentar</button>`;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
boot();
