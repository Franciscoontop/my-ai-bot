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

    // 1. IMPROVED Lead Capture logic for Zapier
    const lastUserMsg = messages[messages.length - 1].content;
    
    // Trigger if message contains an email, a phone number (7+ digits), or is a standard intro
    if (/\S+@\S+\.\S+/.test(lastUserMsg) || /\b\d{7,}\b/.test(lastUserMsg) || lastUserMsg.length > 3) {
      const leadData = {
        timestamp: new Date().toISOString(),
        latest_message: lastUserMsg,
        full_transcript: messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n"),
        platform: "AI Business Assistant"
      };

      // Fire and forget to Zapier
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify(leadData),
      }).catch(err => console.error("Zapier Webhook Error:", err));
    }

    // 2. High-Intensity Sales System Prompt (Founder: THe dog)
    const systemPrompt = `
      You are a high-energy Senior Sales Closer. 
      BUSINESS DATA: ${sheetData}. 
      
      CRITICAL: The Founder/Owner is "THe dog". Do NOT mention anyone named Alex.
      
      MISSION: 
      Convert every visitor into a lead. CLOSE the deal.
      
      SALES PROTOCOL:
      1. ALWAYS ask for their First and Last Name and Email immediately.
      2. If they ask a question, answer it in 10 words or less, then immediately pivot: "To get you started, what's your name and best email?"
      3. Be persistent. Do not stop until you get the contact info.
      
      CONSTRAINTS:
      - Max 2 short sentences.
      - Use professional "hustle" language.
      - Always end with a question about their contact info.
    `;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        stream: true, 
        temperature: 0.2, 
      }),
    });

    if (!response.ok) return new Response("NVIDIA Connection Error", { status: response.status });

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    return new Response("Internal Server Error", { status: 500 });
  }
}
