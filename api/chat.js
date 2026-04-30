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
            
            CORE CONTEXT: 
            - You are currently running a "20% OFF" promotion for new customers.
            - If a user asks how to claim the offer or mentions the discount, explain that they just need to provide their Name and the Service they want to get started.
            
            STRICT RULES:
            1. ONLY discuss business services, scheduling, and the 20% OFF discount offer.
            2. If the user asks for anything else (recipes, personal advice, random facts), politely decline and pivot back.
            3. Understand user intent through typos (e.g., 'hopw' means 'how', 'pirces' means 'prices').
            4. Keep responses very brief (1-2 sentences). Be friendly but stay on track.` 
          },
          ...messages
        ],
        stream: true,
        temperature: 0.3, // Slightly higher to allow for better context reasoning
        top_p: 0.8,
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
