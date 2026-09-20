import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth.action";
import { fetchGroq } from "@/lib/apiKeyManager";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resumeText, jobDescription } = await request.json();

    if (!resumeText || !jobDescription) {
      return NextResponse.json(
        { error: "Resume text and job description are required" },
        { status: 400 }
      );
    }

    const userTier = (user as any).tier || "freemium";
    const model = userTier === "pro" || userTier === "premium" 
      ? "openai/gpt-oss-120b" 
      : "openai/gpt-oss-20b";

    const promptContent = `You are an expert ATS (Applicant Tracking System) optimization bot and recruiter.
Analyze the following resume text against the target job description.

Resume:
${resumeText}

Job Description:
${jobDescription}

Tasks:
1. Calculate a realistic ATS Match Score (0 to 100) based on skills, keyword density, and experience alignment.
2. Identify key skills/keywords from the Job Description that ARE present in the Resume (matchedKeywords).
3. Identify key skills/keywords from the Job Description that ARE MISSING from the Resume (missingKeywords).
4. Analyze the experience bullet points in the Resume and suggest 3-5 rephrased versions that incorporate missing keywords, use strong action verbs, and structure them to show impact/results (Situation-Task-Action-Result format) to pass ATS filters and recruiter screening.

Return the response in raw JSON format matching this schema:
{
  "atsScore": number,
  "matchedKeywords": ["string"],
  "missingKeywords": ["string"],
  "bulletPointSuggestions": [
    {
      "original": "string",
      "suggested": "string",
      "explanation": "string"
    }
  ]
}`;

    console.log(`[DEBUG] Starting ATS Resume Analysis using Groq API (${model})...`);
    const response = await fetchGroq("/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: promptContent
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Model API returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content;
    const object = JSON.parse(resultText);

    return NextResponse.json(object, { status: 200 });
  } catch (error: any) {
    console.error("Error in resume analysis API:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze resume" },
      { status: 500 }
    );
  }
}
