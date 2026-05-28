export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY belum diset." },
        { status: 500 },
      );
    }

    const { message, history, summaryData } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Pesan tidak valid." }, { status: 400 });
    }

    const systemPrompt = `Kamu adalah financial advisor pribadi.
Jawab HANYA pertanyaan seputar keuangan pribadi.

DATA KEUANGAN USER:
${JSON.stringify(summaryData || {}, null, 2)}

ATURAN:
- Selalu referensikan data user saat menjawab
- Sebut angka spesifik dari data mereka
- Kalau ditanya di luar topik keuangan, 
  tolak sopan dan redirect ke topik finansial
- Jangan bahas: politik, hiburan, coding, 
  atau non-finansial
- Tone: friendly, seperti teman yang ahli finansial
- Jawaban maksimal 3-4 kalimat, ringkas dan jelas
- Gunakan Bahasa Indonesia`;

    const recentHistory = Array.isArray(history)
      ? history.slice(-5).filter(
          (item) =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string",
        )
      : [];

    const messages = [
      ...recentHistory.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages,
      }),
    });

    const completion = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: completion?.error?.message || "Claude API error" },
        { status: 502 },
      );
    }

    const reply =
      completion?.content?.find((item) => item.type === "text")?.text ?? "";

    return Response.json({ reply });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
