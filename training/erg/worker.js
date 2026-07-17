/* ============================================================
   EUBC erg screen extraction — Cloudflare Worker
   Holds the Anthropic API key server-side so it never appears
   in the public page. Free tier (100k requests/day) is plenty.

   Deploy:
     1. dash.cloudflare.com → Workers & Pages → Create Worker
     2. Paste this file, deploy
     3. Settings → Variables → add secret ANTHROPIC_API_KEY
     4. Put the worker URL into EXTRACT_ENDPOINT in erg.html
============================================================ */

const ALLOWED_ORIGINS = [
  "https://www.meggetland.com",
  "https://meggetland.com",
  "https://mikehughes78.github.io"
];

const SYSTEM_PROMPT = `You read Concept2 PM5 rowing monitor screens, usually the memory "View Detail" screen. Respond ONLY with a single JSON object, no markdown fences, no preamble.

Schema:
{
  "sessionFormat": string|null,   // e.g. "4x675m/1:40r" as shown top-left
  "screenDate": string|null,      // ISO date shown on screen, e.g. "2026-07-16", null if not visible
  "totalTime": string|null,       // "Total Time" including rest, e.g. "12:32.2"
  "work": {
    "time": string|null,          // summary row work time, e.g. "9:52.2"
    "distance": number|null,      // summary row metres, e.g. 2700
    "avgSplit": string|null,      // summary row /500m, e.g. "1:49.6"
    "avgRate": number|null        // summary row strokes per minute
  },
  "pieces": [                     // one object per split/interval row, in order
    { "time": string|null, "distance": number|null, "split": string|null,
      "rate": number|null, "hr": number|null }
  ]
}

Rules:
- The first row under the column headers is the whole-session summary; rows after it are the individual pieces.
- Times keep their exact format as shown (e.g. "2:28.8", "1:49.6").
- Rest annotations like "r54" are not pieces; ignore them.
- If a value is unreadable or absent, use null. Never guess digits you cannot read.
- If the image is not a PM5/erg screen at all, respond {"error":"not an erg screen"}.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });

    try {
      const { image, mediaType } = await request.json();
      if (!image) throw new Error("no image supplied");

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
              { type: "text", text: "Read this erg screen and return the JSON." }
            ]
          }]
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || ("API returned " + r.status));

      const text = (data.content || [])
        .filter(b => b.type === "text").map(b => b.text).join("")
        .replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);

      return new Response(JSON.stringify(parsed), { headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }
};
