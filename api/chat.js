export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // 1. Guard against non-POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { messages } = await req.json();

    // 2. Validate input to prevent sending empty arrays to NVIDIA
    if (!messages || messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

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
            Strictly redirect off-topic talk back to business.` 
          },
          ...messages
        ],
        stream: true, 
        temperature: 0.4,
        max_tokens: 500, // Increased slightly for more detailed sales pitches
      }),
    });

    // 3. Robust Error Handling
    if (!response.ok) {
      const errorData = await response.text();
      console.error("NVIDIA API Error:", errorData);
      return new Response(`NVIDIA API Error: ${response.status}`, { status: response.status });
    }

    // 4. Enhanced Streaming Headers
    // 'no-transform' and 'chunked' encoding are vital for preventing Vercel from timing out
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (e) {
    console.error("Internal Server Error:", e.message);
    return new Response(`Server Error: ${e.message}`, { status: 500 });
  }
}
