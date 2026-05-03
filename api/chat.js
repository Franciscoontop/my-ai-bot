export const config = {
  runtime: 'edge', 
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvukyhr/";

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { messages } = await req.json();

    // 1. Lead Capture logic
    const lastUserMsg = messages[messages.length - 1].content;
    if (/\b\d{7,}\b/.test(lastUserMsg) || /\S+@\S+\.\S+/.test(lastUserMsg)) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // 2. Call NVIDIA API with strict conciseness instructions
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          { 
            role: "system", 
            content: "You are a professional sales assistant. Rules: 1. Keep responses under 2 sentences. 2. Be punchy and direct. 3. Always ask for a phone number or email if you haven't received one yet. 4. Never use long paragraphs." 
          },
          ...messages
        ],
        stream: true, 
        temperature: 0.4, // Lowered to 0.4 to prevent rambling
      }),
    });

    if (!response.ok) {
      return new Response("NVIDIA API Error", { status: response.status });
    }

    // 3. Proper Stream Pipe for Edge
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    console.error("Stream Error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
