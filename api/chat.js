export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { messages } = await req.json();

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct", 
        messages: [
          { 
            role: "system", 
            content: `You are a professional Business Assistant. 
            CORE ABILITY: You are excellent at understanding user intent even if they have typos (e.g., if they say "pirces", understand they mean "prices"). 
            
            TONE & RULES:
            1. Be helpful and professional.
            2. If the user is off-topic, politely pivot back to business services or scheduling.
            3. Keep responses under 2 sentences.
            4. If a user asks about prices, scheduling, or specific services, answer them directly based on their implied meaning.` 
          },
          ...messages
        ],
        stream: true,
        temperature: 0.6, // Slightly higher for better "reasoning" through typos
        top_p: 0.9,
        max_tokens: 150,
      }),
    });

    if (!response.ok) return new Response("NVIDIA API Error", { status: response.status });

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response("Internal Error", { status: 500 });
  }
}
