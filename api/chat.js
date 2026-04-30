export const config = {
  runtime: 'edge', // Using Edge to prevent the 10s timeout issue
};

export default async function handler(req) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { messages } = await req.json();

    // 2. Call the NVIDIA API
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

            BUSINESS INFO:
            - Services: Custom Chatbots, Workflow Automation, AI Consulting.
            - Pricing: Starts at $500/month.
            - Offer: 20% OFF for new clients today.

            SALES STRATEGY:
            1. VALUE: Emphasize saving time and premium results.
            2. URGENCY: The 20% discount is a limited-time offer.
            3. CLOSING: Every response MUST end by asking for their Name or Phone Number to "secure the discount."
            
            STRICT RULES:
            - ONLY discuss business services and the discount.
            - If they ask about food, pizza, or recipes, say: "I specialize in growing businesses through AI, not cooking! Let's get you that 20% discount for your business instead. What's your name?"
            - Keep responses punchy (max 2-3 sentences).` 
          },
          ...messages
        ],
        stream: true, // Enables real-time typing
        temperature: 0.4,
        top_p: 0.8,
        max_tokens: 250,
      }),
    });

    // 3. Handle API Errors
    if (!response.ok) {
      const errorData = await response.text();
      console.error("NVIDIA API Error:", errorData);
      return new Response("NVIDIA API Error", { status: response.status });
    }

    // 4. Return the Stream directly to the frontend
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (e) {
    console.error("Internal Server Error:", e);
    return new Response("Internal Error", { status: 500 });
  }
}
}
