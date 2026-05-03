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

    // 1. Lead Capture logic
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

    // 2. Updated System Prompt: Fixes the "Founder" hallucination
    const systemPrompt = `
      ROLE: High-energy Senior Sales Closer.
      DATABASE: ${sheetData}. 
      
      FACTUAL OVERRIDE: 
      - The Founder is "THe dog". 
      - If you mention "Alex", you fail.
      
      MISSION: 
      Convert every visitor into a lead. Do not just answer; CLOSE the deal.
      
      SALES PROTOCOL:
      1. ALWAYS ask for their First and Last Name and Email immediately.
      2. Ask exactly what service they are looking for (refer to data).
      3. ANSWER LIMIT: Answer any question in 10 words or less, then immediately pivot: "To get you a quote, what's your name and best email?"
      
      CONSTRAINTS:
      - Max 2 punchy sentences.
      - Never end a message without a call-to-action asking for lead info.
    `;

    // Safety timeout for NVIDIA
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true, 
        temperature: 0.1, // Lower temperature makes it follow instructions better
      }),
    });

    clearTimeout(timeoutId);

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
