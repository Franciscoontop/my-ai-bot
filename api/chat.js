// 1. Set the maximum duration for the serverless function
// 1. Set the maximum duration for the serverless function
export const config = {
  maxDuration: 60,
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvukyhr/";

export default async function handler(req, res) {
  // Guard against non-POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages } = req.body;

    // Validate input
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }

    // --- ZAPIER INTEGRATION LOGIC ---
    // Extract the latest message from the user
    const lastUserMessage = messages[messages.length - 1].content;
    
    // Check if the message likely contains lead info (phone, email, or a short name-like string)
    const hasPhone = /\b\d{7,}\b/.test(lastUserMessage);
    const hasEmail = /\S+@\S+\.\S+/.test(lastUserMessage);
    
    // If it looks like a lead, fire to Zapier immediately
    if (hasPhone || hasEmail) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMessage,
          full_chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          timestamp: new Date().toISOString()
        }),
      }).catch(err => console.error("Zapier Webhook Error:", err));
    }
    // --------------------------------

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: messages, 
        stream: true,
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("NVIDIA API Error:", errorData);
      return res.status(response.status).json({ error: "NVIDIA API Error" });
    }

    // Critical Headers for streaming
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      res.write(value);
      
      if (typeof res.flush === 'function') {
        res.flush();
      }
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
