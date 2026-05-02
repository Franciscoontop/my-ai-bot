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

    // 1. LEAD CAPTURE (Zapier)
    // We run this without 'await' so the user doesn't wait for Zapier to finish
    const lastUserMsg = messages[messages.length - 1].content;
    const isLead = /\b\d{7,}\b/.test(lastUserMsg) || /\S+@\S+\.\S+/.test(lastUserMsg);

    if (isLead) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Background Error:", err));
    }

    // 2. NVIDIA AI CALL (Non-Streaming for Stability)
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: messages,
        stream: false, // KEEP THIS FALSE
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    const data = await response.json();
    
    // 3. SEND CLEAN RESPONSE
    res.status(200).json(data);

  } catch (e) {
    console.error("Server Error:", e.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
