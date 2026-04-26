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
      messages: [{ role: "user", content: message }],
      stream: true, // Tells NVIDIA to send words one by one
    }),
  });

  // 3. If NVIDIA is mad, tell us why in the logs
  if (!response.ok) {
    const errorData = await response.json();
    console.error("NVIDIA Error Details:", JSON.stringify(errorData));
    return { 
      statusCode: response.status, 
      body: JSON.stringify({ error: "NVIDIA connection failed", details: errorData }) 
    };
  }

  // 4. The Magic Pipe: This sends the AI's voice directly to your screen
  return {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
    statusCode: 200,
    body: response.body, // This passes the raw stream directly to your site
  };
});
