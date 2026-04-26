import { stream } from "@netlify/functions";

export const handler = stream(async (event) => {
  // 1. Get the message from your website
  const { message } = JSON.parse(event.body);

  // 2. Talk to NVIDIA
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0" 
    },
    body: JSON.stringify({
      model: "meta/llama-4-maverick-17b-128e-instruct",
      messages: [
       { 
  role: "system", 
  content: `You are the AI Front-Desk Receptionist for [Webinsider]. 
  
  KNOWLEDGE BASE:
  - Services: [A website maker ]
  - Hours: [24/7 acesss]
  - Promotions: [20% off for first-time customers]
  
  YOUR MISSION:
  1. ANSWER: Use the knowledge base to answer questions naturally.
  2. SELL: If someone asks a price, mention a benefit or a current promo.
  3. QUALIFY LEADS: If a user looks interested, say: 'I can have the owner reach out to you directly to finalize that. What is your name and the best phone number to reach you at?'
  
  RULES:
  - Keep responses short (under 3 sentences).
  - Always be professional and inviting.
  - If you get a name and number, repeat it back to them to confirm.`
},
        { role: "user", content: message }
      ],
      stream: true,
    }),
  });

  // 3. Error Handling
  if (!response.ok) {
    const errorData = await response.json();
    console.error("NVIDIA Error Details:", JSON.stringify(errorData));
    return { 
      statusCode: response.status, 
      body: JSON.stringify({ error: "NVIDIA connection failed", details: errorData }) 
    };
  }

  // 4. The Output
  return {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
    statusCode: 200,
    body: response.body,
  };
});
