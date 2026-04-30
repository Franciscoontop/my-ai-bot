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
        // SWITCHED TO 8B FOR MAXIMUM SPEED
        model: "meta/llama-3.1-8b-instruct", 
        messages: [
          { 
            role: "system", 
            content: `You are a professional Business Assistant. 
            Your goal is to help users with business inquiries, services, and scheduling.
            
            TONE & RULES:
            1. Be polite, professional, and helpful.
            2. If a user asks for something non-business related (like recipes, jokes, or random facts), politely decline and bring them back to the services.
            3. Redirect phrase: "I'd be happy to help you with our business services or scheduling an appointment. Which of our services are you interested in today?"
            4. Keep responses under 2 sentences. Be extremely fast.` 
          },
          ...messages
        ],
        stream: true,
        temperature: 0.5, // Increased slightly so it sounds like a human
        top_p: 0.9,
        max_tokens: 150, // Short responses = faster streaming
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
