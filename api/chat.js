export const config = {
  runtime: 'edge', // This makes it super fast for streaming
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
        { role: "system", content: "You are a helpful business assistant." },
        { role: "user", content: message }
      ],
      stream: true,
    }),
  });

  // 3. Return the AI's voice directly to the browser
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
