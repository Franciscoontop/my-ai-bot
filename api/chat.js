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

    // --- 1. THE REFINED GATEKEEPER ---
    // This looks for 9 digits separated by dashes or dots: e.g., 123-456-789 or 123.456.789
    const nineDigitPattern = /\b\d{3}[-.]\d{3}[-.]\d{3}\b/;
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    const hasNineDigit = nineDigitPattern.test(lastUserMsg);
    const hasEmail = emailPattern.test(lastUserMsg);
    
    // Check history to ensure we only fire ONCE per conversation
    const alreadySent = messages.slice(0, -1).some(m => 
      m.role === 'user' && (nineDigitPattern.test(m.content) || emailPattern.test(m.content))
    );

    if ((hasNineDigit || hasEmail) && !alreadySent) {
      // Use a standard fetch without "no-cors" to ensure Zapier receives the body correctly
      // Edge runtimes handle this better than browsers
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_info: lastUserMsg,
          chat_summary: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          type: hasNineDigit ? "9-Digit ID/Phone" : "Email"
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- 2. THE CONSULTATIVE AI PROMPT ---
    const systemPrompt = `
      ROLE: Professional Business Solutions Consultant.
      FOUNDER: "THe dog". (Never mention Alex).
      DATABASE: ${sheetData}.
      
      CONVERSATION LOGIC:
      - Start by asking: "What specific business task or service are you looking to automate or improve today?"
      - Provide professional, insightful advice (3-4 sentences).
      - After helping them understand how "THe dog" can solve their problem, ask for their contact info.
      - If they give you a 9-digit ID (like 123-456-789) or an email, acknowledge it professionally.
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
