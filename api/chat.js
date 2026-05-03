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

    // 1. Lead Capture logic (Captures emails/phones/names for Zapier)
    const lastUserMsg = messages[messages.length - 1].content;
    if (/\b\d{7,}\b/.test(lastUserMsg) || /\S+@\S+\.\S+/.test(lastUserMsg) || lastUserMsg.length > 2) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          full_chat: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // 2. High-Intensity Sales System Prompt
    const systemPrompt = `
      You are a high-energy Senior Sales Closer. 
      BUSINESS DATA: ${sheetData}. 
      
      YOUR MISSION: 
      You must convert every visitor into a lead. Do not just answer questions; CLOSE the deal.
      
      SALES PROTOCOL:
      1. ALWAYS ask for their First and Last Name and Email immediately.
      2. Ask exactly what service they are looking for (refer to the 'service' rows in the data).
      3. Be persistent. If they ask a question, answer it in 10 words or less, then immediately pivot back to: "To get you a quote, what's your name and best email?"
      4. If they mention a deal or promo, tell them you need their details to lock in that specific price.
      
      CONSTRAINTS:
      - Max 2 short, punchy sentences.
      - Use professional but "hustle" oriented language.
      - Never end a message without a call-to-action (asking for their info).
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
        temperature: 0.4, 
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
