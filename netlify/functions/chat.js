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
          content: `You are the Lead Marketing Assistant for [Your Business Name]. 
          Your goal is to help write high-converting social media posts, email newsletters, and ad copy.
          Rules:
          1. Always use a professional yet friendly tone.
          2. Focus on benefits, not just features.
          3. If asked about things outside of marketing, politely steer the conversation back to business growth.
          4. Always include a 'Call to Action' (CTA) at the end of every post.`
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
