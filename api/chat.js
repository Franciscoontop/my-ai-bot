export const config = {
  maxDuration: 60,
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvukyhr/";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { messages } = req.body;

    // 1. Lead Capture logic (Kept exactly as you had it)
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

    // 2. Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct", // Faster model selected
        messages: messages,
        stream: true, 
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("NVIDIA API Error:", errorText);
        return res.status(response.status).send("NVIDIA API Error");
    }

    // 3. Proper Stream Pipe
    // We pipe the NVIDIA response directly to Vercel's response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.write("data: [DONE]\n\n");
        break;
      }
      
      const chunk = decoder.decode(value);
      // NVIDIA already sends "data: {...}", so we just pass it through
      res.write(chunk);
    }

    res.end();
  } catch (e) {
    console.error("Stream Error:", e);
    if (!res.headersSent) res.status(500).send("Error");
    res.end();
  }
}
