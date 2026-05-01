export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // Guard against non-POST requests
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
        stream: true, 
        temperature: 0.4,
        max_tokens: 250,
      }),
    });

    // If NVIDIA returns an error (like an invalid API key), this catches it
    if (!response.ok) {
        const errorText = await response.text();
        console.error("NVIDIA API Error:", errorText);
        return new Response(`API Error: ${response.status}`, { status: response.status });
    }

    // The "Magic" headers that fix 504 timeouts and streaming issues
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });

  } catch (e) {
    console.error("Internal Server Error:", e);
    return new Response("Internal Error", { status: 500 });
  }
}
