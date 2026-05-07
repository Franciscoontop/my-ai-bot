export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

// ================================================================
// ZAPIER WEBHOOK
// This is only used as a FALLBACK if the frontend doesn't fire it.
// Primary lead firing now happens on the frontend (webinsider template)
// so the owner gets notified with the correct service included.
// ================================================================
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/27378409/uvcaj3c/";

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();

    // Support both old format { messages, sheetData }
    // and new template format { messages, sheetData, systemContext }
    const { messages, sheetData, systemContext } = body;

    const allText    = messages.map(m => m.content).join(" ");
    const userText   = messages.filter(m => m.role === 'user').map(m => m.content).join(" ");

    // ── 1. LEAD DETECTION ──────────────────────────────────────────
    // Used for the backend Zapier fallback trigger.
    // The frontend already handles this — this is a safety net
    // in case someone uses the old widget without the new template.
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/;
    const nameMatch    = userText.match(/\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})\b/);

    const hasEmail    = emailPattern.test(allText);
    const hasPhone    = phonePattern.test(allText);
    const hasFullName = nameMatch !== null;

    // Service detection — looks for actual service keywords
    // NOT just "any long message" like the old version did
    const serviceKeywords = [
      "haircut","fade","beard","trim","color","blowout","nails","lashes",
      "wax","facial","massage","cleaning","plumbing","hvac","website",
      "design","consult","booking","appointment","repair","install",
      "landscaping","detailing","painting","electrical","catering"
    ];
    const lowerText    = userText.toLowerCase();
    const foundService = serviceKeywords.find(k => lowerText.includes(k));

    // Only fire Zapier from backend if ALL 4 are present
    // (service included — owner needs to know what the customer wants)
    const isLeadComplete = hasEmail && hasPhone && hasFullName && foundService;
    const alreadySent    = messages.slice(0, -1).some(m => m.zapierTriggered === true);

    if (isLeadComplete && !alreadySent) {
      messages[messages.length - 1].zapierTriggered = true;

      // Non-blocking — don't await so AI response isn't delayed
      fetch(ZAPIER_WEBHOOK_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name:       nameMatch?.[0] || "Check Transcript",
          email:           allText.match(emailPattern)?.[0]  || "N/A",
          phone:           allText.match(phonePattern)?.[0]  || "N/A",
          service:         foundService                       || "General Inquiry",
          full_transcript: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
          subject:         `New Lead — ${nameMatch?.[0]} wants ${foundService}`,
        }),
      }).catch(err => console.error("Zapier Error:", err));
    }

    // ── 2. SYSTEM PROMPT ───────────────────────────────────────────
    // If the new frontend sends a systemContext, use it directly.
    // It already contains the sheet data + lead status, so the AI
    // has full context without needing to build it here again.
    //
    // If using the old frontend (no systemContext), fall back to
    // building a basic prompt from sheetData.
    const finalSystemPrompt = systemContext
      ? systemContext  // ← New template sends this — use it as-is
      : `
You are a helpful, friendly AI assistant for this business.
Always finish your sentences completely. Never cut off mid-thought.

BUSINESS INFO:
${sheetData || "No business data available."}

RULES:
1. Greet the customer and ask their name first.
2. Find out what service they need before asking for contact info.
3. Collect in this order: Name → Service they want → Email → Phone.
4. Never ask for something you already know from the conversation.
5. Keep replies to 2-4 complete sentences.
6. Always end with a question or clear next step.
7. When you have all 4 pieces of info, confirm and say the team will be in touch.
      `.trim();

    // ── 3. NVIDIA / LLAMA API CALL ─────────────────────────────────
    // Switched from llama-3.1-8b to llama-3.1-70b.
    // The 8b model is too small to follow multi-step instructions
    // reliably. The 70b model handles the sales flow correctly.
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       "meta/llama-3.1-70b-instruct", // 70b — much better instruction following
        max_tokens:  350,                            // Was 200 — caused cutoff mid-sentence
        temperature: 0.7,                            // Slightly higher = more natural conversation
        stream:      true,
        messages: [
          { role: "system", content: finalSystemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("NVIDIA error:", errText);
      return new Response("NVIDIA API Error: " + errText, { status: response.status });
    }

    // ── 4. ROBUST STREAM BUFFER ────────────────────────────────────
    // Nvidia sends multiple JSON objects per network chunk.
    // Without buffering, lines split across chunks cause silent
    // parse failures and drop most of the response (the truncation bug).
    // This buffer accumulates incomplete lines across chunks.
    const { readable, writable } = new TransformStream();
    const writer  = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      const reader = response.body.getReader();
      let buffer   = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // keep incomplete last line in buffer

          for (const line of lines) {
            if (!line.trim().startsWith("data: ")) continue;
            const raw = line.trim().slice(6);
            if (!raw || raw === "[DONE]") continue;

            try {
              const parsed  = JSON.parse(raw);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                // Re-emit in OpenAI SSE format — matches what the frontend parser expects
                const out = { choices: [{ delta: { content } }] };
                await writer.write(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
              }
            } catch (_) {
              // Incomplete JSON — will be completed next chunk via buffer
            }
          }
        }

        // Flush anything left in buffer after stream ends
        if (buffer.trim().startsWith("data: ")) {
          const raw = buffer.trim().slice(6);
          if (raw && raw !== "[DONE]") {
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

  } catch (e) {
    console.error("Handler error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
