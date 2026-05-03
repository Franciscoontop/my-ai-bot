export const config = {
  runtime: 'edge', 
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvukyhr/";

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { messages, sheetData } = await req.json();

    // 1. Lead Capture logic
    const lastUserMsg = messages[messages.length - 1].content;
    if (/\b\d{7,}\b/.test(lastUserMsg) || /\S+@\S+\.\S+/.test(lastUserMsg)) {
      // Use standard fetch without 'await' to ensure background processing in Edge
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // 2. Optimized System Prompt
    const systemPrompt = `You are a professional sales assistant. 
    Use this business data ONLY: ${sheetData}. 
    
    Rules:
    - Founder name is specifically in the 'founder' row.
    - If someone mentions 'claim the deal', acknowledge the specific promo code they mentioned and ask for their contact info to apply it.
    - Keep responses under 2 short sentences.
    - Be friendly but very direct.`;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        stream: true, 
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return new Response("NVIDIA API Error", { status: response.status });
    }

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
