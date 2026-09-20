import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getCurrentUser } from "@/lib/actions/auth.action";
import { fetchGroq } from "@/lib/apiKeyManager";

const starAnalysisSchema = z.object({
  situation: z.boolean(),
  task: z.boolean(),
  action: z.boolean(),
  result: z.boolean(),
  hasMetrics: z.boolean(),
  feedback: z.string(),
  labels: z.object({
    situation: z.string(),
    task: z.string(),
    action: z.string(),
    result: z.string(),
    hasMetrics: z.string(),
  }).optional(),
});

async function groqGenerateObject(prompt: string) {
  const response = await fetchGroq("/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant. Return your response ONLY as a valid JSON object matching the requested schema. Do not output any markdown formatting, thoughts, or markdown codeblocks outside the JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API returned status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content || "";
  return JSON.parse(text);
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text, role, type } = await request.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({
        situation: false,
        task: false,
        action: false,
        result: false,
        hasMetrics: false,
        feedback: "No speech detected yet.",
        labels: {
          situation: "Competency 1",
          task: "Competency 2",
          action: "Competency 3",
          result: "Competency 4",
          hasMetrics: "Supporting Evidence"
        }
      });
    }

    const promptText = `
        Analyze the following candidate's response to a question during a practice session.
        Candidate's Target Role: "${role || "General"}"
        Session Mode/Type: "${type || "Behavioral"}"
        
        Candidate Response:
        "${text}"
        
        Evaluate the response against 4 relevant competencies or evaluation dimensions tailored specifically to the role and session type (e.g. for software engineering behavioral, use STAR; for a comedian/joker, use Setup, Punchline, Delivery, Timing; for a president, use Rhetoric, Policy Depth, Diplomacy, Structure, etc.).
        
        Map your 4 custom competencies/dimensions to these schema fields:
        1. situation -> Competency 1 (e.g. Context / Setup / Policy background)
        2. task -> Competency 2 (e.g. Focus / Core argument / Problem statement)
        3. action -> Competency 3 (e.g. Action taken / Solution details / Rhetorical delivery)
        4. result -> Competency 4 (e.g. Outcome / Punchline / Conclusion)
        5. hasMetrics -> Specific supporting details or evidence (e.g. stats, specific facts, timing/laughter, metrics)
        
        Provide the human-readable names for these competencies in the "labels" field so we can display them to the user.
        
        Provide a concise, constructive feedback comment (feedback) advising the candidate on any missing components or how they can improve.
      `;

    let object;
    try {
      console.log("[DEBUG] Calling primary Groq model for STAR analysis...");
      const groqJson = await groqGenerateObject(promptText + `\n\nSchema format:\n{\n  "situation": boolean,\n  "task": boolean,\n  "action": boolean,\n  "result": boolean,\n  "hasMetrics": boolean,\n  "feedback": "string",\n  "labels": {\n    "situation": "string",\n    "task": "string",\n    "action": "string",\n    "result": "string",\n    "hasMetrics": "string"\n  }\n}`);
      object = {
        situation: !!groqJson.situation,
        task: !!groqJson.task,
        action: !!groqJson.action,
        result: !!groqJson.result,
        hasMetrics: !!groqJson.hasMetrics,
        feedback: groqJson.feedback || "",
        labels: groqJson.labels || {
          situation: "Competency 1",
          task: "Competency 2",
          action: "Competency 3",
          result: "Competency 4",
          hasMetrics: "Supporting Evidence"
        }
      };
    } catch (err: any) {
      console.warn("Groq STAR analysis failed, trying Gemini fallback...", err.message);
      const result = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: starAnalysisSchema,
        prompt: promptText,
      });
      object = result.object;
    }

    return NextResponse.json(object, { status: 200 });
  } catch (error: any) {
    console.error("Error analyzing STAR framework:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze response" },
      { status: 500 }
    );
  }
}
