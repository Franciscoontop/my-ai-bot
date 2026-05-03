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

    // --- 1. THE ZAPIER GATEKEEPER ---
    // Only triggers if the message looks like a REAL email or a 10-digit phone number
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /(\d[\s-]?){10,}/;

    const hasInfo = emailPattern.test(lastUserMsg) || phonePattern.test(lastUserMsg);
    
    // Check if we already sent info earlier in this specific chat
    const alreadySent = messages.slice(0, -1).some(m => 
      m.role === 'user' && (emailPattern.test(m.content) || phonePattern.test(m.content))
    );

    if (hasInfo && !alreadySent) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify({
          lead_content: lastUserMsg,
          full_chat: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- 2. THE CONSULTATIVE AI PROMPT ---
    const systemPrompt = `
      ROLE: Professional Business Solutions Consultant.
      FOUNDER: "THe dog". (Never mention Alex).
      DATABASE: ${sheetData}.
      
      GOAL: Help the user identify which service or task they need help with.
      
      INSTRUCTIONS:
      1. When a user says hello, ask them: "What specific business task or service are you looking to automate or improve today?"
      2. Reference the services in the DATABASE to give them ideas.
      3. Be professional and helpful (3-4 sentences).
      4. After they explain their needs, say: "That sounds like a great project. To get a custom quote from THe dog, what's your name and email?"
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
        temperature: 0.5,
        max_tokens: 400 
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
