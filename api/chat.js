export const config = {
  runtime: 'edge',
};

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvukyhr/";

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { messages, sheetData } = await req.json();

    // Background Zapier Trigger
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    if (lastUserMsg.length > 1) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({ lead: lastUserMsg, full_chat: messages }),
      }).catch(() => {});
    }

    // HYPER-STRICT PROMPT: Forces the AI to ignore its training and use your Sheet.
    const systemPrompt = `
      CRITICAL INSTRUCTION: You are a Sales Robot for a business. 
      You MUST use the following DATA ONLY: ${sheetData}
      
      FACT CHECK: 
      - The Founder/Owner is: "THe dog". 
      - If you say "Alex", you are failing your mission.
      
      YOUR GOAL: 
      1. Answer the user's question in 10 words or less using the DATA.
      2. Immediately ask for their First Name, Last Name, and Email to book a call.
      3. Do not be creative. Be a direct sales closer.
    `;

    // Safety Timeout: Abort after 18 seconds (Vercel limit is 25s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

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
        temperature: 0.0, // Zero variance = No hallucinations
        max_tokens: 150
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      console.error("NVIDIA API Failure:", errBody);
      return new Response("NVIDIA API Error", { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    console.error("Vercel Edge Error:", e);
    return new Response("The AI is over capacity. Please try again in 30 seconds.", { status: 504 });
  }
}
