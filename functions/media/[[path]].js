export async function onRequestGet({ params, env }) {
  const raw = params.path;
  const key = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  if (!/^p\/[A-Za-z0-9._-]{8,120}$/.test(key)) return new Response("not found", { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
