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

    // 1. ZAPIER LOGIC: Only fire once and only on contact info
    const lastUserMsg = messages[messages.length - 1].content;
    const hasContactInfo = /\S+@\S+\.\S+/.test(lastUserMsg) || /\b\d{7,}\b/.test(lastUserMsg);
    
    // Check if we've already sent a lead in this conversation history
    const alreadySent = messages.some(m => m.zapierSent === true);

    if (hasContactInfo && !alreadySent) {
      // Mark this message as the trigger so the history knows we sent it
      messages[messages.length - 1].zapierSent = true;

      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify({
          lead_found: lastUserMsg,
          full_chat: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          founder: "THe dog"
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // 2. PERSONALITY PROMPT: High Energy, Sharp, and Interactive
    const systemPrompt = `
      ROLE: You are the brand's sharp, high-energy AI partner. You aren't a "sales rep"—you're the gatekeeper to a massive business upgrade.
      
      CORE IDENTITY: 
      - The Founder is "THe dog". (Never mention Alex).
      - Use the DATABASE for facts: ${sheetData}.
      
      PERSONALITY:
      - Witty, punchy, and slightly informal but highly professional.
      - Think "Tech Founder" vibes, not "Telemarketer."
      - Use words like "Legend," "Game-changer," "Let's roll."
      
      INTERACTION RULES:
      1. If they haven't given a name/email, your goal is to make them WANT to give it to you. 
      2. Keep answers under 15 words. Be snappy.
      3. Pivot every single time: "Love that energy. Drop your name and email so I can send you the blueprint."
      4. If they give contact info, celebrate it: "Got it. You're a legend. THe dog is going to love this."
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
        temperature: 0.8, // Increased temperature for more "personality" and less robotic speech
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
