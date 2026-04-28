export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { messages } = await req.json();

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.3-70b-instruct", // Fast & Reliable
        messages: [
          { role: "system", content: "You are a concise business assistant. Keep answers short." },
          ...messages
        ],
        stream: true,
        temperature: 0.2, // Lower temperature is faster to process
        top_p: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) return new Response("NVIDIA API Error", { status: response.status });

    // Stream the response back immediately
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response("Internal Error", { status: 500 });
  }
}
