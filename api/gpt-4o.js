// api/gpt-4o.js

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "content-type": "application/json" } }
    );
  }

  try {
    // ✅ 요청 body에서 messages 파싱
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages must be an array" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // ✅ 환경변수에서 API 키 가져오기
    const apiKey = process.env.OPENAI_API_KEY;
    console.log("🔑 API Key loaded?", apiKey ? "YES" : "NO");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not set" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // ✅ OpenAI API 호출
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",  // 필요하면 gpt-4o로 변경 가능
        messages
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("❌ OpenAI API Error:", errText);
      return new Response(
        JSON.stringify({ error: "OpenAI API request failed", details: errText }),
        { status: r.status, headers: { "content-type": "application/json" } }
      );
    }

    const data = await r.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  } catch (err) {
    console.error("❌ Handler error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: err.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
