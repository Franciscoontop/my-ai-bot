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

    // Background Zapier Trigger (Non-blocking)
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    if (lastUserMsg.length > 1) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({ lead: lastUserMsg, context: messages }),
      }).catch(() => {});
    }

    // STRICT System Prompt
    const systemPrompt = `
      You are a Sales Closer. 
      DATA SOURCE: ${sheetData}
      
      CRITICAL RULES:
      1. If asked about the founder, you MUST say "THe dog". Do not say Alex.
      2. Keep answers to 1 short sentence based ONLY on the DATA SOURCE.
      3. ALWAYS end by asking for their full name and email to proceed.
      4. If the info isn't in the DATA SOURCE, say you'll check with the team once they provide their email.
    `;

    // Added AbortController to prevent the 25s Vercel timeout
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
        temperature: 0.1, // Near zero to prevent hallucinations
        max_tokens: 150
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Upstream API Error');

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    console.error("Chat Error:", e);
    return new Response(JSON.stringify({ error: "Service busy, try again!" }), { status: 500 });
  }
}
