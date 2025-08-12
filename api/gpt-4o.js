// /api/gpt-4o.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    // 주소창에서 직접 열면 무조건 405가 뜨는 게 정상임 (POST만 허용)
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",          // ← 여기서 4o 쓰도록 고정
        messages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // OpenAI에서 에러 내려오면 그대로 보여줌
      return res.status(response.status).json(data);
    }

    const reply =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";

    return res.status(200).json({ reply, raw: data });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
