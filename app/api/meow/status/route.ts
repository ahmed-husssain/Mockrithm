import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth.action";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: "offline", error: "Missing GROQ_API_KEY in environment variables." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return NextResponse.json({ status: "connected", model: process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b" });
    } else {
      const data = await response.text();
      let errMsg = "API key invalid or rejected";
      try {
        const parsed = JSON.parse(data);
        errMsg = parsed.error?.message || errMsg;
      } catch (e) {}
      return NextResponse.json({ status: "offline", error: errMsg });
    }
  } catch (err: any) {
    return NextResponse.json({ status: "offline", error: err.message });
  }
}
