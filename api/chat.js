import { stream } from "@netlify/functions";

export const handler = stream(async (event) => {
  const { message } = JSON.parse(event.body);

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0" // Helps prevent the connection from being rejected
    },
    body: JSON.stringify({
      model: "meta/llama-3.1-8b-instruct",
      messages: [{ role: "user", content: message }],
      stream: true, // This must be true for the streaming to work!
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("NVIDIA Error:", errorText);
    return { statusCode: response.status, body: errorText };
  }

  return {
    headers: { "Content-Type": "text/event-stream" },
    body: response.body,
    statusCode: 200,
  };
});
