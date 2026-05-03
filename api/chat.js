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

    // 1. STRICT ZAPIER LOGIC: Only fire if real info is found AND only once
    const hasEmail = /\S+@\S+\.\S+/.test(lastUserMsg);
    const hasPhone = /(\d[\s-]?){7,}/.test(lastUserMsg); // Needs at least 7 digits
    const alreadySent = messages.some(m => m.zapierSent === true);

    if ((hasEmail || hasPhone) && !alreadySent) {
      // Mark history so it doesn't fire again in this session
      messages[messages.length - 1].zapierSent = true;

      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify({
          lead_info: lastUserMsg,
          chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          captured_at: new Date().toISOString()
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // 2. PROFESSIONAL CONSULTANT PROMPT
    const systemPrompt = `
      ROLE: You are a Professional AI Business Consultant. 
      FOUNDER: Your founder is "THe dog". (Never mention Alex).
      KNOWLEDGE: Use this database: ${sheetData}.
      
      TONE: Professional, insightful, and sophisticated. You are here to solve problems.
      
      CONVERSATION FLOW:
      - Don't just give answers; be curious. Ask about their current business challenges or goals.
      - Aim for 3-4 sentences per response to provide real value.
      - If they ask about services, explain the benefit briefly, then ask a follow-up question like "How are you currently handling this process?"
      - Once you've built rapport (usually after 2-3 messages), pivot to the lead capture: "To provide a tailored strategy for your specific needs, what's the best name and email to reach you at?"
      
      STRICT LIMITS:
      - Never hallucinate features not in the database.
      - Keep the focus on how "THe dog" can automate or scale their results.
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
        temperature: 0.6, // Balanced: Professional but not repetitive
        max_tokens: 250   // Allows for longer, more helpful responses
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
