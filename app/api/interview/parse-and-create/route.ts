import { NextResponse } from "next/server";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";
import { getCurrentUser } from "@/lib/actions/auth.action";
import { interviewLanguages } from "@/constants";
import { fetchGroq } from "@/lib/apiKeyManager";

async function groqChatCompletion(messages: any[], jsonMode = false): Promise<string> {
  try {
    const response = await fetchGroq("/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b",
        messages,
        response_format: jsonMode ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      if (jsonMode) {
        console.warn("[groqChatCompletion] JSON mode failed, retrying without strict json_mode constraint...");
        return groqChatCompletion(messages, false);
      }
      const errText = await response.text();
      throw new Error(`Groq API returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err: any) {
    if (jsonMode) {
      console.warn("[groqChatCompletion] JSON mode exception, retrying without strict json_mode constraint:", err);
      return groqChatCompletion(messages, false);
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const { messages, userid, userResumeData, language, duration } = await request.json();
    console.log("[DEBUG] /api/interview/parse-and-create received payload:");
    console.log(`- User ID: ${userid}`);
    console.log(`- Language: ${language || "en-US"}`);
    console.log(`- Messages Count: ${messages?.length || 0}`);
    console.log(`- Resume Data Target Role: ${userResumeData?.targetRole || "None Provided"}`);

    if (!messages || !userid) {
      console.error("[ERROR] Missing required parameters messages or userid.");
      return NextResponse.json(
        { error: "Conversation history and user ID are required." },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== userid) {
      console.error(`[ERROR] Forbidden access attempt. Tenant isolation violation. Authenticated user ID: ${currentUser?.id || "None"}, Payload user ID: ${userid}`);
      return NextResponse.json(
        { error: "Forbidden: Tenant isolation violation." },
        { status: 403 }
      );
    }

    // 1. Fetch candidate name for greeting personalization
    console.log("[DEBUG] Fetching candidate name from Firestore...");
    const userSnap = await db.collection("users").doc(userid).get();
    const userData = userSnap.data();
    const userName = userData?.name || "Candidate";
    console.log(`[DEBUG] Candidate name: ${userName}`);

    const targetLangConfig = interviewLanguages.find((l) => l.code === language) || interviewLanguages[0];
    const languageInstruction = `LANGUAGE REQUIREMENT: The session language is "${targetLangConfig.name}" (Code: ${targetLangConfig.code}). You MUST output text ONLY in this language. Do not mix languages. Do not write Roman script translation (e.g. if Urdu is selected, write exclusively in actual Urdu script/characters, never in English or Roman Urdu).`;

    const transcriptText = messages
      .filter((m: any) => m.role !== "system")
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    // Dynamic Topic Randomizer for Interview Questions
    const rawRole = (userResumeData?.targetRole || "").toLowerCase();
    const transcriptLower = transcriptText.toLowerCase();
    let focusTopics: string[] = [];

    if (
      rawRole.includes("front") || rawRole.includes("web") || rawRole.includes("ui") || rawRole.includes("react") ||
      transcriptLower.includes("front") || transcriptLower.includes("web") || transcriptLower.includes("ui") || transcriptLower.includes("react")
    ) {
      focusTopics = [
        "browser performance optimization (e.g. repaints, code-splitting, layout thrashing)",
        "React hooks & advanced side effects (e.g. custom hooks, useEffect optimization)",
        "state management architecture (e.g. Context, Redux, local state vs global state)",
        "hoisting, closure scope, and prototype chain",
        "CSS layouts & modern visual engines (e.g. Grid, Flexbox, custom variables)",
        "asynchronous JS flow control (e.g. Promises, async/await, race conditions)",
        "web security basics (e.g. XSS prevention, CSRF, secure HTTP headers)",
        "browser Web APIs & DOM events (e.g. event bubbling, debouncing/throttling)",
        "React component composition patterns (e.g. compound components, render props)",
        "TypeScript type safety & strict utility definitions"
      ];
    } else if (
      rawRole.includes("back") || rawRole.includes("server") || rawRole.includes("node") || rawRole.includes("api") ||
      transcriptLower.includes("back") || transcriptLower.includes("server") || transcriptLower.includes("node") || transcriptLower.includes("api")
    ) {
      focusTopics = [
        "database indexing & complex query optimization",
        "API design principles (RESTful vs GraphQL, versioning)",
        "server-side caching layers (Redis, Memcached)",
        "asynchronous message brokers & worker queues (RabbitMQ, BullMQ)",
        "secure authentication & token authorization schemes (JWT, OAuth2)",
        "horizontal/vertical scaling & reverse proxy load balancing (Nginx)",
        "concurrency models, process clustering, and multi-threading",
        "centralized logging, telemetry, and error middleware",
        "database schema modeling, integrity, and migrations",
        "microservices communication protocols (gRPC, message buses)"
      ];
    } else {
      focusTopics = [
        "problem solving & systematic algorithmic thinking",
        "leadership, team dynamics, and cross-functional communication",
        "system architecture, clean code practices, and structure",
        "industry standards, best practices, and secure configuration",
        "testing strategies, unit tests, and validation gates",
        "resource optimization, execution efficiency, and memory constraints",
        "defensive programming & edge-case handling"
      ];
    }

    const shuffled = [...focusTopics].sort(() => 0.5 - Math.random());
    const selectedTopics = shuffled.slice(0, 3);
    const randomTopicInstruction = selectedTopics.length > 0
      ? `- DIVERSITY & FRESHNESS REQUIREMENT: You MUST base the generated questions specifically on a combination of these 3 randomly selected focus areas: ${selectedTopics.map((t) => `"${t}"`).join(", ")}. Do NOT default to generic questions like var/let/const, React state, or closures unless explicitly requested by one of these topics.`
      : "";

    const masterPrompt = `
      You are an expert technical interviewer and setup parser.
      Analyze the following conversation transcript between a candidate and an interview setup assistant, as well as the candidate's resume/profile data.
      
      Candidate Resume/Profile Data:
      ${JSON.stringify(userResumeData || {})}
      
      Transcript:
      ${transcriptText}
      
      Candidate Name: ${userName}
      Session duration: ${duration || "default"} minutes
      
      ${languageInstruction}
      
      Your task is to generate a single JSON response containing:
      1. Setup Parameters: job role, level, techstack/competencies, selected mode, number of questions, requiresSandbox.
      2. Tailored Questions: exactly the requested amount of questions relevant to the tech stack.
      3. Welcome Greeting: Alex's first welcome message confirming setup and stating the first question (max 2 sentences, no markdown).
      4. Coding Challenge: a custom programming task suitable for the role/level (set to null if requiresSandbox is false).
      
      GUIDELINES:
      ${randomTopicInstruction}
      - Scan the Transcript first. If the candidate explicitly chose to practice a role DIFFERENT from their default targetRole (e.g. "Prime Minister of Pakistan", "Joker", etc.), you MUST override the role and use this new requested role.
      - If the role is changed/overridden from the default targetRole, DO NOT use the techstack/skills or resume details from the Resume/Profile Data. Instead, generate relevant competencies/skills for the new chosen role (e.g. for Prime Minister: "crisis leadership", "governance", "public policy", "foreign affairs"; for Joker: "stand-up comedy", "timing", "joke delivery", "crowd interaction").
      - requiresSandbox MUST be false for conceptual, verbal, or conversational modes (e.g., "Technical", "Behavioral", "System Design", "Q&A", "Interview", "Verbal Q&A", "Discussion", or "Oral Defense"). These are purely conversational and do not need a workspace/sandbox.
      - Only set "requiresSandbox" to true if the chosen option/mode explicitly involves hands-on writing, editing, or coding (e.g. "Live Coding Sandbox", "Code Review", "Coding Challenge", "Drafting Task", "Writing Sandbox", or solving equations in an editor).
      - Questions: Questions MUST be strictly relevant to the listed tech stack or core competencies. Do NOT ask questions about other tools, languages, or frameworks not explicitly listed.
      - CRITICAL: If requiresSandbox is true (e.g. "Live Coding Sandbox" or "Code Review" mode), the generated questions MUST be hands-on code writing, editing, or code review tasks. Do NOT generate purely conceptual, discussion, or verbal questions (such as "What are best practices..." or "Explain React lifecycle") in the questions array for these modes. Every question in the array must request a hands-on solution or review in the editor.
      - CRITICAL FRONTEND REQUIREMENT: If the role is Frontend Engineer or includes "frontend" / "front-end", you MUST NOT ask any database, SQL, backend, or cloud systems questions. Only ask about HTML, CSS, JavaScript, React, and general Web APIs/browser concepts. Never ask SQL queries or database optimization questions.
      - Coding/Written Challenge (If requiresSandbox is true): Generate a written, coding, or mathematical challenge suitable for the level and role. Do NOT provide the full solution in the templateCode. The templateCode should only have a broken/buggy code snippet or an empty template skeleton to complete, with clear comments explaining what to do.
      - CRITICAL WELCOME GREETING RULE: The welcome greeting ("firstMessage") MUST state the first question from the questions list directly in your response. You are an AI interviewer named Alex. Do NOT greet, introduce yourself again, or say hello. Do NOT ask the candidate if they are ready, do NOT ask "Are we ready to begin?", and do NOT ask for confirmation. Do NOT talk about the duration or time limit in the greeting. Keep it extremely short: 2 sentences maximum. No markdown. Example: "Great, let's start the interview. Here is your first question: [First Question]"
      
      You must return ONLY a JSON object conforming exactly to this schema:
      {
        "role": "extracted/inferred job role",
        "level": "extracted/inferred experience level: Junior, Mid-level, Senior, or Lead",
        "techstack": ["technology1", "technology2", ... or key competencies],
        "type": "the selected option/mode (e.g. Public Address, Stand-up Set, Technical, Behavioral, Live Coding Sandbox, etc.)",
        "amount": number of questions (default to 5 if not specified),
        "requiresSandbox": boolean,
        "questions": ["Question 1", "Question 2", ...],
        "codingProblem": {
          "title": "challenge/drafting/solving title",
          "description": "challenge description and instructions for the candidate",
          "templateCode": "starter text, equations, or code template/buggy snippet for the candidate to build upon",
          "language": "language name in lowercase (e.g. javascript, typescript, python, markdown, text, latex - default is 'text')"
        } (or null if requiresSandbox is false),
        "firstMessage": "Alex's first question/welcome statement"
      }
    `;

    console.log("[DEBUG] Sending consolidated setup & question generation request to Groq...");
    let questionsList: string[] = [];
    let codingProblem = null;
    let firstMessage = "Hello! Ready to start.";
    let setup = {
      role: "Software Developer",
      type: "Technical",
      level: "Mid-level",
      techstack: ["General"],
      amount: 5,
      requiresSandbox: false,
    };

    try {
      const responseText = await groqChatCompletion([
        { role: "system", content: "You are an interview setup assistant. You only output valid JSON conforming to the requested schema." },
        { role: "user", content: masterPrompt }
      ], true);
      
      console.log(`[DEBUG] Raw consolidated response from Groq: ${responseText}`);
      
      let masterObj: any = {};
      try {
        masterObj = JSON.parse(responseText);
      } catch (jsonErr) {
        console.warn("[WARN] Direct JSON.parse failed, attempting regex JSON extraction...", jsonErr);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            masterObj = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            console.error("[ERROR] Regex JSON parse also failed:", e2);
          }
        }
      }
      
      if (masterObj.setup) {
        setup = {
          role: masterObj.role || masterObj.setup.role || "Software Developer",
          type: masterObj.type || masterObj.setup.type || "Technical",
          level: masterObj.level || masterObj.setup.level || "Mid-level",
          techstack: masterObj.techstack || masterObj.setup.techstack || ["General"],
          amount: masterObj.amount || masterObj.setup.amount || 5,
          requiresSandbox: !!(masterObj.requiresSandbox ?? masterObj.setup.requiresSandbox),
        };
      } else {
        setup = {
          role: masterObj.role || "Software Developer",
          type: masterObj.type || "Technical",
          level: masterObj.level || "Mid-level",
          techstack: masterObj.techstack || ["General"],
          amount: masterObj.amount || 5,
          requiresSandbox: !!masterObj.requiresSandbox,
        };
      }

      // Programmatic fallbacks for requiresSandbox based on type/mode name
      const lowercaseType = setup.type.toLowerCase();
      const isCodingRole = setup.role.toLowerCase().includes("engineer") || 
                           setup.role.toLowerCase().includes("developer") || 
                           setup.role.toLowerCase().includes("programmer") ||
                           setup.role.toLowerCase().includes("coder");

      if (
        lowercaseType.includes("sandbox") || 
        lowercaseType.includes("code review") || 
        lowercaseType.includes("coding")
      ) {
        setup.requiresSandbox = true;
      } else if (
        lowercaseType.includes("technical") || 
        lowercaseType.includes("behavioral") || 
        lowercaseType.includes("behavioural") || 
        lowercaseType.includes("verbal")
      ) {
        setup.requiresSandbox = false;
      }

      questionsList = Array.isArray(masterObj.questions) && masterObj.questions.length > 0
        ? masterObj.questions
        : [
            `What are key architectural principles when building a ${setup.role} application?`,
            `How do you optimize performance and handle error conditions in ${setup.techstack[0] || setup.role}?`,
            `Describe a challenging bug or feature you implemented in your previous projects.`
          ];

      codingProblem = masterObj.codingProblem || null;
      firstMessage = masterObj.firstMessage || `Great, let's start the interview. Here is your first question: ${questionsList[0]}`;

      // Ensure that if requiresSandbox is true, we have a coding problem
      if (setup.requiresSandbox && !codingProblem) {
        codingProblem = {
          title: `${setup.role} Sandbox Exercise`,
          description: `Write code or solve the technical challenge for a ${setup.level}-level ${setup.role} role.`,
          templateCode: isCodingRole 
            ? `// Write your ${setup.role} code here\nfunction main() {\n  console.log("Ready");\n}\n`
            : "Write your solution here\n",
          language: isCodingRole ? "javascript" : "text",
        };
      }

      console.log("[DEBUG] Successfully parsed consolidated parameters:", {
        setup,
        questionsCount: questionsList.length,
        hasCodingProblem: !!codingProblem,
        firstMessage,
      });
    } catch (e: any) {
      console.error("[ERROR] Failed to generate consolidated setup from Groq response, using safe fallback parameters...", e);
      questionsList = [
        "What are key architectural principles when building a software application?",
        "How do you approach debugging complex technical issues?",
        "Describe a challenging project you built recently."
      ];
      firstMessage = `Great, let's start the interview. Here is your first question: ${questionsList[0]}`;
    }

    // 6. Save the interview in Firestore
    const interviewData = {
      role: setup.role,
      type: setup.type,
      level: setup.level,
      techstack: setup.techstack,
      questions: questionsList,
      userId: userid,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
      firstMessage: firstMessage.trim() || "Hello! Ready to start.",
      codingProblem: codingProblem,
      duration: duration || "medium",
    };

    console.log("[DEBUG] Saving generated interview details to Firestore collection 'interviews'...");
    const docRef = await db.collection("interviews").add(interviewData);
    console.log(`[DEBUG] Firestore document saved successfully with ID: ${docRef.id}`);

    return NextResponse.json({
      success: true,
      interviewId: docRef.id,
      questions: questionsList,
      codingProblem: codingProblem,
      firstMessage: interviewData.firstMessage,
    }, { status: 200 });
  } catch (error: any) {
    console.error("[FATAL ERROR] /api/interview/parse-and-create caught unhandled error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to finalize setup" },
      { status: 500 }
    );
  }
}
