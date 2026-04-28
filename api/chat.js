export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  try {
    // 1. Get the FULL history from your website
    const { messages } = await req.json();

    if (!messages) {
      return new Response(JSON.stringify({ error: "No messages provided" }), { status: 400 });
    }

    // 2. Talk to NVIDIA
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-405b-instruct", // Note: Llama-4 is not officially out; using 3.1-405b for stability unless you have a specific custom NVIDIA endpoint.
        messages: [
          { 
            role: "system", 
            content: `You are the Virtual Front Desk for [INSERT BUSINESS NAME]. 
            
            KNOWLEDGE BASE:
            - SERVICES: [e.g., Basic Haircut $30, Deluxe Fade $45, Beard Trim $20]
            - HOURS: Mon-Fri 9am-6pm, Sat 10am-4pm.
            - LOCATION: 123 Business Street, Downtown.
            - PROMO: Mention 'FIRSTTIME' for 15% off your first visit.

            RULES:
            1. Check the conversation history before asking a question.
            2. Once you have the user's Name, Service, and Phone Number, STOP asking for them. 
            3. Instead of re-asking, confirm the details (e.g., "Got it, Bob! I have you down for a Fade at 3pm") and tell them the owner will reach out shortly.
            
            YOUR GOALS:
            1. Answer questions clearly using the Knowledge Base.
            2. COLLECT LEADS: Ask for Name and Phone Number if they seem interested.
            
            TONE: Professional, energetic, and helpful. Use emojis.`
          },
          ...messages
        ],
        stream: true,
      }),
    });

    // 3. Return the AI's response as a stream
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
