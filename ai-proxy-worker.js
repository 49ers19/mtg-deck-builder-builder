/*
 * Grimoire Games — Gemini AI proxy (Cloudflare Worker)
 * ----------------------------------------------------
 * This tiny backend keeps your Gemini API key SECRET (never shipped to the app).
 * The app POSTs { question, context } here; this Worker adds your key, calls
 * Google Gemini, and returns { answer }.
 *
 * SETUP (all free, no terminal):
 *   1. Get a free Gemini API key at  https://aistudio.google.com/apikey
 *   2. Go to  https://dash.cloudflare.com  → Workers & Pages → Create → Worker.
 *   3. Replace the Worker's code with THIS file's contents, then Deploy.
 *   4. In the Worker → Settings → Variables → add a Secret named  GEMINI_KEY
 *      with your Gemini key as the value.  (Secret, not plaintext.)
 *   5. Copy the Worker URL (e.g. https://grimoire-ai.<you>.workers.dev) and paste
 *      it into the app:  Analyze → Ask about this deck → "Enable Gemini AI".
 *
 * If you later get a custom domain, add it to ALLOWED below.
 */

const ALLOWED = [
  "https://49ers19.github.io",
  "https://grimoire-games-9d13e.web.app",
  "https://grimoire-games-9d13e.firebaseapp.com",
  "http://localhost:4178",
];

function cors(origin) {
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
const json = (obj, status, ch) =>
  new Response(JSON.stringify(obj), { status: status || 200, headers: { ...ch, "Content-Type": "application/json" } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const ch = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers: ch });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, ch);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, ch); }

    const q = String(body.question || "").slice(0, 600);
    const ctx = String(body.context || "").slice(0, 12000);
    if (!q) return json({ error: "no question" }, 400, ch);

    const prompt =
      "You are a concise, friendly Magic: The Gathering deck-building assistant inside an app called Grimoire Games. " +
      "Use the deck context to answer the player's question. If it isn't about Magic, still answer briefly and helpfully. " +
      "Keep it under 130 words, plain text (no markdown headings).\n\n" +
      "=== DECK CONTEXT ===\n" + ctx + "\n\n=== QUESTION ===\n" + q;

    try {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + env.GEMINI_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 400, temperature: 0.6 },
          }),
        }
      );
      const data = await r.json();
      if (data.error) return json({ answer: "AI error: " + (data.error.message || "unknown") }, 200, ch);
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, no answer came back.";
      return json({ answer: text }, 200, ch);
    } catch (e) {
      return json({ answer: "Could not reach Gemini right now." }, 200, ch);
    }
  },
};
