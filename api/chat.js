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

    // --- 1. DATA DETECTION PATTERNS ---
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\b\d{3}[-.]\d{3}[-.]\d{4}\b/;
    
    // Check current message and history for all required pieces
    const allMessagesText = messages.map(m => m.content).join(" ");
    
    const hasEmail = emailPattern.test(allMessagesText);
    const hasPhone = phonePattern.test(allMessagesText);
    // Name check: Simply looks for at least two words (First Last) in any message
    const hasFullName = /\b([A-Z][a-z]+|[a-z]+)\s+([A-Z][a-z]+|[a-z]+)\b/.test(allMessagesText);

    // --- 2. THE "COMPLETE LEAD" GATEKEEPER ---
    const isLeadComplete = hasEmail && hasPhone && hasFullName;
    
    // Check if we've already sent this lead to avoid duplicates
    const alreadySent = messages.slice(0, -1).some(m => m.zapierTriggered === true);

    if (isLeadComplete && !alreadySent) {
      // Mark the current state as triggered
      messages[messages.length - 1].zapierTriggered = true;

      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: "Provided in transcript",
          email: allMessagesText.match(emailPattern)?.[0],
          phone: allMessagesText.match(phonePattern)?.[0],
          service_request: messages.find(m => m.role === 'user' && m.content.length > 15)?.content || "Consultation",
          full_transcript: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- 3. THE PERSISTENT CONSULTANT PROMPT ---
    const systemPrompt = `
      ROLE: Professional AI Business Consultant.
      FOUNDER: "THe dog". (Never mention Alex).
      DATABASE: ${sheetData}.
      
      INSTRUCTIONS:
      1. First, ask what specific service/task they need help with.
      2. provide 3-4 professional sentences of value.
      3. MANDATORY: You must collect the following three items before finishing:
         - Full Name (First and Last)
         - Email Address
         - 10-digit Phone Number (xxx-xxx-xxxx)
      4. If the user only gives one (e.g., just the email), politely ask for the missing items: "I've got your email, but to have THe dog reach out personally, could I also get your full name and the best phone number to reach you at?"
      5. Do not stop asking until you have all three.
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
