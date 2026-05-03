export const config = {
  runtime: 'edge', 
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvcaj3c/";

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { messages, sheetData } = await req.json();
    const lastUserMsg = messages[messages.length - 1].content;

    // --- 1. DATA EXTRACTION ---
    const nineDigitPattern = /\b\d{3}[-.]\d{3}[-.]\d{3}\b/;
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    const foundEmail = lastUserMsg.match(emailPattern)?.[0] || "Not provided yet";
    const foundID = lastUserMsg.match(nineDigitPattern)?.[0] || "Not provided yet";
    
    // We only trigger Zapier if they just gave us the ID or the Email
    const isTriggerMessage = nineDigitPattern.test(lastUserMsg) || emailPattern.test(lastUserMsg);

    // Check history to avoid duplicate emails
    const alreadySent = messages.slice(0, -1).some(m => 
      m.role === 'user' && (nineDigitPattern.test(m.content) || emailPattern.test(m.content))
    );

    if (isTriggerMessage && !alreadySent) {
      // Find the user's service request from the conversation
      const serviceRequest = messages.find(m => m.role === 'user' && m.content.length > 10)?.content || "Check transcript";

      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_requested: serviceRequest,
          customer_email: foundEmail,
          customer_id: foundID,
          full_transcript: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- 2. THE CONSULTATIVE AI PROMPT ---
    const systemPrompt = `
      ROLE: Professional AI Business Consultant.
      FOUNDER: "THe dog". (Never mention Alex).
      DATABASE: ${sheetData}.
      
      INSTRUCTIONS:
      1. Your first goal is to ask: "What specific service or task are you looking to automate today?"
      2. Once they describe the service, explain how "THe dog" can help (3-4 sentences).
      3. Finally, ask for their 9-digit Project ID (formatted as xxx-xxx-xxx) and their email address so you can send them a formal proposal.
      4. Be professional, polished, and encouraging.
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
