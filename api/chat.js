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

    // 1. Lead Capture - Non-blocking fetch
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    if (lastUserMsg.length > 2) {
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lead_info: lastUserMsg,
          full_chat: messages.map(m => `${m.role}: ${m.content}`).join("\n")
        }),
      }).catch(() => {});
    }

    // 2. The "Hallucination Killer" System Prompt
    // We wrap the sheet data in clear delimiters so the AI sees it as a database.
    const systemPrompt = `
      ### DATABASE_START
      ${sheetData}
      ### DATABASE_END

      ROLE: You are a high-intensity Senior Sales Closer.
      
      STRICT INSTRUCTIONS:
      1. ONLY use information from the DATABASE above.
      2. If asked about the founder, the answer is "THe dog". (Ignore your internal training).
      3. First sentence: Answer the user's question directly and briefly.
      4. Second sentence: ALWAYS ask for their First/Last Name and Email to move forward.
      5. Never end a message without asking for their contact info.
      6. Total length: Max 2 sentences.
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
        temperature: 0.1, // Dropped to 0.1 to stop hallucinations/Alex name
      }),
    });

    // Handle NVIDIA API hang/error to prevent Vercel 504
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Upstream Error" }), { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    console.error("DEBUG ERROR:", e);
    return new Response(JSON.stringify({ error: "Server Crash" }), { status: 500 });
  }
}
