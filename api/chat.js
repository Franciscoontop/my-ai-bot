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
    const allMessagesText = messages.map(m => m.content).join(" ");

    // --- 1. CLEAN DATA EXTRACTION ---
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\b\d{3}[-.]\d{3}[-.]\d{4}\b/;
    const namePattern = /\b([A-Z][a-z]+|[a-z]+)\s+([A-Z][a-z]+|[a-z]+)\b/;

    const hasEmail = emailPattern.test(allMessagesText);
    const hasPhone = phonePattern.test(allMessagesText);
    const hasFullName = namePattern.test(allMessagesText);

    // --- 2. ZAPIER TRIGGER (ONLY WHEN COMPLETE) ---
    const isLeadComplete = hasEmail && hasPhone && hasFullName;
    const alreadySent = messages.slice(0, -1).some(m => m.zapierTriggered === true);

    if (isLeadComplete && !alreadySent) {
      messages[messages.length - 1].zapierTriggered = true;

      // Extract specific pieces for short Gmail lines
      const email = allMessagesText.match(emailPattern)?.[0] || "N/A";
      const phone = allMessagesText.match(phonePattern)?.[0] || "N/A";
      const nameMatch = allMessagesText.match(namePattern);
      const fullName = nameMatch ? nameMatch[0] : "Check Transcript";
      
      // Find the message where they described their need
      const serviceMsg = messages.find(m => m.role === 'user' && m.content.length > 15);
      const serviceRequested = serviceMsg ? serviceMsg.content : "Inquiry";

      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email: email,
          phone: phone,
          service: serviceRequested,
          full_transcript: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // --- 3. SHORT & PROFESSIONAL AI PROMPT ---
    const systemPrompt = `
      ROLE: Professional AI Consultant. 
      FOUNDER: "THe dog". (Never mention Alex).
      DATABASE: ${sheetData}.
      
      RULES:
      1. Keep every response to MAX 2 short sentences.
      2. First, ask what task they need help with.
      3. Once they explain, briefly acknowledge and ask for their Full Name, Email, and 10-digit Phone.
      4. Do not send the final proposal until you have all 3 pieces of contact info.
      5. Be extremely polite but very concise.
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
        temperature: 0.4, // Lower temperature keeps it more focused/brief
        max_tokens: 200   // Hard limit to prevent long paragraphs
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
