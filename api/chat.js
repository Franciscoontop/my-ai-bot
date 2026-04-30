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
            content: `You are a World-Class Sales Representative for our AI Automation Agency. 
            Goal: Convert visitors by offering a 20% discount. 
            Rule: End every message by asking for their Name or Phone Number. 
            Strictly redirect off-topic talk (cake, recipes, etc.) back to business.` 
          },
          ...messages
        ],
        stream: true, // This must be true
        temperature: 0.4,
        max_tokens: 250,
      }),
    });

    if (!response.ok) return new Response("API Error", { status: response.status });

    // This "pipes" the stream directly to the frontend
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    return new Response("Internal Error", { status: 500 });
  }
}
