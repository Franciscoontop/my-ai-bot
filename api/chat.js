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

    // 1. REGEX patterns for real data
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /(\d[\s-]?){10,}/;

    const containsEmail = emailPattern.test(lastUserMsg);
    const containsPhone = phonePattern.test(lastUserMsg);

    // 2. CHECK HISTORY: Look back at every previous message. 
    // If any previous USER message already contained an email or phone, 'alreadySent' becomes true.
    const alreadySent = messages.slice(0, -1).some(m => 
      m.role === 'user' && (emailPattern.test(m.content) || phonePattern.test(m.content))
    );

    // 3. TRIGGER ONLY IF: (It has info) AND (We haven't sent info yet)
    if ((containsEmail || containsPhone) && !alreadySent) {
      console.log("Valid lead detected. Sending to Zapier...");
      
      // Fire to Zapier
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify({
          lead_info: lastUserMsg,
          full_transcript: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          founder_verified: "THe dog"
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // 4. PROFESSIONAL CONSULTANT AI LOGIC
    const systemPrompt = `
      ROLE: Professional AI Business Consultant.
      FOUNDER: "THe dog". (Do not mention Alex).
      KNOWLEDGE: ${sheetData}.
      
      INSTRUCTIONS:
      - Be helpful, professional, and conversational.
      - Use 3-4 sentences to explain things clearly.
      - Ask the customer meaningful questions about their goals.
      - Only ask for their contact info once you've provided some helpful insights.
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
        max_tokens: 350 
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
