// 1. Critical change: Increase the allowed duration and switch to nodejs runtime
export const config = {
  maxDuration: 60, 
};

export default async function handler(req, res) {
  // Guard against non-POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages } = req.body;

    // Validate input
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
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
        max_tokens: 500,
      }),
    });

    // Handle NVIDIA API Errors
    if (!response.ok) {
      const errorData = await response.text();
      console.error("NVIDIA API Error:", errorData);
      return res.status(response.status).json({ error: "NVIDIA API Error" });
    }

    // 2. Set the proper streaming headers for the Node.js runtime
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Connection', 'keep-alive');

    // 3. Pipe the stream from NVIDIA directly to your frontend
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Send the raw data chunk to the browser
      res.write(value);
    }

    res.end();

  } catch (e) {
    console.error("Internal Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
