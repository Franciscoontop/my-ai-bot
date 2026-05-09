// ================================================================
// HOW TO SET UP (one time only):
//
// Vercel → your project → Settings → Environment Variables:
//
//   NVIDIA_API_KEY  → your Nvidia key (already set)
//   GMAIL_USER      → your Gmail address (e.g. you@gmail.com)
//   GMAIL_PASS      → Gmail App Password (NOT your real password)
//
// To get Gmail App Password:
//   myaccount.google.com → Security → 2-Step Verification (enable it)
//   then: myaccount.google.com/apppasswords
//   → create one → copy the 16-char password → paste into GMAIL_PASS
//
// After adding env vars → redeploy your Vercel project.
// ================================================================

// ================================================================
// CLIENT CONFIG — only change these 2 lines per client deployment
// ================================================================
const OWNER_EMAIL   = "clientowner@gmail.com"; // ← who receives lead emails
const BUSINESS_NAME = "Your Business";          // ← shown in email subject

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
    const { messages, sheetData, systemContext, leadData } = body;

    const allText  = messages.map(m => m.content).join(" ");
    const userText = messages.filter(m => m.role === "user").map(m => m.content).join(" ");

    // ── 1. LEAD DETECTION ────────────────────────────────────────
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/;
    const rawName      = userText.match(/\b([a-zA-Z]{2,20})\s+([a-zA-Z]{2,20})\b/);
    const nameMatch    = rawName
      ? rawName[0].split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
      : null;

    const foundEmail   = allText.match(emailPattern)?.[0];
    const foundPhone   = allText.match(phonePattern)?.[0];

    const serviceKeywords = [
      "haircut","fade","beard","trim","color","blowout","nails","lashes",
      "wax","facial","massage","cleaning","plumbing","hvac","website",
      "design","consult","booking","appointment","repair","install",
      "landscaping","detailing","painting","electrical","catering"
    ];
    const foundService = serviceKeywords.find(k => userText.toLowerCase().includes(k));

    const isLeadComplete = nameMatch && foundEmail && foundPhone && foundService;
    const alreadySent    = leadData?.alreadySent === true;

    // ── 2. SEND EMAIL VIA /api/send-email ────────────────────────
    // We call our own separate API route for email because nodemailer
    // requires Node.js runtime while streaming requires edge runtime.
    // Splitting into two routes lets each use the right runtime.
    if (isLeadComplete && !alreadySent) {
      const transcript = messages
        .map(m => `${m.role === "user" ? "Customer" : "AI"}: ${m.content}`)
        .join("\n");

      // Fire and forget — don't await so AI response isn't delayed
      fetch(`${getBaseUrl(req)}/api/send-email`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       nameMatch,
          email:      foundEmail,
          phone:      foundPhone,
          service:    foundService,
          business:   BUSINESS_NAME,
          owner:      OWNER_EMAIL,
          transcript: transcript,
        }),
      }).catch(err => console.error("Email route error:", err));
    }

    // ── 3. SYSTEM PROMPT ─────────────────────────────────────────
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
7. When you have all 4, confirm and say the team will be in touch.
    `.trim();

    // ── 4. NVIDIA / LLAMA API ────────────────────────────────────
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

    // ── 5. ROBUST STREAM BUFFER ───────────────────────────────────
    // Same working buffer from before — handles Nvidia's chunked SSE
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

        // Flush remainder
        if (buffer.trim().startsWith("data: ")) {
          try {
            const raw     = buffer.trim().slice(6);
            const parsed  = JSON.parse(raw);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              const out = { choices: [{ delta: { content } }] };
              await writer.write(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
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

// Gets the base URL of the current Vercel deployment
// so the email route call works in both dev and production
function getBaseUrl(req) {
  const host = req.headers.get("host") || "";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
