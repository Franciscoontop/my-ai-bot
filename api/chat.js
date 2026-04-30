export const config = {
  runtime: 'edge', // Prevents 504 timeouts on Vercel
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

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
            content: `You are a World-Class Sales Representative. Your goal is to convert visitors into booked clients.

            SALES STRATEGY:
            1. VALUE: Emphasize that our services save time and deliver premium results.
            2. URGENCY: Remind them that the 20% OFF discount is a limited-time offer to help them get started today.
            3. CLOSING: Every response must end by asking for their Name or their Phone Number to "secure the discount" or "check availability."
            4. OBJECTIONS: If they seem hesitant, remind them that this 20% discount makes it the perfect time to trial our expertise.

            STRICT RULES:
            - ONLY discuss business services, scheduling, and the 20% discount.
            - Redirect all off-topic talk (recipes, cake, etc.) back to the value of our services.
            - Keep responses punchy and persuasive (max 2-3 sentences).` 
          },
          ...messages
        ],
        stream: true,
        temperature: 0.4,
        top_p: 0.8,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return new Response("NVIDIA API Error", { status: response.status });
    }

    // Returns the stream directly to your frontend for real-time typing
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
