// Proxy de datos de Plonkit (contenido CC BY-NC-SA 4.0, © Plonk It) y
// resolución de enlaces de Google Maps a panorámicas de Street View.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const json = (data, { status = 200, cdnSeconds = 86400, cdn = false } = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 || cdn ? "public, max-age=3600" : "no-store",
      ...(status === 200 || cdn
        ? { "netlify-cdn-cache-control": `public, durable, s-maxage=${cdn ? 604800 : cdnSeconds}, stale-while-revalidate=604800` }
        : {}),
    },
  });

async function preloaded(path) {
  const r = await fetch("https://www.plonkit.net" + path, {
    headers: { "user-agent": UA, accept: "text/html" },
  });
  if (!r.ok) throw new Error(`Plonkit respondió ${r.status} en ${path}`);
  const html = await r.text();
  const m = html.match(
    /<script id="__PRELOADED_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) throw new Error("No se encontró __PRELOADED_DATA__ en " + path);
  return JSON.parse(m[1]);
}

async function countries() {
  const d = await preloaded("/guide");
  return d.data
    .filter((c) => c.code && !c.code.startsWith("XX") && (c.cat || []).length)
    .map((c) => ({ slug: c.slug, title: c.title, code: c.code, cat: c.cat }));
}

async function country(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug no válido");
  const d = (await preloaded("/" + slug)).data.public;
  const steps = [];
  (d.steps || []).forEach((s, si) => {
    if (s.kind !== "tip") return;
    let sub = null;
    const tips = [];
    for (const it of s.items || []) {
      if (it.kind === "subsection") sub = it.title;
      if (it.kind !== "tip") continue;
      tips.push({
        id: it.id,
        sub,
        text: it.data?.text || [],
        img: it.data?.image?.imageUrl || null,
        link: it.data?.image?.imageLink || null,
        tags: it.tags || [],
      });
    }
    steps.push({ index: si, title: s.title, tips });
  });
  return {
    slug: d.slug,
    title: d.title,
    code: d.code,
    cat: d.cat,
    updatedAt: d.updatedAt,
    steps,
  };
}

// ---------- Resolución de enlaces de Google Maps ----------

const ALLOWED = /(^|\.)(goo\.gl|google\.[a-z.]+)$/;

function parseMaps(url) {
  let u = url;
  try {
    const parsed = new URL(url);
    // Páginas de consentimiento de Google: el destino real va en ?continue=
    if (parsed.hostname.startsWith("consent.") && parsed.searchParams.get("continue")) {
      u = parsed.searchParams.get("continue");
    }
  } catch {}
  try {
    const q = new URL(u).searchParams;
    if (q.get("pano")) {
      const vp = (q.get("viewpoint") || "").split(",");
      return { pano: q.get("pano"), lat: +vp[0] || 0, lng: +vp[1] || 0,
        heading: +q.get("heading") || 0, pitch: +q.get("pitch") || 0, fov: +q.get("fov") || 75 };
    }
  } catch {}
  const pano = u.match(/!1s([A-Za-z0-9_\-]{10,})!2e0/);
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+),([^/?]*)/);
  if (!pano && !at) return null;
  const out = { pano: pano ? pano[1] : null };
  if (at) {
    out.lat = +at[1];
    out.lng = +at[2];
    for (const tok of at[3].split(",")) {
      const m = tok.match(/^(-?[\d.]+)([yht])$/);
      if (!m) continue;
      if (m[2] === "y") out.fov = +m[1];
      if (m[2] === "h") out.heading = +m[1];
      if (m[2] === "t") out.pitch = +m[1] - 90;
    }
  }
  return out.pano || out.lat != null ? out : null;
}

async function resolve(link) {
  let url = link;
  for (let hop = 0; hop < 6; hop++) {
    const direct = parseMaps(url);
    if (direct && direct.pano) return direct;
    const host = new URL(url).hostname;
    if (!ALLOWED.test(host)) throw new Error("host no permitido: " + host);
    const r = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": UA, "accept-language": "es-ES,es;q=0.9" },
    });
    const loc = r.headers.get("location");
    if (!loc) {
      // Último recurso: buscar la URL de Maps dentro del HTML
      const html = await r.text();
      const m = html.match(/https:\/\/www\.google\.[a-z.]+\/maps\/@[^"'\s<]+/);
      if (m) return parseMaps(m[0].replace(/\\u0026/g, "&"));
      break;
    }
    url = new URL(loc, url).toString();
  }
  return parseMaps(url);
}

// Las panorámicas borradas por Google devuelven una miniatura vacía de ~240 bytes
async function panoAlive(pano) {
  try {
    const r = await fetch(
      `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?cb_client=maps_sv.tactile&w=200&h=100&yaw=0&pitch=0&thumbfov=100&panoid=${encodeURIComponent(pano)}`,
      { headers: { "user-agent": UA } }
    );
    if (!r.ok) return false;
    const b = await r.arrayBuffer();
    return b.byteLength > 1500;
  } catch {
    return true; // ante la duda, no la descartamos
  }
}

export default async (req, context) => {
  const url = new URL(req.url);
  try {
    if (url.pathname === "/api/countries") {
      return json(await countries());
    }
    if (url.pathname.startsWith("/api/country/")) {
      return json(await country(context.params.slug));
    }
    if (url.pathname === "/api/resolve") {
      const u = url.searchParams.get("u");
      if (!u) return json({ error: "falta u" }, { status: 400 });
      const r = await resolve(u);
      if (!r || !r.pano) return json({ error: "no se pudo resolver" }, { status: 404, cdn: true });
      if (!(await panoAlive(r.pano))) return json({ error: "panorámica ya no existe" }, { status: 404, cdn: true });
      return json(r, { cdnSeconds: 2592000 });
    }
    return json({ error: "ruta desconocida" }, { status: 404 });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 502 });
  }
};

export const config = {
  path: ["/api/countries", "/api/country/:slug", "/api/resolve"],
};
