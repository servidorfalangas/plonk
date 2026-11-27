// Caché compartida de los datos de cada país (Netlify Blobs).
// La primera vez el navegador descarga el país de Plonkit y lo guarda aquí;
// a partir de ahí se sirve desde Netlify, en paralelo y sin límites de Plonkit.
import { getStore } from "@netlify/blobs";

const store = () => getStore("plonk-countries");

export default async (req, context) => {
  const slug = context.params.slug;
  if (!/^[a-z0-9-]{2,60}$/.test(slug || "")) return new Response("slug no válido", { status: 400 });

  if (req.method === "GET") {
    const d = await store().get("c/" + slug, { type: "json" });
    if (!d) return Response.json({ error: "no está" }, { status: 404, headers: { "cache-control": "no-store" } });
    return Response.json(d, {
      headers: {
        "cache-control": "public, max-age=300",
        "netlify-cdn-cache-control": "public, durable, s-maxage=86400, stale-while-revalidate=604800",
        "netlify-cache-tag": "country-" + slug,
      },
    });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > 600000) return new Response("demasiado grande", { status: 413 });
    let d;
    try { d = JSON.parse(text); } catch { return new Response("JSON no válido", { status: 400 }); }
    // Se reconstruye el objeto solo con campos permitidos y valores seguros
    const str = (x, max = 4000) => (typeof x === "string" ? x.slice(0, max) : null);
    const MAPS = /^https:\/\/(goo\.gl\/maps\/|maps\.app\.goo\.gl\/|(www\.)?google\.[a-z.]{2,8}\/maps)/;
    let clean;
    try {
      if (!d || d.v !== 2 || d.slug !== slug || !Array.isArray(d.steps) || d.steps.length > 20) throw 0;
      clean = {
        v: 2, slug, title: str(d.title, 120), code: str(d.code, 16),
        cat: Array.isArray(d.cat) ? d.cat.map((c) => str(c, 40)).filter(Boolean).slice(0, 4) : [],
        updatedAt: str(d.updatedAt, 40), _t: Date.now(),
        steps: d.steps.map((st) => {
          if (!Array.isArray(st.tips) || st.tips.length > 400) throw 0;
          return {
            index: Number(st.index) || 0, title: str(st.title, 200) || "",
            tips: st.tips.map((t) => {
              if (typeof t.id !== "string" || !/^[\w-]{1,40}$/.test(t.id) || !Array.isArray(t.text)) throw 0;
              const img = str(t.img, 300);
              return {
                id: t.id, sub: str(t.sub, 200),
                text: t.text.slice(0, 40).map((x) => str(x)).filter((x) => x !== null),
                img: img && /^\/images\/[\w\-./%() ]+$/.test(img) ? img : null,
                imageLink: typeof t.imageLink === "string" && MAPS.test(t.imageLink) ? t.imageLink.slice(0, 600) : null,
                links: Array.isArray(t.links) ? t.links.filter((l) => typeof l === "string" && MAPS.test(l)).map((l) => l.slice(0, 600)).slice(0, 30) : [],
                tags: Array.isArray(t.tags) ? t.tags.map((x) => str(x, 40)).filter(Boolean).slice(0, 10) : [],
              };
            }),
          };
        }),
      };
      if (clean.title === null) throw 0;
    } catch { return new Response("formato no válido", { status: 400 }); }
    await store().setJSON("c/" + slug, clean);
    return new Response(null, { status: 204 });
  }

  return new Response("método no permitido", { status: 405 });
};

export const config = { path: "/api/c/:slug", method: ["GET", "PUT"] };
