export const config = {
  runtime: 'edge', 
};

// Updated with your new webhook link
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvcaj3c/";

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { messages, sheetData } = await req.json();
    const lastUserMsg = messages[messages.length - 1].content;

    // --- 1. THE GATEKEEPER LOGIC ---
    // Specifically looks for 9 digits with dashes or dots (e.g. 111-222-333)
    const nineDigitPattern = /\b\d{3}[-.]\d{3}[-.]\d{3}\b/;
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    const hasNineDigit = nineDigitPattern.test(lastUserMsg);
    const hasEmail = emailPattern.test(lastUserMsg);
    
    // Safety check: Don't send if we already sent info in this chat history
    const alreadySent = messages.slice(0, -1).some(m => 
      m.role === 'user' && (nineDigitPattern.test(m.content) || emailPattern.test(m.content))
    );

    if ((hasNineDigit || hasEmail) && !alreadySent) {
      // Fire to Zapier - Running on Edge, so no 'no-cors' needed
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_info: lastUserMsg,
          chat_history: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          founder: "THe dog"
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- 2. PROFESSIONAL CONSULTANT PROMPT ---
    const systemPrompt = `
      ROLE: Professional AI Consultant. 
      FOUNDER: "THe dog". (Never mention Alex).
      KNOWLEDGE: ${sheetData}.
      
      BEHAVIOR:
      1. Always start by asking: "What specific business task or service are you looking to automate or improve today?"
      2. Provide thoughtful, professional advice (3-4 sentences).
      3. Use a tone that is high-end, expert, and helpful.
      4. Once you understand their needs, say: "To help THe dog get a custom strategy over to you, what is your best name and email?"
      5. If they provide a 9-digit ID (xxx-xxx-xxx), acknowledge it as received.
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
        max_tokens: 450 
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
    return new Response("Internal Error", { status: 500 });
  }
}
