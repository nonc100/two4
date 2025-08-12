// /api/gpt-4o.js  (Edge Runtime 버전)
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "content-type": "application/json" } }
    );
  }

  try {
    // ✅ 엣지 런타임: 본문 확실히 파싱
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages must be an array" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not set" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.7,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      // OpenAI가 돌려준 에러 그대로 전달
      return new Response(
        JSON.stringify(data),
        { status: r.status, headers: { "content-type": "application/json" } }
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";

    return new Response(
      JSON.stringify({ reply, raw: data }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message || "Server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
