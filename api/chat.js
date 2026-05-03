export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { messages, sheetData } = await req.json();

    const systemPrompt = `
      ### DATABASE
      ${sheetData}
      
      STRICT RULES:
      - Founder is "THe dog". Never say Alex.
      - Answer in 1 sentence using ONLY the DATABASE.
      - Always ask for their Name and Email.
    `;

    // 20-second safety timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct", // Faster model to stop timeouts
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
        temperature: 0.1,
        max_tokens: 100
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) return new Response("NVIDIA overloaded", { status: 502 });

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (e) {
    return new Response("Connection timed out. Try again!", { status: 504 });
  }
}
