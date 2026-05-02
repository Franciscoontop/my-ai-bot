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

    // 1. LEAD CAPTURE LOGIC (Zapier)
    const lastUserMsg = messages[messages.length - 1].content.trim();
    const isLead = /\b\d{7,}\b/.test(lastUserMsg) || /\S+@\S+\.\S+/.test(lastUserMsg);

    if (isLead) {
      // Fire and forget so we don't slow down the AI response
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          full_chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          timestamp: new Date().toLocaleString()
        }),
      }).catch(err => console.error("Zapier Hook Failed:", err));
    }

    // 2. TALK TO NVIDIA AI (High Stability Mode)
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: messages,
        stream: false, // Turned OFF for better compatibility
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nvidia API Error: ${errorText}`);
    }

    const data = await response.json();

    // 3. SEND CLEAN DATA BACK
    // This sends the full response at once so the frontend doesn't "break"
    return res.status(200).json(data);

  } catch (e) {
    console.error("Internal Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
