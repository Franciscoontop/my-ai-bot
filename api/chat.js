export const config = {
  maxDuration: 60,
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvukyhr/";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }

    // 1. LEAD CAPTURE LOGIC
    const lastUserMsg = messages[messages.length - 1].content.trim();
    const hasPhone = /\b\d{7,}\b/.test(lastUserMsg);
    const hasEmail = /\S+@\S+\.\S+/.test(lastUserMsg);
    const isShortReply = lastUserMsg.split(" ").length <= 3 && lastUserMsg.length > 2;

    // Send to Zapier immediately if it looks like a lead
    if (hasPhone || hasEmail || isShortReply) {
       // We use await to ensure the data leaves the server before the AI starts
       await fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          full_chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          timestamp: new Date().toLocaleString()
        }),
      }).catch(err => console.error("Zapier Hook Failed:", err));
    }

    // 2. TALK TO NVIDIA AI
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: messages, // This sends the dynamic Google Sheet info
        stream: true,
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    // 3. STREAMING HEADERS
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
      if (typeof res.flush === 'function') res.flush();
    }

    res.end();

  } catch (e) {
    console.error("Internal Server Error:", e.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: e.message });
    }
    res.end();
  }
}
