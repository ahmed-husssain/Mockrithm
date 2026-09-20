import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth.action";
import { fetchGroq } from "@/lib/apiKeyManager";

// Simple in-memory per-user rate limiter (60 requests per minute)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: "Rate limit exceeded. Please slow down." }, { status: 429 });
  }

  try {
    const body = await request.json();
    let model = body.model || process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b";
    const userTier = (user as any).tier || "freemium";

    // Map legacy or unsupported models to active replacements
    const legacyModelMap: Record<string, string> = {
      "llama-3.1-8b-instant": "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
      "llama3-8b-8192": "openai/gpt-oss-20b",
      "llama3-70b-8192": "openai/gpt-oss-120b",
    };
    if (legacyModelMap[model]) {
      model = legacyModelMap[model];
    }

    // Enforce model tier limits
    const isGenerateMode = (body.messages || []).some((m: any) => m.role === "system" && m.content.includes("configure their mock"));
    if (userTier === "freemium" && !isGenerateMode) {
      model = "openai/gpt-oss-20b";
    } else {
      model = model || "openai/gpt-oss-120b";
    }

    console.log(`[DEBUG] Routing chat completion request to Groq API (${model})...`);
    const groqPayload = {
      model: model,
      messages: (body.messages || []).slice(-30),
      stream: body.stream !== false,
    };

    const response = await fetchGroq("/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(groqPayload),
    });

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", response.headers.get("content-type") || "text/event-stream");
    responseHeaders.set("Cache-Control", "no-cache");
    responseHeaders.set("Connection", "keep-alive");

    for (const [key, val] of response.headers.entries()) {
      if (key.startsWith("x-ratelimit-") || key === "retry-after") {
        responseHeaders.set(key, val);
      }
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

