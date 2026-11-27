"use strict";
/* Plonk Tarjetas — app personal de repaso de pistas de GeoGuessr.
   Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0. */

const DAY = 86400000;
const STORE_KEY = "plonk_state_v1";
const EASY_ORDER = [
  "spain", "united-states", "japan", "brazil", "russia", "united-kingdom", "france",
  "germany", "italy", "australia", "canada", "mexico", "south-africa", "india",
  "thailand", "poland", "argentina", "indonesia", "turkey", "netherlands", "sweden",
  "norway", "finland", "portugal", "south-korea", "new-zealand", "chile", "colombia",
  "peru", "philippines", "malaysia", "kenya", "greece", "romania", "ukraine",
];
const START_UNLOCKED = 3;
const UNLOCK_THRESHOLD = 0.8;

const NAME_OVERRIDES = {
  "US-AK": "Alaska", "US-HI": "Hawái", "UM-MQ": "Islas menores de EE. UU.",
  "PT-AZ": "Azores", "PT-MA": "Madeira",
};
const TAG_ES = {
  bollard: "bolardo", pole: "poste", roadline: "líneas de la carretera",
  "chevron/sign": "chevrón / señal", landscape: "paisaje", architecture: "arquitectura",
  vegetation: "vegetación", important: "importante", coverage: "cobertura",
  guardrail: "guardarraíl", "moving info": "info al moverse", "license plates": "matrículas",
  language: "idioma",
};

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const esNames = (() => { try { return new Intl.DisplayNames(["es"], { type: "region" }); } catch { return null; } })();

/* ---------------- Estado ---------------- */

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function defaultState() {
  return {
    v: 1, unlocked: [], cards: {}, introduced: {}, res: {}, confusion: {},
    day: today(), newToday: 0, settings: { newPerDay: 10 }, history: [],
  };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.v === 1) return Object.assign(defaultState(), s);
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

/* ---------------- Datos ---------------- */

let COUNTRIES = [];
const BY_SLUG = {};
const DATA = {};

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = r.status;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}
function cacheGet(key, maxAge) {
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && Date.now() - c.t < maxAge) return c.d;
  } catch {}
  return null;
}
function cacheSet(key, d) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch {}
}

// Las páginas de Plonkit llegan a través del proxy /pk/* (netlify.toml) y
// traen todos sus datos en un bloque JSON __PRELOADED_DATA__.
async function plonkPage(path) {
  const r = await fetch("/pk" + path);
  if (!r.ok) throw new Error(`Plonkit respondió ${r.status}`);
  const html = await r.text();
  const m = html.match(/<script id="__PRELOADED_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Plonkit no devolvió datos (" + path + ")");
  return JSON.parse(m[1]);
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
      tips.push({
        id: it.id, sub, text: it.data?.text || [],
        img: it.data?.image?.imageUrl || null, link: it.data?.image?.imageLink || null,
        tags: it.tags || [],
      });
    }
    steps.push({ index: si, title: s.title, tips });
  });
  return { slug: d.slug, title: d.title, code: d.code, cat: d.cat, updatedAt: d.updatedAt, steps };
}

async function loadCountries() {
  let list = cacheGet("plonk_countries", 7 * DAY);
  if (!list) {
    try { list = await fetchCountries(); cacheSet("plonk_countries", list); }
    catch (e) { list = cacheGet("plonk_countries", Infinity); if (!list) throw e; }
  }
  COUNTRIES = list;
  for (const c of list) BY_SLUG[c.slug] = c;
}

async function loadCountry(slug) {
  if (DATA[slug]) return DATA[slug];
  const key = "plonk_c_" + slug;
  let d = cacheGet(key, 7 * DAY);
  if (!d) {
    try { d = await fetchCountry(slug); cacheSet(key, d); }
    catch (e) { d = cacheGet(key, Infinity); if (!d) throw e; }
  }
  DATA[slug] = d;
  return d;
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
  const code = (c && c.code || "").slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((ch) => 127397 + ch.charCodeAt(0)));
}

function unlockOrder() {
  const slugs = COUNTRIES.map((c) => c.slug);
  const easy = EASY_ORDER.filter((s) => BY_SLUG[s]);
  return [...easy, ...slugs.filter((s) => !easy.includes(s))];
}

// Pistas que entran en el mazo: el primer bloque ("Identifying X") de cada país.
function deckTips(slug) {
  const d = DATA[slug];
  if (!d || !d.steps.length) return [];
  const step = d.steps.find((s) => /^identif/i.test(s.title)) || d.steps[0];
  return step.tips.filter((t) => t.img).map((t) => ({ ...t, slug, key: slug + "/" + t.id }));
}
function findTip(key) {
  const [slug] = key.split("/");
  return deckTips(slug).find((t) => t.key === key) || null;
}

/* ---------------- Imágenes y Street View ---------------- */

function imgHTML(path, alt = "") {
  if (!path) return "";
  const clean = path.replace(/^\/images\//, "");
  const proxied = "/pimg/" + clean.split("/").map(encodeURIComponent).join("/");
  const direct = "https://www.plonkit.net/images/resize/600/80/" + clean.split("/").map(encodeURIComponent).join("/");
  return `<img src="${proxied}" alt="${esc(alt)}" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${direct}'}">`;
}

function parseMaps(u) {
  try {
    const p = new URL(u);
    if (p.hostname.startsWith("consent.") && p.searchParams.get("continue")) u = p.searchParams.get("continue");
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

function isMapsLink(link) {
  return !!link && /^https?:\/\/(goo\.gl|maps\.app\.goo\.gl|(www\.)?google\.[a-z.]+\/maps)/.test(link);
}

async function resolveTip(tip) {
  if (tip.key in S.res) return S.res[tip.key];
  let r = parseMaps(tip.link);
  if (!r) {
    try { r = await getJSON("/api/resolve?u=" + encodeURIComponent(tip.link)); }
    catch (e) {
      // Si es un error de red, no lo marcamos como fallido para reintentar
      if (!navigator.onLine) return null;
      r = null;
    }
  }
  S.res[tip.key] = r && r.pano ? r : false;
  save();
  return S.res[tip.key];
}

function svHTML(r) {
  const fov = r.fov || 75;
  const zoom = Math.max(0, Math.min(2.5, Math.log2(90 / fov) - 0.3));
  const pb = `!4v0!6m8!1m7!1s${r.pano}!2m2!1d${r.lat || 0}!2d${r.lng || 0}!3f${(r.heading || 0).toFixed(2)}!4f${(r.pitch || 0).toFixed(2)}!5f${zoom.toFixed(2)}`;
  return `<div class="sv"><iframe src="https://www.google.com/maps/embed?pb=${pb}" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></div>`;
}

/* ---------------- Texto ---------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inlineMd(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "<u>$1</u>") // sin enlaces: todo dentro de la app
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>");
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
  return `<div class="tiptext">${html}</div>`;
}
function tagsHTML(tip) {
  const tags = (tip.tags || []).filter((t) => t !== "important");
  if (!tags.length && !tip.sub) return "";
  return `<div class="tags">${tags.map((t) => `<span class="badge">${esc(TAG_ES[t] || t)}</span>`).join("")}</div>`;
}

/* ---------------- Planificador (repaso espaciado) ---------------- */

function newCard() { return { s: "learn", step: 0, ivl: 0, ease: 2.5, due: Date.now(), reps: 0, lapses: 0 }; }

// Devuelve true si la tarjeta sigue en aprendizaje (vuelve a salir en esta sesión)
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
        onGraduate(key);
        return false;
      }
      c.due = now;
      return true;
    }
    c.step = 0; c.due = now;
    return true;
  }
  // review
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

// Al dominar la tarjeta de imagen, se activa la de ubicación (si hay panorámica)
function onGraduate(key) {
  if (!key.endsWith("|p")) return;
  const tipKey = key.slice(0, -2);
  const tip = findTip(tipKey);
  if (tip && isMapsLink(tip.link) && S.res[tipKey] !== false && !S.cards[tipKey + "|l"]) {
    S.cards[tipKey + "|l"] = newCard();
  }
}

/* ---------------- Progreso y desbloqueo ---------------- */

function countryProgress(slug) {
  const tips = deckTips(slug);
  if (!tips.length) return { total: 0, seen: 0, mastered: 0, pct: 0 };
  let seen = 0, mastered = 0;
  for (const t of tips) {
    if (S.introduced[t.key]) seen++;
    const c = S.cards[t.key + "|p"];
    if (c && c.s === "review") mastered++;
  }
  return { total: tips.length, seen, mastered, pct: mastered / tips.length };
}

function overallMastery() {
  let total = 0, mastered = 0;
  for (const slug of S.unlocked) {
    const p = countryProgress(slug);
    total += p.total; mastered += p.mastered;
  }
  return total ? mastered / total : 1;
}

function nextLocked() {
  return unlockOrder().find((s) => !S.unlocked.includes(s)) || null;
}

async function unlock(slug, silent) {
  if (!slug || S.unlocked.includes(slug)) return;
  await loadCountry(slug);
  S.unlocked.push(slug);
  save();
  if (!silent) toast(`🔓 Nuevo país: ${flag(slug)} ${countryName(slug)}`);
}

async function maybeUnlock() {
  if (overallMastery() >= UNLOCK_THRESHOLD) {
    const n = nextLocked();
    if (n) { try { await unlock(n); } catch {} }
  }
}

/* ---------------- Opciones (distractores) ---------------- */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function options(slug) {
  const pool = COUNTRIES.map((c) => c.slug).filter((s) => s !== slug);
  const picked = new Set();
  const conf = S.confusion[slug] || {};
  const confused = Object.entries(conf).sort((a, b) => b[1] - a[1]).map(([s]) => s).filter((s) => pool.includes(s));
  for (const s of confused.slice(0, 2)) picked.add(s);
  const cats = BY_SLUG[slug]?.cat || [];
  const sameCat = shuffle(pool.filter((s) => (BY_SLUG[s].cat || []).some((c) => cats.includes(c))));
  for (const s of sameCat) { if (picked.size >= 3) break; picked.add(s); }
  for (const s of shuffle([...pool])) { if (picked.size >= 3) break; picked.add(s); }
  return shuffle([slug, ...[...picked].slice(0, 3)]);
}

/* ---------------- Sesión ---------------- */

let session = null;

function dueCards() {
  const now = Date.now();
  return Object.entries(S.cards)
    .filter(([k, c]) => c.due <= now && S.unlocked.includes(k.split("/")[0]))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);
}

function newTipsAvailable(limit) {
  const out = [];
  const lists = S.unlocked.map((s) => deckTips(s).filter((t) => !S.introduced[t.key]));
  let i = 0;
  while (out.length < limit && lists.some((l) => l.length)) {
    const l = lists[i % lists.length];
    if (l.length) out.push(l.shift().key);
    i++;
  }
  return out;
}
function newLeftToday() { return Math.max(0, S.settings.newPerDay - S.newToday); }

async function startSession() {
  rollDay();
  await Promise.all(S.unlocked.map((s) => loadCountry(s).catch(() => null)));
  const due = dueCards().slice(0, 80);
  const fresh = newTipsAvailable(newLeftToday());
  const queue = [];
  let di = 0;
  for (const k of fresh) {
    for (let n = 0; n < 3 && di < due.length; n++) queue.push({ type: "card", key: due[di++] });
    queue.push({ type: "intro", key: k });
  }
  while (di < due.length) queue.push({ type: "card", key: due[di++] });
  if (!queue.length) { toast("No hay nada pendiente ahora mismo 👌"); return; }
  session = { queue, done: 0, right: 0, wrong: 0, total: queue.length };
  document.body.classList.add("in-session");
  prefetchLocations();
  nextItem();
}

function prefetchLocations() {
  if (!session) return;
  const keys = session.queue.filter((q) => q.type === "card" && q.key.endsWith("|l")).map((q) => q.key.slice(0, -2));
  (async () => {
    for (const k of keys.slice(0, 15)) {
      const tip = findTip(k);
      if (tip && !(k in S.res)) await resolveTip(tip);
    }
  })();
}

function endSession() {
  document.body.classList.remove("in-session");
  const s = session;
  session = null;
  if (s && s.done) {
    S.history.push({ d: today(), right: s.right, wrong: s.wrong });
    S.history = S.history.slice(-200);
    save();
    app.innerHTML = `
      <h1>Sesión terminada</h1>
      <div class="stats">
        <div class="stat"><b>${s.right}</b><span>aciertos</span></div>
        <div class="stat"><b>${s.wrong}</b><span>fallos</span></div>
      </div>
      <button class="btn" id="home">Volver al inicio</button>`;
    $("#home").onclick = () => go("home");
  } else go("home");
}

function requeue(item, gap) {
  const pos = Math.min(session.queue.length, gap);
  session.queue.splice(pos, 0, item);
  session.total++;
}

async function nextItem() {
  if (!session) return;
  window.scrollTo(0, 0);
  const item = session.queue.shift();
  if (!item) return endSession();
  if (item.type === "intro") return showIntro(item);
  const tip = findTip(item.key.slice(0, -2));
  if (!tip) { delete S.cards[item.key]; save(); return nextItem(); }
  if (item.key.endsWith("|l")) {
    app.innerHTML = `<div class="loading">Cargando ubicación…</div>`;
    const r = await resolveTip(tip);
    if (!r) {
      if (r === false) { delete S.cards[item.key]; save(); }
      return nextItem();
    }
    return showCard(item, tip, r);
  }
  showCard(item, tip, null);
}

function topbar() {
  const pct = session.total ? (session.done / session.total) * 100 : 0;
  return `<div class="topbar"><button class="x" id="quit" aria-label="Salir">✕</button>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <span class="small muted">${session.queue.length + 1}</span></div>`;
}
function bindQuit() { $("#quit").onclick = () => endSession(); }

function showIntro(item) {
  const tip = findTip(item.key);
  if (!tip) return nextItem();
  app.innerHTML = `${topbar()}
    <div class="kind">Pista nueva</div>
    <div class="clue">${imgHTML(tip.img)}</div>
    <div class="intro-head"><span class="flag">${flag(tip.slug)}</span><b>${esc(countryName(tip.slug))}</b></div>
    ${tagsHTML(tip)}
    ${textHTML(tip.text)}
    <div class="sticky"><button class="btn" id="ok">Entendido</button></div>`;
  bindQuit();
  $("#ok").onclick = () => {
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
  const isLoc = !!loc;
  const opts = options(tip.slug);
  app.innerHTML = `${topbar()}
    <div class="kind">${isLoc ? "📍 ¿Dónde estás?" : "🔎 ¿De qué país es esta pista?"}</div>
    ${isLoc ? svHTML(loc) : `<div class="clue">${imgHTML(tip.img)}</div>`}
    <div class="opts">${opts.map((s) => `<button class="opt" data-s="${s}"><span class="f">${flag(s)}</span>${esc(countryName(s))}</button>`).join("")}</div>
    <div id="back"></div>`;
  bindQuit();
  app.querySelectorAll(".opt").forEach((b) => {
    b.onclick = () => answer(item, tip, isLoc, b.dataset.s);
  });
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
  const again = grade(item.key, correct);
  session.done++;
  if (correct) session.right++; else session.wrong++;
  if (again) requeue(item, correct ? 4 : 3);
  save();
  $("#back").innerHTML = `<div class="back panel">
      <div class="verdict ${correct ? "good" : "bad"}">${correct ? "¡Correcto!" : "Era " + flag(tip.slug) + " " + esc(countryName(tip.slug))}</div>
      ${isLoc ? `<div class="clue" style="margin-bottom:10px">${imgHTML(tip.img)}</div>` : ""}
      ${tagsHTML(tip)}
      ${textHTML(tip.text)}
    </div>
    <div class="sticky"><button class="btn" id="next">Siguiente</button></div>`;
  $("#next").onclick = async () => { await maybeUnlock(); nextItem(); };
  $("#back").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- Pantallas ---------------- */

let currentTab = "home";
function go(tab, arg) {
  currentTab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (tab === "home") renderHome();
  else if (tab === "countries") renderCountries();
  else if (tab === "country") renderCountry(arg);
  else if (tab === "settings") renderSettings();
}
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));

async function renderHome() {
  rollDay();
  app.innerHTML = `<div class="loading">Cargando…</div>`;
  await Promise.all(S.unlocked.map((s) => loadCountry(s).catch(() => null)));
  if (currentTab !== "home") return;
  const due = dueCards().length;
  const freshAvail = newTipsAvailable(999).length;
  const fresh = Math.min(newLeftToday(), freshAvail);
  const mastery = overallMastery();
  const next = nextLocked();
  app.innerHTML = `
    <h1>Plonk Tarjetas</h1>
    <div class="stats">
      <div class="stat"><b>${due}</b><span>para repasar</span></div>
      <div class="stat"><b>${fresh}</b><span>pistas nuevas hoy</span></div>
    </div>
    <button class="btn" id="start" ${due + fresh ? "" : "disabled"}>${due + fresh ? "Empezar" : "Todo hecho por hoy ✅"}</button>
    <h2>Tus países</h2>
    <div class="panel">
      <div class="row small muted" style="justify-content:space-between;display:flex">
        <span>Dominio global</span><span>${Math.round(mastery * 100)}% / ${UNLOCK_THRESHOLD * 100}%</span>
      </div>
      <div class="progress" style="margin:8px 0 6px"><i style="width:${Math.min(100, (mastery / UNLOCK_THRESHOLD) * 100)}%"></i></div>
      <div class="small muted">${next ? `Siguiente país al llegar al ${UNLOCK_THRESHOLD * 100}%: ${flag(next)} ${esc(countryName(next))}` : "¡Has desbloqueado todos!"}</div>
    </div>
    <div class="clist">${S.unlocked.map(countryItem).join("")}</div>
    <p class="small muted" style="margin-top:20px">Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0.</p>`;
  $("#start").onclick = startSession;
  bindCountryItems();
}

function countryItem(slug) {
  const unlocked = S.unlocked.includes(slug);
  const p = DATA[slug] ? countryProgress(slug) : null;
  const right = unlocked
    ? (p ? `<span class="badge on">${Math.round(p.pct * 100)}%</span>` : `<span class="badge on">✓</span>`)
    : `<span class="badge">🔒</span>`;
  const sub = p ? `${p.seen}/${p.total} vistas · ${p.mastered} dominadas` : (BY_SLUG[slug]?.cat || []).join(", ");
  return `<button class="citem ${unlocked ? "" : "locked"}" data-slug="${slug}">
    <span class="flag">${flag(slug)}</span>
    <span class="info"><b>${esc(countryName(slug))}</b><span class="small muted">${esc(sub)}</span>
    ${p ? `<div class="progress" style="margin-top:6px"><i style="width:${p.pct * 100}%"></i></div>` : ""}</span>
    ${right}</button>`;
}
function bindCountryItems() {
  app.querySelectorAll(".citem").forEach((b) => (b.onclick = () => go("country", b.dataset.slug)));
}

function renderCountries() {
  const order = unlockOrder();
  const unl = order.filter((s) => S.unlocked.includes(s));
  const locked = order.filter((s) => !S.unlocked.includes(s));
  app.innerHTML = `
    <h1>Países</h1>
    <p class="muted small">Toca un país para leer su guía completa. Los bloqueados se desbloquean solos según avanzas, o a mano desde su página.</p>
    <h2>Desbloqueados (${unl.length})</h2>
    <div class="clist">${unl.map(countryItem).join("")}</div>
    <h2>Bloqueados (${locked.length})</h2>
    <div class="clist">${locked.map(countryItem).join("")}</div>`;
  bindCountryItems();
}

async function renderCountry(slug) {
  app.innerHTML = `<div class="loading">Cargando ${esc(countryName(slug))}…</div>`;
  let d;
  try { d = await loadCountry(slug); }
  catch (e) { app.innerHTML = `<p>No se pudo cargar: ${esc(e.message)}</p><button class="btn ghost" id="b">Volver</button>`; $("#b").onclick = () => go("countries"); return; }
  if (currentTab !== "country") return;
  const unlocked = S.unlocked.includes(slug);
  const p = countryProgress(slug);
  app.innerHTML = `
    <div class="topbar"><button class="x" id="b">←</button><b>${flag(slug)} ${esc(countryName(slug))}</b></div>
    ${unlocked
      ? `<div class="panel small"><div class="progress" style="margin-bottom:6px"><i style="width:${p.pct * 100}%"></i></div>${p.seen}/${p.total} pistas vistas · ${p.mastered} dominadas</div>`
      : `<button class="btn" id="unl">🔓 Desbloquear ahora</button>`}
    ${d.steps.map((st, i) => `
      <h2>${esc(stepTitle(st.title, i))}</h2>
      ${st.tips.map((t) => `<div class="guide-tip">
          ${t.img ? `<div class="clue">${imgHTML(t.img)}</div>` : ""}
          <div class="body">${t.sub ? `<div class="small muted" style="margin-bottom:4px">${esc(t.sub)}</div>` : ""}${tagsHTML(t)}${textHTML(t.text)}</div>
        </div>`).join("")}`).join("")}
    <p class="small muted">Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0.</p>`;
  $("#b").onclick = () => go(unlocked ? "home" : "countries");
  const u = $("#unl");
  if (u) u.onclick = async () => { await unlock(slug); go("country", slug); };
}
function stepTitle(t, i) {
  if (/^identif/i.test(t)) return "Cómo identificarlo";
  if (/spotlight/i.test(t)) return "Destacados";
  if (/regional|region|province|state|county|district/i.test(t)) return "Pistas regionales";
  return t;
}

function renderSettings() {
  app.innerHTML = `
    <h1>Ajustes</h1>
    <div class="panel">
      <label class="set">Pistas nuevas al día
        <select id="npd">${[5, 10, 15, 20, 30].map((n) => `<option ${n === S.settings.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>
    </div>
    <h2>Copia de seguridad</h2>
    <p class="small muted">El progreso se guarda solo en este móvil. Exporta una copia de vez en cuando por si borras los datos del navegador.</p>
    <div class="row">
      <button class="btn ghost small" id="exp">Exportar</button>
      <button class="btn ghost small" id="imp">Importar</button>
    </div>
    <input type="file" id="file" accept="application/json" hidden>
    <h2>Datos</h2>
    <div class="row">
      <button class="btn ghost small" id="refresh">Actualizar pistas</button>
      <button class="btn ghost small" id="reset" style="color:var(--bad)">Borrar progreso</button>
    </div>
    <p class="small muted" style="margin-top:20px">Contenido de Plonk It (plonkit.net), licencia CC BY-NC-SA 4.0. Imágenes de Street View © Google.</p>`;
  $("#npd").onchange = (e) => { S.settings.newPerDay = +e.target.value; save(); toast("Guardado"); };
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
    try {
      const s = JSON.parse(await f.text());
      if (s.v !== 1 || !s.cards) throw new Error();
      S = Object.assign(defaultState(), s); save(); toast("Progreso importado");
    } catch { toast("Ese archivo no es una copia válida"); }
  };
  $("#refresh").onclick = () => {
    Object.keys(localStorage).filter((k) => k.startsWith("plonk_c_") || k === "plonk_countries").forEach((k) => localStorage.removeItem(k));
    for (const k in DATA) delete DATA[k];
    toast("Se volverán a descargar al abrir cada país");
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
  const first = unlockOrder().slice(0, START_UNLOCKED);
  for (const s of first) { try { await unlock(s, true); } catch {} }
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
          <div style="font-size:2rem;letter-spacing:.5em;margin:18px 0;min-height:2.5rem">${"●".repeat(entered.length)}</div>
          <p style="color:var(--bad);min-height:1.4em">${msg}</p>
          <div class="opts" style="grid-template-columns:repeat(3,1fr);max-width:300px;margin:0 auto">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => k === "" ? "<span></span>" : `<button class="opt" data-k="${k}">${k}</button>`).join("")}
          </div>
        </div>`;
      app.querySelectorAll("[data-k]").forEach((b) => (b.onclick = async () => {
        const k = b.dataset.k;
        if (k === "⌫") entered = entered.slice(0, -1);
        else if (entered.length < 8) entered += k;
        if (entered.length >= 4 && (await sha256(entered)) === PIN_HASH) {
          localStorage.setItem("plonk_pin_ok", PIN_HASH);
          document.body.classList.remove("in-session");
          return resolve();
        }
        draw(entered.length >= 8 ? "PIN incorrecto" : "");
        if (entered.length >= 8) entered = "";
      }));
    };
    draw();
  });
}

async function boot() {
  await pinGate();
  try {
    await loadCountries();
    await initUnlocked();
    go("home");
  } catch (e) {
    app.innerHTML = `<h1>Plonk Tarjetas</h1><div class="panel">No se pudieron cargar los datos de Plonkit.<br><span class="small muted">${esc(e.message)}</span></div><button class="btn" onclick="location.reload()">Reintentar</button>`;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
boot();
