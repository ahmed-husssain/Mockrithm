"use server";

import { cache } from "react";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

import { db } from "@/firebase/admin";
import { feedbackSchema } from "@/constants";
import { fetchGroq } from "@/lib/apiKeyManager";
import { assertOwnership } from "@/lib/actions/getAuthenticatedUserId";
import { updateUserEloRating } from "@/lib/actions/elo.action";

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
  let text = data.choices[0]?.message?.content || "";
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(text);
}

export async function createFeedback(params: CreateFeedbackParams) {
  const { interviewId, userId, transcript, feedbackId, averageWpm, topFillerWords, candidateCode } = params;
  await assertOwnership(userId);
  const userSnap = await db.collection("users").doc(userId).get();
  const userData = userSnap.data();

  const candidateName = userData?.name || "Candidate";
  const email = userData?.email || "candidate@example.com";
  try {
    const formattedTranscript = transcript
      .map(
        (sentence: { role: string; content: string }) =>
          `- ${sentence.role}: ${sentence.content}\n`
      )
      .join("");

    console.log("================= DIAGNOSTIC =================");
    console.log("createFeedback called with transcript size:", transcript?.length);
    console.log("formattedTranscript value:");
    console.log(formattedTranscript);
    console.log("==============================================");

    const codeContext = candidateCode
      ? `\n\nCandidate's Final Code Written in Sandbox Editor:\n\`\`\`\n${candidateCode}\n\`\`\`\n`
      : "";

    let object;
    const promptText = `
        You are an AI interviewer evaluating a candidate's mock interview performance.

        Strict Rules:
        - Always evaluate across the 5 categories in this exact order:
          1. "Communication Skills"
          2. "Technical Knowledge"
          3. "Problem Solving"
          4. "Cultural Fit"
          5. "Confidence and Clarity"
        - For each category object, you must output exactly:
          - "name": (the exact literal string name of the category as listed above)
          - "score": (numeric score 0 to 100)
          - "comment": (short justification comment for the score, explaining why they got the score and how they can improve)
        - Scores must be from 0 to 100.
        - GRADING MODERATION RULES (Be balanced: not very harsh, but not very lenient):
          - Be professional, constructive, and positive. Write encouraging feedback.
          - Use this grading rubric for assigning scores to each category:
            - Outstanding, correct, and comprehensive answers: 85-98.
            - Solid, correct answers but lacking minor details or metrics: 70-84.
            - Attempted answers that are weak, highly incomplete, or have major gaps: 45-69.
            - Incorrect or completely irrelevant answers: 10-44.
            - No answer, silent responses, or "I don't know": 0.
          - DO NOT penalize the candidate's "Technical Knowledge" or "Problem Solving" scores heavily if their verbal answers are brief/concise, as long as they are technically correct and accurate.
          - DO NOT tank the candidate's scores under 60% solely because they omitted quantitative metrics (STAR results). Instead, grade their logic/flow fairly and suggest adding metrics under areas for improvement.
        - If the candidate does not answer any questions verbally, says "I don’t know" throughout, or the microphone is not connected (no audio detected), AND they did not submit any code or text in the sandbox, then assign a score of 0 for that category.
        - CONSTRUCTIVE STUDY GUIDES FOR STRUGGLES: If the candidate scores less than 50 in any category, or says "I don't know" repeatedly, you MUST generate a list of 3-4 actionable micro-learning bullet points explaining the core technical/communication concept they struggled with. Return this in the "studyGuide" array. If they did well, "studyGuide" can be empty.
        - Do not invent or assume answers not present in the transcript or candidate code.

        Interview Transcript:
        ${formattedTranscript}
        ${codeContext}
      `;

    try {
      console.log("[DEBUG] Calling primary Groq model for final feedback generation...");
      const groqJson = await groqGenerateObject(promptText + `\n\nSchema format:\n{\n  "totalScore": number,\n  "categoryScores": [\n    { "name": "Communication Skills", "score": number, "comment": "string" },\n    { "name": "Technical Knowledge", "score": number, "comment": "string" },\n    { "name": "Problem Solving", "score": number, "comment": "string" },\n    { "name": "Cultural Fit", "score": number, "comment": "string" },\n    { "name": "Confidence and Clarity", "score": number, "comment": "string" }\n  ],\n  "strengths": ["string"],\n  "areasForImprovement": ["string"],\n  "finalAssessment": "string",\n  "studyGuide": ["string"]\n}`);
      
      object = {
        totalScore: typeof groqJson.totalScore === "number" ? groqJson.totalScore : 70,
        categoryScores: Array.isArray(groqJson.categoryScores) ? groqJson.categoryScores : [],
        strengths: Array.isArray(groqJson.strengths) ? groqJson.strengths : ["Good effort"],
        areasForImprovement: Array.isArray(groqJson.areasForImprovement) ? groqJson.areasForImprovement : ["Structure responses better"],
        finalAssessment: groqJson.finalAssessment || "Keep practicing.",
        studyGuide: Array.isArray(groqJson.studyGuide) ? groqJson.studyGuide : []
      };
    } catch (err: any) {
      console.warn("Primary feedback model Groq failed, trying Gemini-2.0-flash-001...", err.message);
      try {
        const result = await generateObject({
          model: google("gemini-2.0-flash-001", {
            structuredOutputs: true,
          }),
          schema: feedbackSchema,
          prompt: promptText,
        });
        object = result.object;
      } catch (geminiErr: any) {
        console.warn("Primary feedback model gemini-2.0-flash-001 failed, trying gemini-2.5-flash...", geminiErr.message);
        try {
          const result = await generateObject({
            model: google("gemini-2.5-flash", {
              structuredOutputs: true,
            }),
            schema: feedbackSchema,
            prompt: promptText,
          });
          object = result.object;
        } catch (finalErr: any) {
          console.error("All AI feedback models failed. Creating emergency fallback report.", finalErr);
          object = {
            totalScore: 0,
            categoryScores: [
              { name: "Communication Skills", score: 0, comment: "AI evaluation unavailable — please retry this interview." },
              { name: "Technical Knowledge", score: 0, comment: "AI evaluation unavailable — please retry this interview." },
              { name: "Problem Solving", score: 0, comment: "AI evaluation unavailable — please retry this interview." },
              { name: "Cultural Fit", score: 0, comment: "AI evaluation unavailable — please retry this interview." },
              { name: "Confidence and Clarity", score: 0, comment: "AI evaluation unavailable — please retry this interview." }
            ],
            strengths: ["Session was recorded successfully"],
            areasForImprovement: ["AI scoring service was temporarily unavailable. Please regenerate feedback."],
            finalAssessment: "⚠️ Automatic scoring failed due to an AI service outage. Your interview transcript has been saved. You can regenerate this feedback from the interview detail page."
          };
        }
      }
    }

    const categories = [
      "Communication Skills",
      "Technical Knowledge",
      "Problem Solving",
      "Cultural Fit",
      "Confidence and Clarity"
    ];
    const normalizedCategoryScores = categories.map((catName) => {
      const found = object.categoryScores?.find((c: any) => 
        c && typeof c.name === "string" && c.name.toLowerCase().includes(catName.toLowerCase().slice(0, 8))
      ) || {};
      return {
        name: catName,
        score: typeof found.score === "number" ? found.score : 75,
        comment: found.comment || "No comment provided."
      };
    });

    // Calculate total score as the mathematical average of normalized category scores
    const calculatedTotalScore = Math.round(
      normalizedCategoryScores.reduce((acc, cat) => acc + cat.score, 0) / normalizedCategoryScores.length
    );

    // Fetch interview details for role and sessionType
    let interviewRole = "Software Engineer";
    let interviewType = "Technical";
    try {
      const intSnap = await db.collection("interviews").doc(interviewId).get();
      if (intSnap.exists) {
        const intData = intSnap.data();
        if (intData?.role) interviewRole = intData.role;
        if (intData?.type) interviewType = intData.type;
      }
    } catch (e) {
      console.warn("Could not fetch interview details for Elo update:", e);
    }

    // Update candidate's Elo rating across overall, role, and mode
    let eloResult = null;
    try {
      eloResult = await updateUserEloRating({
        userId,
        interviewId,
        role: interviewRole,
        sessionType: interviewType,
        totalScore: calculatedTotalScore,
      });
    } catch (eloErr) {
      console.error("Failed to update user Elo rating:", eloErr);
    }

    const feedback = {
      interviewId,
      userId,
      candidateName, 
      email,         
      totalScore: calculatedTotalScore,
      categoryScores: normalizedCategoryScores,
      strengths: Array.isArray(object.strengths) ? object.strengths : ["Good communication and approach."],
      areasForImprovement: Array.isArray(object.areasForImprovement) ? object.areasForImprovement : ["Support answers with more detail."],
      finalAssessment: object.finalAssessment || "Great effort during the mock session.",
      createdAt: new Date(),
      averageWpm: averageWpm || 0,
      topFillerWords: topFillerWords || [],
      candidateCode: candidateCode || "",
      transcript: transcript || [],
      studyGuide: object.studyGuide || [],
      eloResult: eloResult || null,
    };

    let feedbackRef;

    if (feedbackId) {
      feedbackRef = db.collection("interviewsfeedback").doc(feedbackId);
    } else {
      feedbackRef = db.collection("interviewsfeedback").doc();
    }

    await feedbackRef.set(feedback);

    // Mark the interview document as finalized in Firestore
    try {
      await db.collection("interviews").doc(interviewId).update({ finalized: true });
    } catch (e) {
      console.error("Failed to mark interview as finalized:", e);
    }

    // Trigger self-improving profile refinement algorithm asynchronously
    optimizeUserProfileWithFeedback(userId, feedback).catch((err) => {
      console.error("Profile auto-optimization failed:", err);
    });

    return { success: true, feedbackId: feedbackRef.id };
  } catch (error) {
    console.error("Error saving feedback:", error);
    return { success: false };
  }
}

export async function getInterviewById(id: string): Promise<Interview | null> {
  if (!id) return null;
  const interviewSnap = await db.collection("interviews").doc(id).get();
  if (!interviewSnap.exists) return null;

  const data = interviewSnap.data();
  return JSON.parse(JSON.stringify({
    id: interviewSnap.id,
    ...data,
    createdAt: data?.createdAt?.toDate
      ? data.createdAt.toDate().toISOString()
      : data?.createdAt instanceof Date
      ? data.createdAt.toISOString()
      : data?.createdAt ?? null,
  })) as Interview;
}

export const getFeedbackByInterviewId = cache(async (
  params: GetFeedbackByInterviewIdParams
): Promise<Feedback | null> => {
  const { interviewId, userId } = params;
  if (!interviewId) return null;

  let querySnapshot;
  if (userId) {
    querySnapshot = await db
      .collection("interviewsfeedback")
      .where("interviewId", "==", interviewId)
      .where("userId", "==", userId)
      .limit(1)
      .get();
  }

  if (!querySnapshot || querySnapshot.empty) {
    querySnapshot = await db
      .collection("interviewsfeedback")
      .where("interviewId", "==", interviewId)
      .limit(1)
      .get();
  }

  if (querySnapshot.empty) return null;

  const feedbackDoc = querySnapshot.docs[0];
  const data = feedbackDoc.data();
  return JSON.parse(JSON.stringify({
    id: feedbackDoc.id,
    ...data,
    createdAt: data.createdAt?.toDate
      ? data.createdAt.toDate().toISOString()
      : data.createdAt instanceof Date
      ? data.createdAt.toISOString()
      : data.createdAt ?? null,
  })) as unknown as Feedback;
});

export const getFeedbacksForUser = cache(async (userId: string): Promise<Feedback[]> => {
  if (!userId) return [];
  const querySnapshot = await db
    .collection("interviewsfeedback")
    .where("userId", "==", userId)
    .get();
  return querySnapshot.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : data.createdAt instanceof Date
        ? data.createdAt.toISOString()
        : data.createdAt ?? null,
    };
  }) as unknown as Feedback[];
});

export const getLatestInterviews = cache(async (
  params: GetLatestInterviewsParams
): Promise<Interview[] | null> => {
  const { userId, limit = 20 } = params;

  // Fetch recent interviews and filter in memory to avoid index requirements
  const interviews = await db
    .collection("interviews")
    .orderBy("createdAt", "desc")
    .limit(limit * 5) // Fetch a larger batch to ensure we have enough finalized ones
    .get();

  return interviews.docs
    .map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate
          ? data.createdAt.toDate().toISOString()
          : data.createdAt instanceof Date
          ? data.createdAt.toISOString()
          : data.createdAt ?? null,
      };
    })
    .filter((interview: any) => 
      interview.finalized === true && 
      interview.userId !== userId
    )
    .slice(0, limit) as unknown as Interview[];
});

export const getInterviewsByUserId = cache(async (
  userId: string
): Promise<Interview[] | null> => {
  const querySnapshot = await db
    .collection("interviews")
    .where("userId", "==", userId)
    .get();

  const interviews = querySnapshot.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : data.createdAt instanceof Date
        ? data.createdAt.toISOString()
        : data.createdAt ?? null,
    };
  }) as unknown as Interview[];
  
  return interviews.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
});

export const getAllInterviews = cache(async (): Promise<Interview[]> => {
  const querySnapshot = await db
    .collection("interviews")
    .orderBy("createdAt", "desc")
    .get();

  return querySnapshot.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : data.createdAt instanceof Date
        ? data.createdAt.toISOString()
        : data.createdAt ?? null,
    };
  }) as unknown as Interview[];
});

export async function optimizeUserProfileWithFeedback(userId: string, feedback: any) {
  try {
    const userDocRef = db.collection("users").doc(userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) return;

    const userData = userDoc.data();
    if (!userData || !userData.onboarded || !userData.resumeData) return;

    const currentResumeData = userData.resumeData;
    const currentParsedData = currentResumeData.fixedParsedData || currentResumeData.parsedData || {};

    const workList = (currentParsedData.work || []).map((w: any) => ({
      company: w.company,
      position: w.position,
      highlights: w.highlights
    }));

    let object;
    const optimizationSchema = z.object({
      summary: z.string().describe("Polished professional summary incorporating candidate strengths demonstrated in mock interviews"),
      skills: z.array(z.string()).describe("Polished list of skills incorporating newly demonstrated competencies and removing/adjusting weak ones"),
      work: z.array(
        z.object({
          company: z.string(),
          position: z.string(),
          highlights: z.array(z.string()).describe("Polished and perfected work highlights for this position using the STAR framework, integrating achievements")
        })
      ).describe("Polished work experience highlights")
    });

    const optPrompt = `
        You are an elite Career Coach, Technical Recruiter, and Resume Writer.
        Your task is to analyze a candidate's current resume details along with their latest mock interview feedback, and output an optimized, refined, and perfected set of professional details.
        
        Mock Interview Feedback:
        - Score: ${feedback.totalScore}%
        - Demonstrated Strengths: ${JSON.stringify(feedback.strengths)}
        - Areas for Improvement: ${JSON.stringify(feedback.areasForImprovement)}
        - Assessment Summary: ${feedback.finalAssessment}
        
        Current Resume Profile Details:
        - Summary: ${currentParsedData.basics?.summary || ""}
        - Skills: ${JSON.stringify(currentParsedData.skills || [])}
        - Work Experience: ${JSON.stringify(workList)}
        
        Refinement Guidelines:
        1. Professional Summary: Perfect the summary. Incorporate key technical strengths demonstrated in the interview, while maintaining a professional and crisp tone. Keep it under 4 sentences.
        2. Skills: Refine the skills list. Retain valid technical skills, add skills they demonstrated competence in during the interview, and ensure the list is clean and highly relevant.
        3. Work Experience Highlights: Refine the bullet points (highlights) for each job. Apply the STAR framework. If the interview feedback highlighted positive technical depth or specific project achievements, subtly weave that context into the bullet points. Ensure they start with strong action verbs and feel extremely premium. Do not change the company name or position.
      `;

    try {
      const result = await generateObject({
        model: google("gemini-2.5-flash", {
          structuredOutputs: false,
        }),
        schema: optimizationSchema,
        prompt: optPrompt,
      });
      object = result.object;
    } catch (err: any) {
      console.warn("Primary optimization model gemini-2.5-flash failed, trying gemini-2.0-flash...", err.message);
      const result = await generateObject({
        model: google("gemini-2.0-flash", {
          structuredOutputs: false,
        }),
        schema: optimizationSchema,
        prompt: optPrompt,
      });
      object = result.object;
    }

    // Merge the optimized details back into Firestore under fixedParsedData
    const updatedParsedData = {
      ...currentParsedData,
      basics: {
        ...(currentParsedData.basics || {}),
        summary: object.summary
      },
      skills: object.skills,
      work: (currentParsedData.work || []).map((w: any) => {
        const matchingFix = object.work.find(
          (fw: any) => fw.company.toLowerCase().includes(w.company.toLowerCase()) || w.company.toLowerCase().includes(fw.company.toLowerCase())
        );
        return {
          ...w,
          highlights: matchingFix ? matchingFix.highlights : w.highlights
        };
      })
    };

    const optimizationLog = `Optimized after mock interview for role '\${userData.targetRole || "Unknown"}'. Rating: \${feedback.totalScore}%. Refined summary and highlights based on demonstrated competencies.`;

    await userDocRef.update({
      "resumeData.fixedParsedData": updatedParsedData,
      "resumeData.summary": optimizationLog,
      "resumeData.updatedAt": new Date().toISOString()
    });

    console.log("User profile optimized successfully for user ID:", userId);
  } catch (error) {
    console.error("Failed to run profile optimization algorithm:", error);
  }
}
