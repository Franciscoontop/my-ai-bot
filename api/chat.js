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

    // --- 1. LEAD CAPTURE (Don't lose this!) ---
    // Check the last user message for email or phone before starting the stream
    const lastUserMsg = messages[messages.length - 1].content;
    const isLead = /\b\d{7,}\b/.test(lastUserMsg) || /\S+@\S+\.\S+/.test(lastUserMsg);

    if (isLead) {
      // Background fetch: we don't 'await' this so the AI starts talking immediately
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Background Error:", err));
    }

    // --- 2. SETUP STREAMING HEADERS ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // --- 3. NVIDIA AI CALL (Streaming Enabled) ---
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: messages,
        stream: true, // This enables the "typing" effect
        temperature: 0.5,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "NVIDIA API Error");
    }

    // --- 4. PIPE THE STREAM ---
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk); // Send words to frontend as they arrive
    }

    res.end();

  } catch (e) {
    console.error("Server Error:", e.message);
    // If headers haven't been sent yet, we can send a 500 error
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.end();
    }
  }
}
