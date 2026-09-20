const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables
const envPath = path.join(__dirname, '.env');
let apiKey = '';
let defaultModel = 'openai/gpt-oss-120b';

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
  apiKey = process.env.GROQ_API_KEY;
  if (process.env.GROQ_LLM_MODEL) {
    defaultModel = process.env.GROQ_LLM_MODEL;
  }
} catch (e) {
  console.error("Could not read .env file:", e);
}

if (!apiKey) {
  console.error("GROQ_API_KEY not found in .env");
  process.exit(1);
}

// Simulated state matching Agent.tsx
let messages = [];
let type = "generate"; // Starts in generate mode, then transitions to interview
let userName = "Muhammad Ali";
let userId = "user_123";
let userResumeData = {
  targetRole: "Senior Frontend Engineer",
  resumeData: {
    parsedData: {
      basics: {
        summary: "Passionate developer with 5+ years of React experience."
      },
      skills: ["JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS"]
    }
  }
};

let questions = [
  "Tell me about a challenging frontend project you worked on recently.",
  "How do you optimize page load performance in a Next.js application?",
  "Describe a time you had a disagreement with a product manager and how you resolved it."
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getSystemPrompt() {
  if (type === "interview") {
    const formattedQuestions = questions.map((q) => `- ${q}`).join("\n");
    return `You are Alex, a professional job interviewer conducting a real-time voice interview with a candidate. Your goal is to assess their qualifications, motivation, and fit for the role.

Interview Guidelines:
Follow this structured question flow:
${formattedQuestions}

CRITICAL RULES - CONVERSATIONAL FLOW & CONCISENESS:
- DO NOT LECTURE ON CORRECT ANSWERS: If the candidate answers correctly or reasonably, do not explain the concept, define terms, or repeat the textbook answer back to them. Simply acknowledge briefly (e.g. "Got it.", "Makes sense.", "Solid explanation.") and transition immediately to the next question.
- GENTLY CORRECT BIG BLUNDERS: If the candidate makes a major blunder or says something completely incorrect (e.g. saying React is a fruit color), gently correct them and guide them in the right direction in one short, polite sentence (e.g. "Actually, React is a frontend JavaScript library for building user interfaces. Let's move on to...") before transitioning.
- KEEP RESPONSES VERY SHORT: Keep your replies under 25 words maximum. No yapping or long paragraphs. Keep the pacing fast and conversational.
- Write only plain, clean text. Do not use markdown like bold (**), italics (*), lists, or hashtags.
- Never use emojis.
- If you ask a behavioral question and the candidate's response misses a concrete, measurable Result or outcome (e.g., they don't give numbers, metrics, or saved time), ask a follow-up question specifically seeking to uncover that quantitative metric.
- CONTINUOUS TECHNICAL INTERVIEW PACING RULE: Do NOT conclude or append '[END_CALL]' prematurely while the session timer is active. If initial questions are completed, ask relevant technical follow-up questions, trade-offs, edge cases, or candidate project questions.
- ENDING RULE: Conclude the interview and ALWAYS append '[END_CALL]' ONLY when you receive a '[SYSTEM: Time is up...]' message, OR if the candidate explicitly requests to end the interview. Example upon time up: "Thanks so much for your time today — it was great chatting with you. Best of luck! [END_CALL]"`;
  } else {
    const profileRole = userResumeData?.targetRole || "";
    const profileSummary = userResumeData?.resumeData?.parsedData?.basics?.summary || "";
    const profileSkills = userResumeData?.resumeData?.parsedData?.skills || [];
    const skillsList = Array.isArray(profileSkills) ? profileSkills.slice(0, 6).join(", ") : "";

    return `You are a professional interview assistant helping ${userName} configure their mock interview session.

CANDIDATE PROFILE (already collected, do NOT ask about these again):
- Name: ${userName}
- Target Role: ${profileRole || "Software Engineer"}
- Key Skills: ${skillsList || "JavaScript, React, Node.js"}
- Profile Summary: ${profileSummary ? profileSummary.slice(0, 200) : "Experienced software professional"}

YOUR ONLY JOB: Ask them ONE question only - which type of interview do they want:
1. Technical (concepts, architecture, system design)
2. Behavioral (STAR framework, past experiences)
3. Live Coding Sandbox (solve a coding problem live)

RULES:
- Do NOT ask about job role, experience level, or tech stack - you already have that data.
- Keep every reply under 20 words.
- Write only plain clean text. No markdown, no emojis, no symbols.
- Once they choose, confirm their choice in one short sentence, append "[END_CALL]" at the very end of your response, and end your response. The system will create the interview automatically.`;
  }
}

function checkIsGoodbye(fullMessageText) {
  const lowercaseMsg = fullMessageText.toLowerCase();
  return lowercaseMsg.includes("[end_call]");
}

async function getAIResponse(userInput) {
  if (userInput) {
    messages.push({ role: "user", content: userInput });
  }

  const systemPrompt = getSystemPrompt();
  const history = [
    { role: "system", content: systemPrompt },
    ...messages
  ];

  process.stdout.write("Alex: ");
  let responseText = "";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: defaultModel,
        messages: history,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API returned status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        const line = buffer.substring(0, boundary).trim();
        buffer = buffer.substring(boundary + 1);

        if (line.startsWith("data: ")) {
          const dataStr = line.substring(6).trim();
          if (dataStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices[0]?.delta?.content || "";
            if (content) {
              responseText += content;
              process.stdout.write(content);
            }
          } catch (e) {}
        }
        boundary = buffer.indexOf("\n");
      }
    }
    console.log(); // Newline

    const isGoodbye = checkIsGoodbye(responseText);
    messages.push({ role: "assistant", content: responseText });

    if (isGoodbye) {
      if (type === "generate") {
        console.log("\n>>> [SYSTEM] Transitioning to 'interview' mode...");
        type = "interview";
        messages = [];
        const welcome = "Okay, let's start the interview. Tell me about a challenging frontend project you worked on recently.";
        messages.push({ role: "assistant", content: welcome });
        console.log(`Alex: ${welcome}`);
        promptUser();
      } else {
        console.log("\n>>> [SYSTEM] [END_CALL] detected. Ending call/interview session.");
        rl.close();
      }
    } else {
      promptUser();
    }

  } catch (error) {
    console.error("\nError communicating with AI:", error.message);
    promptUser();
  }
}

function promptUser() {
  rl.question("\nYou: ", (answer) => {
    getAIResponse(answer);
  });
}

// Start conversation
console.log("=== Starting Mockrithm Console Interview Simulator ===");
const initialWelcome = "Hello Muhammad Ali! I am your interview assistant. Which type of interview would you like to prepare for today: Technical, Behavioral, or Live Coding?";
messages.push({ role: "assistant", content: initialWelcome });
console.log(`Alex: ${initialWelcome}`);
promptUser();
