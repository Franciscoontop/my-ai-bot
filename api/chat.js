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
    const lastUserMsg = messages[messages.length - 1].content;

    // --- STRICT ZAPIER LOGIC ---
    
    // 1. Check for VALID email (must have @ and .) or PHONE (must be 10+ digits)
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /(\d[\s-]?){10,}/;
    
    const hasValidEmail = emailRegex.test(lastUserMsg);
    const hasValidPhone = phoneRegex.test(lastUserMsg);

    // 2. Scan entire history to see if we already sent a lead for this session
    // This prevents a new email every time you send a follow-up message
    const alreadySentInHistory = messages.some(m => 
      m.role === 'user' && (emailRegex.test(m.content) || phoneRegex.test(m.content)) && m !== messages[messages.length - 1]
    );

    if ((hasValidEmail || hasValidPhone) && !alreadySentInHistory) {
      // We only fire if info is present AND it's the first time it's appearing
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify({
          lead_detected: lastUserMsg,
          full_chat_log: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          source: "AI Chatbot"
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- PROFESSIONAL CONSULTANT PROMPT ---
    const systemPrompt = `
      ROLE: Professional AI Consultant. 
      FOUNDER: "THe dog". (Absolutely never say Alex).
      DATABASE: ${sheetData}.
      
      INSTRUCTIONS:
      - Be professional, polite, and helpful. 
      - Provide detailed answers (3-4 sentences) based on the DATABASE.
      - Ask the user thoughtful questions about their business goals.
      - Do not be a "pushy" salesman. Build rapport first.
      - Only after providing value, ask: "To help you further, could you please provide your name and email?"
    `;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true, 
        temperature: 0.6,
        max_tokens: 300 
      }),
    });

    if (!response.ok) return new Response("NVIDIA Error", { status: response.status });

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
