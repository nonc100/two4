// api/seed.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // Access code check (sent from client header)
  const clientCode = req.headers["x-access-code"];
  if (!process.env.ACCESS_CODE || clientCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "no_message" });

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: "너는 'Seed'라는 한국어 조력자야. 간결하고 따뜻하게, 2~4문장으로 답해." },
          { role: "user", content: message }
        ],
        max_output_tokens: 250,
        stream: false
      })
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: "openai_error", detail: err });
    }
    const data = await r.json();
    const text = data.output_text ?? data.choices?.[0]?.message?.content ?? "…";
    return res.status(200).json({ reply: text });
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
