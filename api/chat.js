// ================================================================
// SETUP (one time only):
// Vercel → your project → Settings → Environment Variables → add:
//   NVIDIA_API_KEY → your Nvidia key (already set)
//
// That's it. No email service needed.
// Leads go directly to Google Sheets via the frontend.
// ================================================================

// ================================================================
// CLIENT CONFIG — change these 2 lines per client deployment
//
// BUSINESS_NAME : Must match the client's tab name in your
//                 master leads Google Sheet exactly.
//                 Example: "Mario's Barbershop" or "Iron Den Gym"
//
// (Email notifications removed — leads save to Google Sheets instead)
// ================================================================
const BUSINESS_NAME = "Your Business"; // ← change per client

export const config = {
  runtime:     "edge",
  maxDuration: 60,
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { messages, sheetData, systemContext } = body;

    // ── 1. SYSTEM PROMPT ─────────────────────────────────────────
    // If the frontend sends a systemContext (which it does) use it
    // directly — it already has sheet data + lead status built in.
    // The fallback is used if someone calls the API without a frontend.
    const finalSystemPrompt = systemContext || `
You are a helpful, friendly AI assistant for this business.
Always finish your sentences completely. Never cut off mid-thought.

BUSINESS INFO:
${sheetData || "No business data available."}

RULES:
1. Get their name first.
2. Find out what service they need before asking for contact info.
3. Collect in order: Name → Service → Email → Phone.
4. Never ask for something already given.
5. Keep replies to 2-4 complete sentences.
6. Always end with a question or clear next step.
7. When you have all 4, say the team will be in touch shortly.
    `.trim();

    // ── 2. NVIDIA / LLAMA API ────────────────────────────────────
    const nvidiaRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       "meta/llama-3.1-70b-instruct",
        max_tokens:  350,
        temperature: 0.7,
        stream:      true,
        messages: [
          { role: "system", content: finalSystemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!nvidiaRes.ok) {
      const err = await nvidiaRes.text();
      return new Response("NVIDIA Error: " + err, { status: nvidiaRes.status });
    }

    // ── 3. STREAM BUFFER ─────────────────────────────────────────
    // Nvidia sends multiple JSON objects per network chunk.
    // This buffer prevents silent parse failures that cause truncation.
    const { readable, writable } = new TransformStream();
    const writer  = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      const reader = nvidiaRes.body.getReader();
      let buffer   = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim().startsWith("data: ")) continue;
            const raw = line.trim().slice(6);
            if (!raw || raw === "[DONE]") continue;
            try {
              const parsed  = JSON.parse(raw);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                const out = { choices: [{ delta: { content } }] };
                await writer.write(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
              }
            } catch (_) {}
          }
        }

        // Flush any remainder after stream ends
        if (buffer.trim().startsWith("data: ")) {
          try {
            const raw     = buffer.trim().slice(6);
            const parsed  = JSON.parse(raw);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              await writer.write(encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
              ));
            }
          } catch (_) {}
        }

      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection":    "keep-alive",
      },
    });

  } catch (err) {
    console.error("Handler error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
