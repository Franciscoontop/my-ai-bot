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
            content: `You are a Strict Business Assistant. 
            
            STRICT RULES:
            1. You ONLY provide information about business services, pricing, and scheduling.
            2. If a user asks for a recipe, a joke, general facts, or anything NOT related to your business, you MUST politely refuse.
            3. Example Refusal: "I specialize only in our business services and scheduling. I cannot provide recipes or general information. How can I help you with our services?"
            4. Do not be "helpful" with off-topic requests. Be firm but professional.
            5. Always interpret typos (like 'pirces') as business terms ('prices').
            6. Keep responses under 2 sentences.` 
          },
          ...messages
        ],
        stream: true,
        temperature: 0.1, // Lower temperature makes it follow rules more strictly
        top_p: 0.7,
        max_tokens: 100,
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
