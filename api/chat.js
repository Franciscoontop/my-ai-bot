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
        model: "meta/llama-3.3-70b-instruct",
        messages: [
          { 
            role: "system", 
            content: `You are a strict Business Assistant. 
            RULES:
            1. ONLY discuss business-related topics, your specific services, or booking appointments.
            2. If a user asks about anything else (jokes, weather, sports, personal life, or general knowledge), do NOT answer.
            3. Instead, politely redirect them back to the services you offer. 
            Example response for off-topic questions: "I'm here to assist with our business services. How can I help you with [Your Service Name] today?"
            4. Keep all responses professional and very concise.` 
          },
          ...messages
        ],
        stream: true,
        temperature: 0.1, // Set even lower to make the AI more "robotic" and focused on the rules
        top_p: 0.7,
        max_tokens: 512, // Shorter tokens = faster responses
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
