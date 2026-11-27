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
    const ok = d && d.v === 2 && d.slug === slug && Array.isArray(d.steps) &&
      d.steps.every((s) => Array.isArray(s.tips) && s.tips.every((t) => typeof t.id === "string" && Array.isArray(t.text)));
    if (!ok) return new Response("formato no válido", { status: 400 });
    await store().setJSON("c/" + slug, { ...d, _t: Date.now() });
    return new Response(null, { status: 204 });
  }

  return new Response("método no permitido", { status: 405 });
};

export const config = { path: "/api/c/:slug", method: ["GET", "PUT"] };
