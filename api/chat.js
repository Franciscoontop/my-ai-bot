// SETUP (one time only — 2 minutes):
//
// 1. Go to resend.com → sign up free (100 emails/day free forever)
// 2. Go to API Keys → Create API Key → copy it
// 3. Vercel → your project → Settings → Environment Variables → add:
//      RESEND_API_KEY  → your key from step 2
//      NVIDIA_API_KEY  → already set
// 4. Redeploy
//
// That's it. No nodemailer. No extra files. No dependencies.
// ================================================================

// ================================================================
// CLIENT CONFIG — only change these 2 lines per client
// ================================================================
const OWNER_EMAIL   = "Franciscoalmonte341@gmail.com"; // ← who receives lead emails
const BUSINESS_NAME = "New lead";          // ← shown in email subject

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

    const foundEmail  = allText.match(emailPattern)?.[0];
    const foundPhone  = allText.match(phonePattern)?.[0];

    const serviceKeywords = [
      "haircut","fade","beard","trim","color","blowout","nails","lashes",
      "wax","facial","massage","cleaning","plumbing","hvac","website",
      "design","consult","booking","appointment","repair","install",
      "landscaping","detailing","painting","electrical","catering"
    ];
    const foundService = serviceKeywords.find(k => userText.toLowerCase().includes(k));

    const isLeadComplete = nameMatch && foundEmail && foundPhone && foundService;
    const alreadySent    = leadData?.alreadySent === true;

    // ── 2. SEND EMAIL VIA RESEND ──────────────────────────────────
    // Resend works on edge runtime — no dependencies, just a fetch call.
    // Free plan: 100 emails/day, 3,000/month. More than enough.
    if (isLeadComplete && !alreadySent) {
      const transcript = messages
        .map(m => `${m.role === "user" ? "Customer" : "AI"}: ${m.content}`)
        .join("\n");

      // Non-blocking — fire and forget so AI response isn't delayed
      sendEmail({
        name:       nameMatch,
        email:      foundEmail,
        phone:      foundPhone,
        service:    foundService,
        transcript: transcript,
      }).catch(err => console.error("Email failed:", err));
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
7. When you have all 4, confirm and say the team will be in touch shortly.
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

    // ── 5. STREAM BUFFER ─────────────────────────────────────────
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
              await writer.write(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
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


// ================================================================
// EMAIL SENDER — uses Resend API (free, no dependencies)
//
// Resend sends from "onboarding@resend.dev" by default on free plan.
// To send from your own domain (e.g. noreply@yourdomain.com):
//   → resend.com → Domains → add your domain → verify DNS
//   → then change the `from` field below
//
// TO CHANGE WHO GETS THE EMAIL:
// Update OWNER_EMAIL at the top of this file — that's the only
// line you change per client deployment.
// ================================================================
async function sendEmail({ name, email, phone, service, transcript }) {
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:     "Web Insider Bot <onboarding@resend.dev>",
      to:       [OWNER_EMAIL],
      reply_to: email,  // clicking reply goes straight to the customer
      subject:  `New Lead: ${name} — ${service} — ${BUSINESS_NAME}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden;">

          <div style="background:#000;padding:20px 24px;">
            <h2 style="color:#fff;margin:0;font-size:18px;">🔥 New Lead from Your Website</h2>
            <p style="color:#999;margin:4px 0 0;font-size:13px;">${BUSINESS_NAME}</p>
          </div>

          <div style="padding:24px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;font-size:15px;">
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;width:90px;">Name</td>
                <td style="padding:10px 0;font-weight:bold;">${name}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;">Service</td>
                <td style="padding:10px 0;font-weight:bold;color:#cc0000;">${service}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;">Email</td>
                <td style="padding:10px 0;">
                  <a href="mailto:${email}" style="color:#000;">${email}</a>
                </td>
              </tr>
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;">Phone</td>
                <td style="padding:10px 0;">
                  <a href="tel:${phone}" style="color:#000;">${phone}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#999;">Time</td>
                <td style="padding:10px 0;">${new Date().toLocaleString()}</td>
              </tr>
            </table>

            <div style="margin-top:20px;padding:16px;background:#f9f9f9;border-left:3px solid #000;border-radius:4px;">
              <p style="margin:0;font-size:13px;color:#555;">
                Hit <strong>Reply</strong> to contact <strong>${name}</strong> directly about their <strong>${service}</strong> inquiry.
              </p>
            </div>
          </div>

          <div style="padding:16px 24px;background:#f5f5f5;border-top:1px solid #eee;">
            <p style="margin:0 0 8px;font-size:12px;color:#999;font-weight:bold;">FULL CONVERSATION</p>
            <pre style="font-size:12px;color:#555;white-space:pre-wrap;margin:0;font-family:monospace;">${transcript}</pre>
          </div>

        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }

  console.log(`✅ Lead email sent to ${OWNER_EMAIL} for ${name} (${service})`);
}
