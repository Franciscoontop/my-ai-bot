export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // 1. Get the message from your website
  const { message } = await req.json();

  // 2. Talk to NVIDIA
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "meta/llama-4-maverick-17b-128e-instruct",
      messages: [
        { 
          role: "system", 
          content: `You are the Virtual Front Desk for [INSERT BUSINESS NAME]. 
          
          KNOWLEDGE BASE:
          - SERVICES: [e.g., Basic Haircut $30, Deluxe Fade $45, Beard Trim $20]
          - HOURS: Mon-Fri 9am-6pm, Sat 10am-4pm.
          - LOCATION: 123 Business Street, Downtown.
          - PROMO: Mention 'FIRSTTIME' for 15% off your first visit.

          YOUR GOALS:
          1. Answer questions clearly using the Knowledge Base.
          2. Be a salesperson: If they ask about a price, tell them why it's worth it.
          3. COLLECT LEADS: This is your #1 priority. If someone seems interested, ask for their Name and Phone Number.
          
          TONE: Professional, energetic, and helpful. Use emojis like ✂️ or 📅.`
        },
        { role: "user", content: message }
      ],
      stream: true,
    }),
  });

  // 3. Return the AI's response to the browser
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
