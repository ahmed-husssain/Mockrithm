"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, PhoneOff, Mic, Brain, Volume2, Settings, Trophy,
  Code, Sparkles, CheckCircle2, AlertTriangle, Lightbulb, Play, User, Languages
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InterviewTimer } from "@/components/interview/InterviewTimer";
import { MonacoSandbox } from "@/components/interview/MonacoSandbox";
import { EloLeaderboard } from "@/components/interview/EloLeaderboard";
import { interviewer, interviewLanguages } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";
import { Button } from "@/components/ui/button";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

interface StarChecklist {
  situation: boolean;
  task: boolean;
  action: boolean;
  result: boolean;
  hasMetrics: boolean;
  feedback: string;
  labels?: {
    situation: string;
    task: string;
    action: string;
    result: string;
    hasMetrics: string;
  };
}

const Agent = ({
  userName,
  userId,
  interviewId: propInterviewId,
  feedbackId: propFeedbackId,
  type: propType,
  questions: propQuestions,
  profileImage,
  firstMessage,
  codingProblem: propCodingProblem,
  userResumeData,
  role: propRole,
  sessionType: propSessionType,
  userTier = "freemium",
}: AgentProps) => {
  const router = useRouter();

  // Dynamic interview state hooks allowing live transition
  const [activeType, setActiveType] = useState<"generate" | "interview">(propType);
  const [activeQuestions, setActiveQuestions] = useState<string[]>(propQuestions || []);
  const [activeCodingProblem, setActiveCodingProblem] = useState<any>(propCodingProblem || null);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(propInterviewId || null);
  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(propFeedbackId || null);
  const [activeRole, setActiveRole] = useState<string>(propRole || "");
  const [activeSessionType, setActiveSessionType] = useState<string>(propSessionType || "");
  const [activeFirstMessage, setActiveFirstMessage] = useState<string>(firstMessage || "");

  const typeRef = useRef(activeType);
  const questionsRef = useRef(activeQuestions);
  const codingProblemRef = useRef(activeCodingProblem);
  const roleRef = useRef(activeRole);
  const sessionTypeRef = useRef(activeSessionType);

  useEffect(() => {
    typeRef.current = activeType;
  }, [activeType]);

  useEffect(() => {
    questionsRef.current = activeQuestions;
  }, [activeQuestions]);

  useEffect(() => {
    codingProblemRef.current = activeCodingProblem;
  }, [activeCodingProblem]);

  useEffect(() => {
    roleRef.current = activeRole;
  }, [activeRole]);

  useEffect(() => {
    sessionTypeRef.current = activeSessionType;
  }, [activeSessionType]);

  const type = activeType;
  const questions = activeQuestions;
  const codingProblem = activeCodingProblem;
  const interviewId = activeInterviewId;
  const feedbackId = activeFeedbackId;
  const role = activeRole;
  const sessionType = activeSessionType;

  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, _setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, _setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const setIsSpeaking = (val: boolean) => {
    isSpeakingRef.current = val;
    _setIsSpeaking(val);
  };
  const [lastMessage, setLastMessage] = useState<string>("");

  // Meow Engine Configuration States
  const [selectedVoice, setSelectedVoice] = useState<string>("groq-autumn");
  const [selectedModel, setSelectedModel] = useState<string>("openai/gpt-oss-20b");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"calibration" | "leaderboard">("calibration");
  const [selectedStt, setSelectedStt] = useState<"browser" | "whisper-v3" | "whisper-turbo">("whisper-turbo");
  const selectedSttRef = useRef<string>("whisper-turbo");
  useEffect(() => {
    selectedSttRef.current = selectedStt;
    if (callStatus === CallStatus.ACTIVE) {
      console.log(`[Agent.tsx] STT Engine changed to ${selectedStt}. Reinitializing...`);
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      } catch (e) {}
      stopWhisperRecordingOnly();
      isListeningRef.current = false;
      submittedThisTurnRef.current = false;
      if (!isProcessingRef.current && !isSpeakingActiveRef.current) {
        startSpeechRecognition();
      }
    }
  }, [selectedStt, callStatus]);

  // Interview Language (selected before the session starts)
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-US");
  const languageRef = useRef<string>("en-US");
  useEffect(() => {
    languageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // Enforce tier-based constraints on configurations reactively
  useEffect(() => {
    const tier = userTier || "freemium";
    if (tier === "freemium") {
      if (selectedModel !== "openai/gpt-oss-20b") {
        setSelectedModel("openai/gpt-oss-20b");
      }
      if (selectedStt !== "browser") {
        setSelectedStt("browser");
      }
      if (selectedVoice !== "groq-autumn" && selectedVoice !== "local" && selectedVoice !== "groq-noura") {
        setSelectedVoice(selectedLanguage === "ar-SA" ? "groq-noura" : "groq-autumn");
      }
    } else if (tier === "premium") {
      if (selectedModel === "llama-3.1-8b-instant" || selectedModel === "llama-3.3-70b-versatile" || selectedModel === "openai/gpt-oss-20b") {
        setSelectedModel("openai/gpt-oss-120b");
      }
      if (selectedStt === "whisper-v3") {
        setSelectedStt("whisper-turbo");
      }
    }
  }, [userTier, selectedLanguage, selectedModel, selectedStt, selectedVoice]);

  // Interview Duration Selection
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<"brief" | "medium" | "lengthy" | null>(null);
  const selectedDurationRef = useRef<"brief" | "medium" | "lengthy" | null>(null);
  useEffect(() => {
    selectedDurationRef.current = selectedDuration;
  }, [selectedDuration]);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTimerEndingRef = useRef(false);
  const isGreetingRef = useRef(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  // Live Coding States
  const [code, setCode] = useState("");
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  const [showSandbox, setShowSandbox] = useState(!!propCodingProblem);
  useEffect(() => {
    if (codingProblem) {
      setCode("");
      setShowSandbox(true);
    } else {
      setCode("");
      setShowSandbox(false);
    }
  }, [codingProblem]);
  const [isCodingStuck, setIsCodingStuck] = useState(false);
  const lastCodeTypedRef = useRef<number>(Date.now());

  // Behavioral STAR Framework States
  const [starChecklist, setStarChecklist] = useState<StarChecklist>({
    situation: false,
    task: false,
    action: false,
    result: false,
    hasMetrics: false,
    feedback: "Begin answering the behavioral questions to start analysis.",
  });

  // Verbal & Pacing Analytics
  const userWPMsRef = useRef<number[]>([]);
  // Live Coding tracking refs
  const interviewCodesRef = useRef<Record<string, string>>({});
  const hasSubmittedCurrentCodeRef = useRef(false);
  const fillerCountsRef = useRef<Record<string, number>>({
    like: 0,
    um: 0,
    uh: 0,
    hmm: 0,
    so: 0,
    actually: 0,
    basically: 0,
  });
  const turnStartRef = useRef<number | null>(null);

  // Web Speech API STT
  const SpeechRecognition = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingActiveRef = useRef<boolean>(false);
  const streamCompletedRef = useRef<boolean>(false);
  const sentenceBufferRef = useRef<string>("");
  const accumulatedTextRef = useRef<string>("");
  const localSpeechQueueCountRef = useRef<number>(0);
  const localSpeechFinishedCountRef = useRef<number>(0);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const isCallActiveRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false); // true while a SpeechRecognition instance is live
  const submittedThisTurnRef = useRef<boolean>(false); // true once this turn's speech has been captured
  const messagesRef = useRef<SavedMessage[]>([]);
  const submittedTextRef = useRef<string>(""); // track last submitted text to prevent duplicate processing

  // Whisper Speech-to-Text Refs
  const mediaRecorderRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Derive the effective TTS voice. All languages now have neural TTS
  // (Groq for English/Arabic, edge-tts for everything else). The local
  // browser synthesis is only used when the user explicitly picks "local".
  const currentLangConfig = interviewLanguages.find((l) => l.code === selectedLanguage) || interviewLanguages[0];
  const effectiveVoice: string = currentLangConfig.neuralTTS ? selectedVoice : "local";

  // Pick a browser SpeechSynthesis voice that matches the current interview language.
  const pickBrowserVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !voices || voices.length === 0) return null;
    const lang = languageRef.current.toLowerCase();
    const langBase = lang.split("-")[0]; // e.g. "ur" from "ur-pk"
    // Prefer high-quality voices for the exact locale, then the language family.
    const exact = voices.find((v) => v.lang.toLowerCase() === lang);
    if (exact) return exact;
    const base = voices.find((v) => v.lang.toLowerCase().startsWith(langBase));
    if (base) return base;
    return null;
  };

  // Helper to sync state and ref
  const setMessages = (updater: SavedMessage[] | ((prev: SavedMessage[]) => SavedMessage[])) => {
    _setMessages((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      messagesRef.current = next;
      return next;
    });
  };

  // Sync typing updates to detect stuck states
  const handleCodeChange = (newVal: string) => {
    setCode(newVal);
    lastCodeTypedRef.current = Date.now();
    setIsCodingStuck(false);
  };

  // Check coding activity stuck status (60-second check, visual indicator only to prevent AI interrupting voice chat)
  useEffect(() => {
    if (callStatus !== CallStatus.ACTIVE || !codingProblem || !showSandbox) return;

    // Reset reference time when sandbox becomes visible
    lastCodeTypedRef.current = Date.now();
    setIsCodingStuck(false);

    const interval = setInterval(() => {
      const msSinceLastType = Date.now() - lastCodeTypedRef.current;
      if (msSinceLastType > 60000) { // 60 seconds of inactivity
        setIsCodingStuck(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [callStatus, codingProblem, showSandbox]);

  // Clean resources on unmount
  useEffect(() => {
    return () => {
      isCallActiveRef.current = false;
      isListeningRef.current = false;
      submittedThisTurnRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      stopTTSPlayback();
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      } catch (e) {}
    };
  }, []);

  // Sync and save feedback when finished
  useEffect(() => {
    if (messages.length > 0) {
      const visibleMessages = messages.filter((m) => m.role !== "system");
      if (visibleMessages.length > 0) {
        const rawContent = visibleMessages[visibleMessages.length - 1].content;
        const cleanContent = rawContent.split("[SYSTEM:")[0].trim();
        setLastMessage(cleanContent);
      }
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback with WPM tracking");
      setIsGeneratingFeedback(true);

      const sumWpm = userWPMsRef.current.reduce((a, b) => a + b, 0);
      const averageWpm = userWPMsRef.current.length > 0 ? Math.round(sumWpm / userWPMsRef.current.length) : 0;

      const topFillerWords = Object.entries(fillerCountsRef.current)
        .map(([word, count]) => ({ word, count }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      let candidateCodeData = "";
      if (Object.keys(interviewCodesRef.current).length > 0) {
        const currentCount = Object.keys(interviewCodesRef.current).length;
        const lastSavedCode = interviewCodesRef.current[`Question ${currentCount}`];
        if (codeRef.current && codeRef.current !== lastSavedCode) {
          interviewCodesRef.current[`Question ${currentCount + 1}`] = codeRef.current;
        }
        candidateCodeData = JSON.stringify(interviewCodesRef.current);
      } else {
        candidateCodeData = codeRef.current || "";
      }

      try {
        const { success, feedbackId: id } = await createFeedback({
          interviewId: interviewId!,
          userId: userId!,
          transcript: messages
            .map((m) => {
              let textVal = m.content;
              if (textVal.startsWith("[SYSTEM: The candidate has completed their code")) {
                textVal = "[Candidate submitted code solution]";
              } else if (textVal.startsWith("[SYSTEM: The candidate has completed their text")) {
                textVal = "[Candidate submitted draft text]";
              } else {
                textVal = textVal.split("[SYSTEM:")[0].trim();
              }
              return { role: m.role, content: textVal };
            })
            .filter((m) => m.content.length > 0),
          feedbackId: feedbackId || undefined,
          averageWpm,
          topFillerWords,
          candidateCode: codingProblemRef.current ? candidateCodeData : undefined
        });

        if (success && id) {
          if (typeof window !== "undefined" && window.location.hostname.includes("games.mockrithm.me")) {
            window.location.href = `https://mockrithm.me/interview/${interviewId}/feedback`;
          } else {
            router.push(`/interview/${interviewId}/feedback`);
          }
        } else {
          console.log("Error saving feedback");
          setIsGeneratingFeedback(false);
          if (typeof window !== "undefined" && window.location.hostname.includes("games.mockrithm.me")) {
            window.location.href = "https://mockrithm.me/";
          } else {
            router.push("/");
          }
        }
      } catch (err) {
        console.error("Failed to generate feedback:", err);
        setIsGeneratingFeedback(false);
        if (typeof window !== "undefined" && window.location.hostname.includes("games.mockrithm.me")) {
          window.location.href = "https://mockrithm.me/";
        } else {
          router.push("/");
        }
      }
    };

    const handleSaveConversationSetup = async (messages: SavedMessage[]) => {
      await transitionToInterview();
    };

    if (callStatus === CallStatus.FINISHED) {
      if (activeType === "interview") {
        handleGenerateFeedback(messagesRef.current);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);


  // TTS Control Deck
  const stopTTSPlayback = () => {
    speechQueueRef.current = [];
    isSpeakingActiveRef.current = false;
    streamCompletedRef.current = false;
    sentenceBufferRef.current = "";
    localSpeechQueueCountRef.current = 0;
    localSpeechFinishedCountRef.current = 0;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
      audioRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const playLocalSpeechChunk = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    if (localSpeechQueueCountRef.current === 0) {
      localSpeechFinishedCountRef.current = 0;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageRef.current;
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const matchVoice = pickBrowserVoice(voices);
    if (matchVoice) {
      utterance.voice = matchVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      localSpeechFinishedCountRef.current++;
      if (streamCompletedRef.current && localSpeechFinishedCountRef.current === localSpeechQueueCountRef.current) {
        localSpeechQueueCountRef.current = 0;
        localSpeechFinishedCountRef.current = 0;
        resumeListeningAfterSpeech();
      }
    };

    utterance.onerror = () => {
      localSpeechFinishedCountRef.current++;
      if (streamCompletedRef.current && localSpeechFinishedCountRef.current === localSpeechQueueCountRef.current) {
        localSpeechQueueCountRef.current = 0;
        localSpeechFinishedCountRef.current = 0;
        resumeListeningAfterSpeech();
      }
    };

    localSpeechQueueCountRef.current++;
    window.speechSynthesis.speak(utterance);
  };

  const speakSentenceFallback = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        
        // Stop any active HTML5 audio element playback first
        if (audioRef.current) {
          try {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          } catch (e) {}
          audioRef.current = null;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = languageRef.current;
        utterance.rate = 1.05;

        let voices = window.speechSynthesis.getVoices();
        // Fallback for chrome async load
        if (voices.length === 0) {
          voices = speechSynthesis.getVoices();
        }
        let matchVoice = pickBrowserVoice(voices);
        if (!matchVoice && voices.length > 0) {
          // If no specific locale match, prefer a female voice fallback over the default male voice
          matchVoice = voices.find(v => v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira")) || voices[0];
        }
        if (matchVoice) {
          utterance.voice = matchVoice;
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };

        utterance.onerror = (e) => {
          console.error("Local synth error:", e);
          setIsSpeaking(false);
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } else {
        resolve();
      }
    });
  };

  const speakSentence = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      const cleanText = text.replace(/\[END[-_ ]?CALL\]/gi, "").replace(/\[SHOW[-_ ]?SANDBOX\]/gi, "").replace(/[*#_`~[\]]/g, "").trim();
      console.log(`[Agent.tsx] speakSentence called. Raw: "${text}", Cleaned: "${cleanText}"`);
      const hasSpeakableContent = /[\p{L}\p{N}]/u.test(cleanText);
      if (!cleanText || !hasSpeakableContent) {
        console.log("[Agent.tsx] Empty or punctuation-only text, resolving speakSentence immediately.");
        resolve();
        return;
      }

      if (effectiveVoice === "local") {
        console.log("[Agent.tsx] Effective voice is local. Using speakSentenceFallback.");
        speakSentenceFallback(cleanText).then(resolve);
        return;
      }

      const voiceName = effectiveVoice.startsWith("groq-") ? effectiveVoice.substring(5) : effectiveVoice;
      console.log(`[Agent.tsx] Requesting TTS generation via API for voice: ${voiceName}...`);

      fetch("/api/meow/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanText,
          voice: voiceName,
          language: languageRef.current,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[Agent.tsx] TTS API response error. Status: ${response.status}. Payload:`, errBody);
            throw new Error(`TTS API error: ${response.status} - ${errBody}`);
          }
          console.log("[Agent.tsx] TTS audio blob retrieved successfully.");
          return response.blob();
        })
        .then((blob) => {
          if (!isCallActiveRef.current) {
            console.log("[Agent.tsx] Call is inactive, discarding audio playback.");
            resolve();
            return;
          }
          
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
          }

          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.addEventListener("ended", () => {
            console.log("[Agent.tsx] TTS audio playback ended naturally.");
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
            setIsSpeaking(false);
            resolve();
          });

          audio.addEventListener("error", (e) => {
            console.error("[Agent.tsx] Audio element failed to play audio stream:", e);
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
            console.log("[Agent.tsx] Falling back to local browser synthesis due to audio error.");
            speakSentenceFallback(cleanText).then(resolve);
          });

          audio.addEventListener("playing", () => {
            setIsSpeaking(true);
          });

          console.log("[Agent.tsx] Starting playback of TTS audio stream...");
          audio.play().catch((playErr) => {
            console.warn("[Agent.tsx] Autoplay policy blocked audio stream, falling back to local speech synth:", playErr);
            URL.revokeObjectURL(audioUrl);
            speakSentenceFallback(cleanText).then(resolve);
          });
        })
        .catch((err) => {
          console.error("[Agent.tsx] TTS workflow failed:", err);
          console.log("[Agent.tsx] Falling back to local browser synthesis...");
          speakSentenceFallback(cleanText).then(resolve);
        });
    });
  };

  const processSpeechQueue = async () => {
    if (isSpeakingActiveRef.current) return;

    if (speechQueueRef.current.length === 0) {
      setIsSpeaking(false);
      if (streamCompletedRef.current) {
        resumeListeningAfterSpeech();
      }
      return;
    }

    const nextSentence = speechQueueRef.current.shift()!;
    isSpeakingActiveRef.current = true;

    try {
      await speakSentence(nextSentence);
    } catch (e) {
      console.error("Queue speech sentence error:", e);
    } finally {
      isSpeakingActiveRef.current = false;
      processSpeechQueue();
    }
  };

  const queueSpeechChunk = (text: string) => {
    const cleanText = text.replace(/\[END[-_ ]?CALL\]/gi, "").replace(/\[SHOW[-_ ]?SANDBOX\]/gi, "").replace(/[*#_`~[\]]/g, "").trim();
    const hasSpeakableContent = /[\p{L}\p{N}]/u.test(cleanText);
    if (!cleanText || !hasSpeakableContent) {
      if (effectiveVoice === "local") {
        if (streamCompletedRef.current && localSpeechFinishedCountRef.current === localSpeechQueueCountRef.current) {
          localSpeechQueueCountRef.current = 0;
          localSpeechFinishedCountRef.current = 0;
          resumeListeningAfterSpeech();
        }
      } else {
        if (streamCompletedRef.current && speechQueueRef.current.length === 0 && !isSpeakingActiveRef.current) {
          resumeListeningAfterSpeech();
        }
      }
      return;
    }

    if (effectiveVoice === "local") {
      playLocalSpeechChunk(cleanText);
    } else {
      speechQueueRef.current.push(cleanText);
      processSpeechQueue();
    }
  };

  const handleNewStreamToken = (token: string) => {
    accumulatedTextRef.current += token;

    if (/\[SHOW[-_ ]?SANDBOX\]/i.test(accumulatedTextRef.current)) {
      setShowSandbox(true);
      if (!codingProblemRef.current) {
        const fallbackProblem = {
          title: "Technical Sandbox Workspace",
          description: "Write or edit your solution in the editor below. The interviewer will review your code in real-time.",
          templateCode: `// Write your solution here\n`,
          language: "javascript"
        };
        setActiveCodingProblem(fallbackProblem);
      }
      if (hasSubmittedCurrentCodeRef.current) {
        setCode("");
        hasSubmittedCurrentCodeRef.current = false;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    }

    const displayClean = accumulatedTextRef.current
      .replace(/\[SHOW[-_ ]?SANDBOX\]/gi, "")
      .replace(/\[END[-_ ]?CALL\]/gi, "")
      .trim();
    setLastMessage(displayClean);

    sentenceBufferRef.current += token;
    const sentenceBoundaryRegex = /[.?!;\n]/;
    const match = sentenceBufferRef.current.match(sentenceBoundaryRegex);

    if (match) {
      const puncIndex = sentenceBufferRef.current.indexOf(match[0]);
      const chunkText = sentenceBufferRef.current.substring(0, puncIndex + 1).trim();
      if (chunkText.length > 0) {
        sentenceBufferRef.current = sentenceBufferRef.current.substring(puncIndex + 1);
        const cleanChunk = chunkText
          .replace(/\[SHOW[-_ ]?SANDBOX\]/gi, "")
          .replace(/\[END[-_ ]?CALL\]/gi, "")
          .trim();
        queueSpeechChunk(cleanChunk);
      }
    }
  };

  // Speech Recognition (STT) Setup
  const startSpeechRecognition = () => {
    // Prevent starting the microphone if the AI is currently speaking, processing, or in greeting phase
    if (isSpeakingRef.current || isSpeakingActiveRef.current || isProcessingRef.current || isGreetingRef.current) {
      console.log("[Agent.tsx] STT skipped: AI is currently speaking, processing, or greeting.");
      return;
    }

    if (selectedSttRef.current !== "browser") {
      startWhisperRecording();
      return;
    }

    if (!SpeechRecognition) {
      console.error("[Agent.tsx] SpeechRecognition API is not supported in this browser.");
      return;
    }

    // Single-entry guard: never start two recognition instances at once.
    if (isListeningRef.current) {
      console.log("[Agent.tsx] SpeechRecognition already listening. Skipping duplicate start.");
      return;
    }
    isListeningRef.current = true;

    console.log("[Agent.tsx] Initializing new SpeechRecognition instance...");
    const rec = new SpeechRecognition();
    recognitionRef.current = rec; // Set immediately to ignore obsolete instances
    rec.continuous = false;    // Disabled to let natural single utterances finish and fire immediately
    rec.interimResults = true; // Show real-time transcription while speaking
    rec.lang = languageRef.current;
    rec.maxAlternatives = 1;

    // Per-session accumulators (local vars, not refs)
    let sessionFinal = "";
    let sessionInterim = "";

    // The ONLY path that submits captured speech. Guards against the race
    // between the silence timer, onend, and onerror so a turn's speech is
    // submitted exactly once and a duplicate "Listening... Speak now" never
    // appears from a glitch-triggered restart.
    const submitCapturedSpeech = (text: string) => {
      console.log(`[Agent.tsx - STT SUBMIT] submitCapturedSpeech called. Text: "${text}". isProcessingRef=${isProcessingRef.current}, recognitionRefMatches=${recognitionRef.current === rec}, submittedThisTurnRef=${submittedThisTurnRef.current}`);
      if (recognitionRef.current !== rec) {
        console.warn("[Agent.tsx - STT SUBMIT DISCARD] Obsolete instance mismatch.");
        return;
      }
      if (!isCallActiveRef.current || isProcessingRef.current) {
        console.warn(`[Agent.tsx - STT SUBMIT DISCARD] Call inactive or process busy. isCallActive=${isCallActiveRef.current}, isProcessing=${isProcessingRef.current}`);
        return;
      }
      if (submittedThisTurnRef.current) {
        console.warn("[Agent.tsx - STT SUBMIT DISCARD] Speech already submitted this turn.");
        return;
      }
      submittedThisTurnRef.current = true;
      isProcessingRef.current = true;

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      try {
        rec.stop();
      } catch (e) {}
      handleSpeechCompleted(text);
    };

    rec.onstart = () => {
      console.log(`[Agent.tsx - STT START] SpeechRecognition session started. isListeningRef=${isListeningRef.current}, isProcessingRef=${isProcessingRef.current}, submittedThisTurnRef=${submittedThisTurnRef.current}`);
      isListeningRef.current = true;
      sessionFinal = "";
      sessionInterim = "";
      turnStartRef.current = Date.now();
    };

    rec.onerror = (event: any) => {
      if (recognitionRef.current !== rec) {
        console.log("[Agent.tsx] Obsolete recognition instance error. Discarding event.");
        return;
      }
      console.error("[Agent.tsx] SpeechRecognition error event captured:", event.error);
      if (event.error === "not-allowed") {
        console.error("[Agent.tsx] Microphone access blocked or not allowed.");
        handleDisconnect();
        return;
      }
      // On no-speech or other transient errors, just restart — but only if
      // nothing has been submitted this turn and nothing is processing/speaking.
      if (
        event.error !== "aborted" &&
        !submittedThisTurnRef.current &&
        isCallActiveRef.current &&
        !isProcessingRef.current &&
        !isSpeakingActiveRef.current
      ) {
        console.log("[Agent.tsx] Transient SpeechRecognition error. Restarting in 300ms...");
        setTimeout(() => {
          if (
            !submittedThisTurnRef.current &&
            isCallActiveRef.current &&
            !isProcessingRef.current &&
            !isSpeakingActiveRef.current
          ) {
            startSpeechRecognition();
          }
        }, 300);
      }
    };

    rec.onresult = (event: any) => {
      if (recognitionRef.current !== rec) {
        console.log("[Agent.tsx] Obsolete recognition result discarded.");
        return;
      }
      if (!isCallActiveRef.current || isProcessingRef.current || submittedThisTurnRef.current) {
        console.log("[Agent.tsx] Result discarded: call inactive, process busy, or already submitted.");
        return;
      }

      // Rebuild the final and interim text across continuous updates, preventing consecutive duplicates
      let interimText = "";
      let finalParts = "";
      let lastFinal = "";
      let lastInterim = "";
      for (let i = 0; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          if (transcript && transcript !== lastFinal) {
            finalParts += (finalParts ? " " : "") + transcript;
            lastFinal = transcript;
          }
        } else {
          if (transcript && transcript !== lastInterim) {
            interimText += (interimText ? " " : "") + transcript;
            lastInterim = transcript;
          }
        }
      }
      sessionFinal = finalParts;
      sessionInterim = interimText;

      const displayText = (sessionFinal + sessionInterim).trim();
      console.log(`[Agent.tsx] STT interim transcript: "${displayText}"`);
      if (displayText.length > 0) {
        setLastMessage(displayText);

        // Duplex Interruption: If user starts speaking while AI is talking, pause AI instantly (skip during greetings)
        if (!isGreetingRef.current && (isSpeaking || audioRef.current) && displayText.split(/\s+/).length >= 2) {
          console.log("[Agent.tsx] User interrupted AI. Pausing playback...");
          if (audioRef.current) {
            try { audioRef.current.pause(); } catch(e) {}
          }
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
          }
          setIsSpeaking(false);
          isSpeakingActiveRef.current = false;
        }

        // Reset/start silence detection timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // 1. Context-Aware Dynamic Silence Threshold
        let silenceThreshold = 1100; // default 1.1s
        const isCodingActive = codingProblemRef.current && (Date.now() - lastCodeTypedRef.current < 25000);
        if (isCodingActive) {
          silenceThreshold = 15000; // 15 seconds when active in editor
          console.log("[Agent.tsx] Active coding detected. Extending silence threshold to 15s.");
        }

        // 2. Filler Word Bridging
        const textLower = displayText.toLowerCase().trim();
        const endsWithFiller = /\b(um|uh|like|so|basically|well|wait|let me think|i mean|so basically|if i look at this)$/i.test(textLower);
        if (endsWithFiller) {
          silenceThreshold = Math.max(silenceThreshold, 5000); // 5 seconds grace period
          console.log("[Agent.tsx] Filler word detected. Extending silence threshold to 5s.");
        }

        silenceTimerRef.current = setTimeout(() => {
          console.log(`[Agent.tsx] Silence detected (${silenceThreshold / 1000}s). Submitting speech to AI...`);
          submitCapturedSpeech(displayText);
        }, silenceThreshold);
      }
    };

    rec.onend = () => {
      console.log("[Agent.tsx] SpeechRecognition session ended.");
      if (recognitionRef.current !== rec) {
        console.log("[Agent.tsx] Obsolete recognition instance ended. Discarding event.");
        return;
      }
      isListeningRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // If this turn's speech was already submitted, do nothing — no restart, no re-submit.
      if (submittedThisTurnRef.current) {
        console.log("[Agent.tsx] STT session ended after submission. No further action.");
        return;
      }

      if (!isCallActiveRef.current || isProcessingRef.current || isSpeakingActiveRef.current) {
        console.log("[Agent.tsx] Discarding STT completion: state is active speaking or processing.");
        return;
      }

      const capturedText = (sessionFinal + sessionInterim).trim();
      console.log(`[Agent.tsx] STT session final captured text on end: "${capturedText}"`);

      if (capturedText.length > 1 && !submittedThisTurnRef.current) {
        submitCapturedSpeech(capturedText);
      } else {
        // Restart listening cleanly if session auto-stops empty
        console.log("[Agent.tsx] STT session ended empty. Restarting in 150ms...");
        setTimeout(() => {
          if (
            !submittedThisTurnRef.current &&
            isCallActiveRef.current &&
            !isProcessingRef.current &&
            !isSpeakingActiveRef.current
          ) {
            startSpeechRecognition();
          }
        }, 150);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.error("[Agent.tsx] Exception starting SpeechRecognition:", e);
      isListeningRef.current = false;
    }
  };

  // Start Whisper Microphone Recording and Client VAD
  const startWhisperRecording = async () => {
    // 1. Clean up any existing microphone session first to prevent leaks
    stopWhisperRecordingOnly();

    isListeningRef.current = true;
    submittedThisTurnRef.current = false;
    audioChunksRef.current = [];

    console.log("[Agent.tsx] Starting Whisper microphone recording...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: any) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250); // Capture chunks every 250ms
      turnStartRef.current = Date.now();

      // Set up Audio Context for Volume Detection
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;
        source.connect(analyser);

        const bufferLength = analyser.fftSize;
        const dataArray = new Float32Array(bufferLength);

        let lastSpeechTime = 0;
        let hasSpoken = false;
        let consecutiveSpeechFrames = 0; // count consecutive intervals of voice activity

        const checkAudio = () => {
          if (!isListeningRef.current || submittedThisTurnRef.current) return;

          analyser.getFloatTimeDomainData(dataArray);
          let sumSquares = 0.0;
          for (let i = 0; i < bufferLength; i++) {
            sumSquares += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sumSquares / bufferLength);

          // Voice threshold detection (lowered to 0.015 for better sensitivity to soft speech)
          if (rms > 0.015) {
            consecutiveSpeechFrames++;
            if (consecutiveSpeechFrames >= 3) { // Require ~300ms of sustained volume
              lastSpeechTime = Date.now();
              if (!hasSpoken) {
                hasSpoken = true;
                console.log("[Agent.tsx] User speech activity detected (sustained).");
              }
            }
          } else {
            consecutiveSpeechFrames = 0; // Reset counter on silence
          }

          // If user spoke and now we have 2.2s of silence, transcribe and submit
          // (Increased from 1.5s to 2.2s so the interviewer doesn't cut off slow speakers or breathing pauses)
          if (hasSpoken && Date.now() - lastSpeechTime > 2200) {
            console.log("[Agent.tsx] VAD: Silence detected. Initiating transcription...");
            stopWhisperRecordingAndTranscribe();
          }
        };

        vadIntervalRef.current = setInterval(checkAudio, 100);
      } else {
        console.warn("[Agent.tsx] Web Audio API is not supported. Streaming media recorder only.");
      }

    } catch (err) {
      console.error("[Agent.tsx] Failed to initialize microphone for Whisper:", err);
      isListeningRef.current = false;
    }
  };

  const stopWhisperRecordingOnly = () => {
    isListeningRef.current = false;
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
  };

  const stopWhisperRecordingAndTranscribe = async () => {
    if (submittedThisTurnRef.current) return;
    submittedThisTurnRef.current = true;
    isListeningRef.current = false;
    isProcessingRef.current = true;

    setLastMessage("Transcribing audio...");
    stopWhisperRecordingOnly();

    setTimeout(async () => {
      if (audioChunksRef.current.length === 0) {
        console.warn("[Agent.tsx] No audio chunks captured.");
        isProcessingRef.current = false;
        resumeListeningAfterSpeech();
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      
      // If the audio file is extremely small (empty headers/noise under 4KB), skip transcription to avoid 400 errors
      if (audioBlob.size < 4000) {
        console.warn(`[Agent.tsx] Audio blob size too small (${audioBlob.size} bytes). Skipping transcription.`);
        isProcessingRef.current = false;
        resumeListeningAfterSpeech();
        return;
      }

      const formData = new FormData();
      formData.append("file", audioBlob);
      const modelId = selectedSttRef.current === "whisper-v3" ? "whisper-large-v3" : "whisper-large-v3-turbo";
      formData.append("model", modelId);
      formData.append("language", languageRef.current);

      try {
        const res = await fetch("/api/meow/stt", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.error("[Agent.tsx] STT Error payload details:", errBody);
          throw new Error(`STT API responded with status ${res.status}: ${JSON.stringify(errBody)}`);
        }

        const data = await res.json();
        const text = data.text || "";
        console.log(`[Agent.tsx] Whisper transcription success: "${text}"`);
        
        // Clean and check for common Whisper silence hallucinations
        const cleaned = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        const hallucinations = ["thank you", "thank you very much", "thanks for watching", "you", "bye", "go", "thank you.", "thank you very much.", "thanks for watching."];
        
        if (text.trim().length > 1 && !hallucinations.includes(cleaned)) {
          handleSpeechCompleted(text);
        } else {
          console.log("[Agent.tsx] Whisper transcript empty or hallucination. Resetting listening.");
          isProcessingRef.current = false;
          resumeListeningAfterSpeech();
        }
      } catch (err: any) {
        console.error("[Agent.tsx] Whisper transcription failed:", err);
        setLastMessage("Transcription failed. Reconnecting microphone...");
        isProcessingRef.current = false;
        setTimeout(() => {
          resumeListeningAfterSpeech();
        }, 1500);
      }
    }, 150);
  };


  const handleSpeechCompleted = async (text: string) => {
    if (submittedTextRef.current === text) {
      console.log("[Agent.tsx] Duplicate speech submission blocked.");
      isProcessingRef.current = false;
      return;
    }
    isProcessingRef.current = true;
    submittedTextRef.current = text;

    const isSystemPrompt = text.startsWith("[SYSTEM:");
    let cleanedSpeechText = text;
    if (!isSystemPrompt) {
      // Verbal Pacing & Analytics Calculation
      if (turnStartRef.current) {
        const durationMs = Date.now() - turnStartRef.current;
        const durationMin = durationMs / 1000 / 60;
        const words = text.split(/\s+/).filter(Boolean);
        if (durationMin > 0.05 && words.length > 2) {
          const wpm = words.length / durationMin;
          userWPMsRef.current.push(wpm);
        }
        turnStartRef.current = null;
      }

      // Clean speech of Urdu filler words (ام, امم, etc.) to keep transcripts clean
      if (languageRef.current === "ur-PK") {
        cleanedSpeechText = cleanedSpeechText
          .replace(/\b(امم|ام|آں|اہ|اہہ|اہہہ)\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    } else {
      // Clear start timer on system action turns so they do not contaminate vocal metrics
      turnStartRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } catch (e) {}

    stopTTSPlayback();
    accumulatedTextRef.current = "";
    sentenceBufferRef.current = "";
    speechQueueRef.current = [];
    isSpeakingActiveRef.current = false;
    streamCompletedRef.current = false;

    // Dedup consecutive repeating phrases/sentences (common in Whisper turbo silence hallucinations)
    let dedupedText = cleanedSpeechText;
    const parts = cleanedSpeechText.split(/(?<=[\.\!\?])\s+|(?<=\.\.\.)\s+/);
    if (parts.length > 1) {
      const uniqueParts: string[] = [];
      parts.forEach((part) => {
        const cleanPart = part.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        const lastAdded = uniqueParts[uniqueParts.length - 1];
        const lastAddedClean = lastAdded ? lastAdded.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") : "";
        if (cleanPart && cleanPart !== lastAddedClean) {
          uniqueParts.push(part);
        }
      });
      if (uniqueParts.length > 0) {
        dedupedText = uniqueParts.join(" ");
      }
    }

    // STT Corrections
    let cleanedText = dedupedText;
    const sttCorrections: Record<string, string> = {
      "practice for this whole": "practice for this role",
      "practice for the whole": "practice for the role",
      "yo yo exercise": "UI UX design",
      "yo-yo exercise": "UI UX design",
      "yo yo design": "UI UX design",
      "yo-yo design": "UI UX design",
      "yo yo": "UI/UX",
      "yo-yo": "UI/UX",
      "una": "Q&A",
      "you and a": "Q&A",
      "you and are": "Q&A",
      "you and R": "Q&A",
      "q and a": "Q&A",
      "q & a": "Q&A",
      "qna": "Q&A",
    };
    for (const [misheard, correction] of Object.entries(sttCorrections)) {
      const regex = new RegExp(`\\b${misheard}\\b`, "gi");
      cleanedText = cleanedText.replace(regex, correction);
    }

    // Append timer ending cue
    if (isTimerEndingRef.current && typeRef.current === "interview") {
      cleanedText += "\n[SYSTEM: Time is up. Conclude the interview warmly, thank the candidate, and ALWAYS append '[END_CALL]' at the very end.]";
    }

    // Append user message to history
    const userMsg: SavedMessage = { role: "user", content: cleanedText };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);
    setIsSpeaking(false);

    // Call STAR framework analysis API in parallel
    fetch("/api/interview/analyze-star", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanedText, role: roleRef.current, type: sessionTypeRef.current }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setStarChecklist(data);
        }
      })
      .catch((err) => console.error("Error analyzing STAR:", err));

    try {
      let systemPrompt = "";
      const langConfig = interviewLanguages.find((l) => l.code === languageRef.current);
      const languageInstruction = `LANGUAGE REQUIREMENT: The candidate selected "${langConfig?.name || "English"}" (${languageRef.current}). You MUST speak, ask questions, and reply ONLY in this language for the entire session. Never switch to another language unless the candidate explicitly asks you to. Keep all text plain and natural in that language.`;
      if (typeRef.current === "interview" && questionsRef.current) {
        const formattedQuestions = questionsRef.current.map((q: string) => `- ${q}`).join("\n");
        const candidateRoleName = roleRef.current || userResumeData?.targetRole || "Software Engineer";
        const candidateSessionType = sessionTypeRef.current || "Interview";
        const personaText = candidateRoleName.toLowerCase().includes("president")
          ? "Your persona: A senior political debate moderator or veteran political journalist. Keep your tone formal, sharp, and demanding."
          : candidateRoleName.toLowerCase().includes("joker") || candidateRoleName.toLowerCase().includes("comedian")
          ? "Your persona: A comedy club owner, talent scout, or talk show host. Keep your tone conversational, witty, and responsive to humor."
          : "Your persona: A professional interviewer conducting a real-time voice interview to assess their qualifications, motivation, and fit for the role.";

        const isSandbox = codingProblemRef.current !== null;
        if (isSandbox) {
          systemPrompt = `CRITICAL: You are a fast-paced voice agent. EVERY SINGLE REPLY YOU GENERATE MUST BE UNDER 15 WORDS AND MAXIMUM 2 SENTENCES. You are strictly forbidden from repeating the candidate's answers, explaining concepts they already got right, or lecturing them. Simply acknowledge correctness in 1-3 words (e.g., "Got it", "Correct", "Makes sense") and move immediately to the next question.

You are Alex, conducting a real-time voice coding evaluation with a candidate.
Role: ${candidateRoleName}
Session Mode/Type: ${candidateSessionType}

${personaText}

${languageInstruction}

Interview Guidelines:
Follow this structured question flow:
${formattedQuestions}

CRITICAL SANDBOX WORKSPACE RULE:
- The candidate's screen has a built-in interactive live coding editor sandbox panel.
- Whenever you ask a question that requires writing code, or transition to the coding challenge, you MUST output the exact tag '[SHOW_SANDBOX]' (case-insensitive) in your response. This will automatically open the code editor workspace on their screen.
- Never solve the challenge, write solution code, output templates, or suggest external coding tools. Simply present the task, output '[SHOW_SANDBOX]', and wait for them to write the solution inside their editor workspace.
- CODE EVALUATION & INTERACTIVE DIALOGUE FLOW RULE: When the candidate submits code/text in the sandbox, do NOT immediately present the next question in your response. Instead, first evaluate the submitted solution briefly, then ask them a single follow-up question about their solution (e.g., asking why they chose a specific method, how they would optimize it, or what edge cases they considered). Wait for them to answer verbally. Once they explain verbally, you may ask a second verbal follow-up or transition to the next question in your structured flow by introducing the task and outputting '[SHOW_SANDBOX]'. Only conclude the interview and append '[END_CALL]' when all questions in the structured flow have been completed.

CRITICAL RULES - CONVERSATIONAL FLOW & CONCISENESS:
- SOCRATIC HINT / STUCK PIVOT: If the candidate says "I don't know" or "I am stuck" for the first time on a question, give them ONE helpful conceptual hint or ask a simpler sub-question. BUT if they say "I don't know", "skip", or "I have no idea" a second time, or explicitly ask to move on, you MUST immediately stop asking about it, briefly explain the correct answer in under 15 words, and transition directly to the next question. Never get stuck looping on the same concept or force them to answer.
- DO NOT VERBALLY READ OUT THE LONG CHALLENGE INSTRUCTIONS OR CODE: When you transition to the coding challenge, simply introduce it briefly in one sentence (under 15 words) and output '[SHOW_SANDBOX]'. The candidate will read the details in the workspace on their screen. Never output code blocks, templates, or instructions in your speech.
- DO NOT REPEAT, PARAPHRASE, OR LECTURE ON ANSWERS: If the candidate answers correctly or reasonably, you MUST NOT repeat their answer, summarize what they said, define terms, or explain the concept back to them. Simply acknowledge their correctness extremely briefly (e.g., "Got it.", "Correct.", "Makes sense.") and transition immediately to the next question. Never repeat the candidate's own words back to them.
- GENTLY CORRECT BIG BLUNDERS: If the candidate makes a major blunder or says something completely incorrect, gently correct them and guide them in the right direction in one short, polite sentence before transitioning.
- CRITICAL CONCISENESS & NO YAP: Keep your replies extremely short (under 20 words maximum). Speak in 1-2 brief sentences only.
- NO HALLUCINATIONS: Do not refer to UI tabs, examples on the screen, or other options. The user's screen only displays you (the interviewer avatar), the chat logs, and a Start button.
- CONTINUOUS SANDBOX INTERVIEW PACING RULE: Do NOT conclude or append '[END_CALL]' prematurely while the session timer is still running. If all initial questions are completed before time is up, continue the technical evaluation with relevant follow-ups, code optimizations, edge cases, or architecture questions.
- ENDING RULE: Conclude the interview and append '[END_CALL]' ONLY when you receive a '[SYSTEM: Time is up...]' message, OR if the candidate explicitly requests to end or stop the interview early. Example upon time up: "Thanks so much for your time today. Best of luck! [END_CALL]"

Sandbox/Workspace Info:
- The candidate is working on the task/problem: "${codingProblemRef.current.title}".
- Description: ${codingProblemRef.current.description}
- Candidate's current draft/code is:
\`\`\`${codingProblemRef.current.language}
${codeRef.current}
\`\`\`
- If the candidate gets stuck, provide a Socratic hint to help them think in the right direction. Do NOT give them the full solution.`;
        } else {
          const rawProjects = userResumeData?.resumeData?.parsedData?.projects || userResumeData?.resumeData?.fixedParsedData?.projects || [];
          const candidateProjectsText = Array.isArray(rawProjects) && rawProjects.length > 0
            ? rawProjects.map((p: any) => `${p.name || p.title || "Project"}: ${p.description || (p.highlights || []).slice(0, 2).join(" ") || ""}`).join(" | ")
            : "None listed";

          systemPrompt = `CRITICAL CONCISENESS RULE: You are a fast-paced voice interviewer. EVERY SINGLE REPLY YOU GENERATE MUST BE UNDER 20 WORDS AND MAXIMUM 2 SENTENCES. Keep the pacing fast, direct, and conversational.

You are Alex, conducting a real-time voice interview with ${userName}.
Role: ${candidateRoleName}
Session Mode/Type: ${candidateSessionType}
CANDIDATE PROJECTS: ${candidateProjectsText}

${personaText}

${languageInstruction}

Interview Guidelines:
Follow this structured question flow one by one:
${formattedQuestions}

CRITICAL RULES - CONVERSATIONAL FLOW & CONCISENESS:
- FLEXIBLE / PROJECT PIVOT RULE: If the candidate asks to talk about their projects (e.g. "ask about my project", "ask about Mockrithm", etc.), you MUST immediately adapt and ask a technical question about one of their listed projects (${candidateProjectsText}). Do NOT refuse, say "let's shift gears", or ignore their project request.
- CONVERSATIONAL QA FLOW: Ask the questions in the structured flow one by one. Once you state a question, wait for the candidate's response. Do NOT ask multiple questions at once.
- DO NOT REPEAT, PARAPHRASE, OR LECTURE ON ANSWERS: If the candidate answers correctly or reasonably, you MUST NOT repeat their answer or summarize what they said. Simply acknowledge their correctness extremely briefly in 1-3 words (e.g., "Got it.", "Correct.", "Makes sense.") and transition to the next question.
- NO CODING WORKSPACE/SANDBOX: There is no coding challenge or sandbox workspace in this mode. Do NOT mention a coding challenge, code submission, or output '[SHOW_SANDBOX]'.
- SOCRATIC HINT / STUCK PIVOT: If the candidate says "I don't know" or "I am stuck" on a question, give them ONE helpful conceptual hint or ask a simpler sub-question. BUT if they say "I don't know", "skip", or "I have no idea" a second time, or explicitly ask to move on, you MUST immediately stop asking about it, briefly explain the correct answer in under 15 words, and transition directly to the next question.
- GENTLY CORRECT BIG BLUNDERS: If the candidate makes a major blunder or says something completely incorrect, gently correct them in one short sentence before transitioning.
- NO HALLUCINATIONS: Do not refer to UI tabs, examples on the screen, or other options.
- CONTINUOUS TECHNICAL INTERVIEW PACING RULE: Do NOT conclude or append '[END_CALL]' prematurely just because you went through the initial list of questions above! If all initial questions are completed and the session timer is still running (meaning you have NOT received a '[SYSTEM: Time is up...]' message), keep the interview active and engaging for the candidate. Ask relevant technical follow-up questions about their answers, explore performance trade-offs, edge cases, system architecture, or ask technical questions about their listed projects (${candidateProjectsText}).
- ENDING RULE: Conclude the interview and append '[END_CALL]' ONLY when you receive a '[SYSTEM: Time is up...]' message, OR if the candidate explicitly requests to end or stop the interview early (e.g. "I'm done", "let's wrap up", "end the interview"). Never output '[END_CALL]' before time is up unless explicitly requested by the candidate. Example upon time up: "Thanks so much for your time today. Best of luck! [END_CALL]"`;
        }
      } else {
        const profileRole = roleRef.current || userResumeData?.targetRole || "";
        const profileSummary = userResumeData?.resumeData?.parsedData?.basics?.summary || userResumeData?.resumeData?.summary || "";
        const profileSkills = userResumeData?.resumeData?.parsedData?.skills || userResumeData?.resumeData?.fixedParsedData?.skills || [];
        const skillsList = Array.isArray(profileSkills) ? profileSkills.slice(0, 6).join(", ") : "";

        systemPrompt = `CRITICAL: You are an extremely brief configuration assistant. EVERY SINGLE REPLY YOU GENERATE MUST BE UNDER 15 WORDS AND MAXIMUM 1 SENTENCE. Avoid introductory yapping, details or lists. Be extremely brief, fast and direct.

You are a professional interview assistant helping ${userName} configure their mock session.

CANDIDATE PROFILE (already collected, do NOT ask about these again unless changing):
- Name: ${userName}
- Default Target Role: ${profileRole || "Software Engineer"}
- Key Skills: ${skillsList || "JavaScript, React, Node.js"}
- Profile Summary: ${profileSummary ? profileSummary.slice(0, 200) : "Experienced professional"}
- Selected Session Duration Limit: ${selectedDurationRef.current === "brief" ? "5 minutes" : selectedDuration === "medium" ? "10 minutes" : "unlimited / no time limit"} (Do NOT recommend or mention a 30-minute coding challenge duration limit, explicitly say they will have ${selectedDurationRef.current === "brief" ? "5 minutes" : selectedDuration === "medium" ? "10 minutes" : "unlimited time"} to complete the task).

YOUR CONVERSATION FLOW:
1. First, ask them if they want to practice their listed target role ("${profileRole || "Software Engineer"}") or something else.
2. If they say they want to practice their target role:
   - Suggest exactly two session options/modes suited specifically to the role: "Technical" (verbal, conceptual Q&A) and "Live Coding Sandbox" (hands-on coding workspace). Do NOT recommend or mention "Code Review", "Design Challenge", or any other options.
   - Ask them to pick one.
3. If they say they want to practice a different role (or name a different role):
   - Ask what role they want to practice (if not already specified).
   - Once they specify the new role, suggest exactly the two session modes ("Technical" and "Live Coding Sandbox") for this new role.
   - Ask them to pick one.

RULES:
- Keep every reply under 20 words.
- NO UI HALLUCINATIONS: The user's screen only shows you, the chat logs, and a Start button. There are no examples or other tabs to choose from. Do not refer to elements that are not on the screen.
- Write only plain clean text. No markdown, no emojis, no symbols.
- ${languageInstruction}
- Do NOT append "[END_CALL]" when suggesting options. Only append "[END_CALL]" at the very end of your message AFTER the candidate has explicitly responded and selected one of the options (e.g., they picked "Technical" or "Live Coding Sandbox"). Once they make their final selection, confirm it in one short sentence and append "[END_CALL]" at the end.`;
      }

      setLastMessage("AI is thinking...");
      setIsSpeaking(true);

      const history = [
        { role: "system", content: systemPrompt },
        ...nextMessages,
      ];

      const response = await fetch("/api/meow/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: history,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to get reader");

      const decoder = new TextDecoder();
      let buffer = "";

      setIsSpeaking(true);

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
            if (dataStr === "[DONE]") {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const token = parsed.choices?.[0]?.delta?.content || "";
              if (token) {
                handleNewStreamToken(token);
              }
            } catch (e) {}
          }
          boundary = buffer.indexOf("\n");
        }
      }

      streamCompletedRef.current = true;

      if (sentenceBufferRef.current.trim().length > 0) {
        const chunk = sentenceBufferRef.current.trim();
        sentenceBufferRef.current = "";
        queueSpeechChunk(chunk);
      } else {
        if (effectiveVoice === "local") {
          if (
            localSpeechQueueCountRef.current === 0 ||
            localSpeechFinishedCountRef.current === localSpeechQueueCountRef.current
          ) {
            localSpeechQueueCountRef.current = 0;
            localSpeechFinishedCountRef.current = 0;
            resumeListeningAfterSpeech();
          }
        } else {
          if (speechQueueRef.current.length === 0 && !isSpeakingActiveRef.current) {
            resumeListeningAfterSpeech();
          }
        }
      }
    } catch (e: any) {
      console.error("[Agent.tsx] LLM streaming failed with error:", e);
      console.error("[Agent.tsx] Error message:", e.message);
      console.error("[Agent.tsx] Error stack:", e.stack);
      setLastMessage(`Error: ${e.message}`);
      isProcessingRef.current = false; // Reset processing flag to unfreeze UI
      
      if (isTimerEndingRef.current) {
        console.warn("[Agent.tsx] LLM failed during time-up wrap up. Disconnecting immediately to prevent freeze.");
        handleDisconnect();
      } else {
        setTimeout(() => {
          resumeListeningAfterSpeech();
        }, 3000);
      }
    }
  };

  const requestSocraticHint = () => {
    if (callStatus !== CallStatus.ACTIVE || isProcessingRef.current) return;
    setIsCodingStuck(false);
    const isWritten = codingProblemRef.current?.language === "text" || codingProblemRef.current?.language === "markdown";
    handleSpeechCompleted(isWritten 
      ? "I am stuck on this draft. Can you give me a Socratic hint about my current text?" 
      : "I am stuck on this coding problem. Can you give me a Socratic hint about my current code?");
  };

  const checkSolutionAndProceed = () => {
    if (callStatus !== CallStatus.ACTIVE || isProcessingRef.current) return;
    const isWritten = codingProblemRef.current?.language === "text" || codingProblemRef.current?.language === "markdown";
    
    const qKey = `Question ${Object.keys(interviewCodesRef.current).length + 1}`;
    interviewCodesRef.current[qKey] = codeRef.current;
    hasSubmittedCurrentCodeRef.current = true;
    
    const proceedPrompt = isWritten
      ? `[SYSTEM: The candidate has submitted their draft text: "${codeRef.current}". 
1. Evaluate it objectively (if it is correct, state that briefly. Do not nitpick or force imaginary bugs).
2. Ask the candidate a brief follow-up question about the text they wrote (e.g. asking them to explain their choice of words, their structure, or key ideas).
3. Do NOT transition to the next question in the flow yet. You must wait for their verbal response first.]`
      : `[SYSTEM: The candidate has submitted their code solution: "${codeRef.current}". 
1. Evaluate it objectively (if it is correct, state that briefly. Do not nitpick or force imaginary bugs).
2. Ask the candidate a brief follow-up question about the code they wrote (e.g. asking them to explain why they used a specific method, how they'd handle an edge case, or what the time/space complexity is).
3. Do NOT transition to the next coding question in the flow yet. You must wait for their verbal response first.]`;
    handleSpeechCompleted(proceedPrompt);
  };

  async function triggerAutomaticHint() {
    if (callStatus !== CallStatus.ACTIVE || isProcessingRef.current) return;
    
    setIsCodingStuck(false);
    lastCodeTypedRef.current = Date.now();
    isProcessingRef.current = true;
    
    stopTTSPlayback();
    accumulatedTextRef.current = "";
    sentenceBufferRef.current = "";
    speechQueueRef.current = [];
    isSpeakingActiveRef.current = false;
    streamCompletedRef.current = false;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } catch (e) {}

    const isWritten = codingProblemRef.current?.language === "text" || codingProblemRef.current?.language === "markdown";
    const hintPrompt = isWritten
      ? `[SYSTEM: The candidate has been inactive/stuck on the writing sandbox for 10 seconds. Proactively help them with a brief, warm Socratic hint or suggestion based on their current text: "${code}". Keep it under 25 words.]`
      : `[SYSTEM: The candidate has been inactive/stuck on the coding sandbox for 10 seconds. Proactively help them with a brief, warm Socratic hint based on their current code: "${code}". Keep it under 25 words.]`;

    const systemCue: SavedMessage = { role: "user", content: hintPrompt };
    const nextMessages = [...messagesRef.current, systemCue];
    setMessages(nextMessages);
    setIsSpeaking(false);
    setLastMessage("AI is thinking...");
    setIsSpeaking(true);

    try {
      const candidateRoleName = roleRef.current || userResumeData?.targetRole || "Software Engineer";
      const candidateSessionType = sessionTypeRef.current || "Interview";
      const langConfig = interviewLanguages.find((l) => l.code === languageRef.current);
      const languageInstruction = `LANGUAGE REQUIREMENT: The candidate selected "${langConfig?.name || "English"}" (${languageRef.current}). You MUST reply ONLY in this language.`;
      const personaText = candidateRoleName.toLowerCase().includes("president")
        ? "Your persona: A senior political debate moderator or veteran political journalist. Keep your tone formal, sharp, and demanding."
        : candidateRoleName.toLowerCase().includes("joker") || candidateRoleName.toLowerCase().includes("comedian")
        ? "Your persona: A comedy club owner, talent scout, or talk show host. Keep your tone conversational, witty, and responsive to humor."
        : "Your persona: A professional interviewer conducting a real-time voice interview to assess their qualifications, motivation, and fit for the role.";

      const formattedQuestions = questionsRef.current.map((q: string) => `- ${q}`).join("\n");
      
      const systemPrompt = `You are Alex, conducting a real-time voice evaluation or interview with a candidate.
Role: ${candidateRoleName}
Session Mode/Type: ${candidateSessionType}

${personaText}

${languageInstruction}

Interview Guidelines:
Follow this structured question flow:
${formattedQuestions}

CRITICAL SANDBOX WORKSPACE RULE:
- The candidate's screen has a built-in interactive live coding editor sandbox panel.
- Whenever you ask a question that requires writing code, or transition to the coding challenge, you MUST output the exact tag '[SHOW_SANDBOX]' (case-insensitive) in your response. This will automatically open the code editor workspace on their screen.
- Never solve the challenge, write solution code, output templates, or suggest external coding tools (like CodeSandbox or JSFiddle). Simply present the task, output '[SHOW_SANDBOX]', and wait for them to write the solution inside their editor workspace.
- CODE EVALUATION & INTERACTIVE DIALOGUE FLOW RULE: When the candidate submits code/text in the sandbox, do NOT immediately present the next question in your response. Instead, first evaluate the submitted solution briefly, then ask them a single follow-up question about their solution (e.g., asking why they chose a specific method, how they would optimize it, or what edge cases they considered). Wait for them to answer verbally. Once they explain verbally, you may ask a second verbal follow-up or transition to the next question in your structured flow by introducing the task and outputting '[SHOW_SANDBOX]'. Only conclude the interview and append '[END_CALL]' when all questions in the structured flow have been completed.

CRITICAL RULES - CONVERSATIONAL FLOW & CONCISENESS:
- SOCRATIC HINT / STUCK PIVOT: If the candidate says "I don't know", "I am stuck", or remains silent, do NOT fail them or jump to the next question. Give them a helpful, encouraging conceptual hint or ask a simpler sub-question to guide them. Encourage them to guess or reason it out.
- DO NOT VERBALLY READ OUT THE LONG CHALLENGE INSTRUCTIONS OR CODE: When you transition to the coding challenge, simply introduce it briefly in one sentence (under 15 words) and output '[SHOW_SANDBOX]'. The candidate will read the details in the workspace on their screen. Never output code blocks, templates, or instructions in your speech.
- DO NOT LECTURE ON CORRECT ANSWERS: If the candidate answers correctly or reasonably, do not explain the concept, define terms, or repeat the textbook answer back to them. Simply acknowledge briefly (e.g. "Got it.", "Makes sense.", "Solid explanation.") and transition immediately to the next question.
- GENTLY CORRECT BIG BLUNDERS: If the candidate makes a major blunder or says something completely incorrect, gently correct them and guide them in the right direction in one short, polite sentence before transitioning.
- KEEP RESPONSES VERY SHORT: Keep your replies under 25 words maximum. No yapping or long paragraphs. Keep the pacing fast and conversational.
- Write only plain, clean text. Do not use markdown like bold (**), italics (*), lists, or hashtags.
- Never use emojis.
- CONTINUOUS INTERVIEW PACING RULE: Do NOT conclude or append '[END_CALL]' prematurely while the session timer is active. If initial questions are finished, continue asking relevant technical follow-up questions, trade-offs, edge cases, or candidate project questions.
- ENDING RULE: Conclude the interview and ALWAYS append '[END_CALL]' ONLY when you receive a '[SYSTEM: Time is up...]' message, OR if the candidate explicitly requests to end the interview.

${
  codingProblemRef.current
    ? `Sandbox/Workspace Info:
- The candidate is working on the task/problem: "${codingProblemRef.current.title}".
- Description: ${codingProblemRef.current.description}
- Candidate's current draft/code is:
\`\`\`${codingProblemRef.current.language}
${codeRef.current}
\`\`\`
- If the candidate gets stuck, provide a Socratic hint to help them think in the right direction. Do NOT give them the full solution.`
    : ""
}`;

      const history = [
        { role: "system", content: systemPrompt },
        ...nextMessages,
      ];

      const response = await fetch("/api/meow/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: history,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to get reader");

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
            if (dataStr === "[DONE]") {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const token = parsed.choices?.[0]?.delta?.content || "";
              if (token) {
                handleNewStreamToken(token);
              }
            } catch (e) {}
          }
          boundary = buffer.indexOf("\n");
        }
      }

      streamCompletedRef.current = true;

      if (effectiveVoice === "local") {
        if (sentenceBufferRef.current.trim().length > 0) {
          const chunk = sentenceBufferRef.current.trim();
          sentenceBufferRef.current = "";
          queueSpeechChunk(chunk);
        } else {
          if (
            localSpeechQueueCountRef.current === 0 ||
            localSpeechFinishedCountRef.current === localSpeechQueueCountRef.current
          ) {
            localSpeechQueueCountRef.current = 0;
            localSpeechFinishedCountRef.current = 0;
            resumeListeningAfterSpeech();
          }
        }
      } else {
        queueSpeechChunk(accumulatedTextRef.current.trim());
      }
    } catch (e: any) {
      console.error("[Agent.tsx] LLM streaming failed during auto-hint:", e);
      setLastMessage("Error: " + e.message);
      isProcessingRef.current = false; // Reset processing flag to unfreeze UI
      setTimeout(() => {
        resumeListeningAfterSpeech();
      }, 3000);
    }
  }

  async function transitionToInterview() {
    console.log("[Agent.tsx] transitionToInterview triggered.");
    
    // Clean up any active microphone/speech recognition session from the generate phase
    stopWhisperRecordingOnly();
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } catch (e) {}
    isListeningRef.current = false;

    isProcessingRef.current = true;
    setIsSpeaking(true);
    setLastMessage("Configuring your interview questions. Please hold on...");

    try {
      const payload = {
        messages: messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
        userid: userId,
        userResumeData: userResumeData,
        language: selectedLanguage,
        duration: selectedDuration,
      };
      console.log("[Agent.tsx] POST payload to /api/interview/parse-and-create:", payload);

      const res = await fetch("/api/interview/parse-and-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log(`[Agent.tsx] Received response status: ${res.status}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Agent.tsx] API parse-and-create returned non-OK status. Body: ${errorText}`);
        throw new Error(`Server returned status ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      console.log("[Agent.tsx] Response payload parsed:", data);

      if (data.success && data.interviewId) {
        console.log(`[Agent.tsx] Transition success. Active Interview ID: ${data.interviewId}`);
        setActiveQuestions(data.questions || []);
        setActiveCodingProblem(data.codingProblem || null);
        setActiveInterviewId(data.interviewId);
        setActiveType("interview");
        setActiveFeedbackId(null);
        setActiveRole(data.role || "");
        setActiveSessionType(data.type || "");

        setActiveFirstMessage(data.firstMessage || "");

        const welcome = data.firstMessage || "Okay, let's start the interview.";
        setLastMessage(welcome);

        // Reset the message history to start the interview cleanly
        setMessages([{ role: "assistant", content: welcome }]);

        // Start countdown timer here when the active interview mode starts!
        const chosenDuration = selectedDurationRef.current || "medium";
        const durationSeconds = chosenDuration === "brief" ? 5 * 60 : chosenDuration === "medium" ? 10 * 60 : null;
        setTimerSecondsLeft(durationSeconds);

        // Force call to be active
        isCallActiveRef.current = true;
        setCallStatus(CallStatus.ACTIVE);
        setIsSpeaking(true);

        // Speak the welcome greeting (prevent interruption during greeting)
        isGreetingRef.current = true;
        await speakSentence(welcome);
        isGreetingRef.current = false;

        setIsSpeaking(false);
        submittedTextRef.current = "";
        submittedThisTurnRef.current = false;
        isListeningRef.current = false;
        setLastMessage("Listening... Speak now");
        isProcessingRef.current = false;
        startSpeechRecognition();
      } else {
        console.error("[Agent.tsx] API success is false or missing interviewId:", data);
        throw new Error("Failed to parse and create interview");
      }
    } catch (err: any) {
      console.error("[Agent.tsx] Exception caught during transitionToInterview:", err);
      console.error("[Agent.tsx] Error stack trace:", err.stack);
      setLastMessage("Failed to start interview. Ending call.");
      setTimeout(() => {
        handleDisconnect();
      }, 3000);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const resumeListeningAfterSpeech = () => {
    isProcessingRef.current = false;
    setIsSpeaking(false);

    const fullMessageText = accumulatedTextRef.current.trim();

    if (isCallActiveRef.current) {
      if (fullMessageText.length > 0) {
        const assistantMsg: SavedMessage = { role: "assistant" as const, content: fullMessageText };
        setMessages((prev) => [...prev, assistantMsg]);
        accumulatedTextRef.current = "";
      }

      // Check if the assistant message signals the end of the interview
      const lowercaseMsg = fullMessageText.toLowerCase();
      let isGoodbye = lowercaseMsg.includes("[end_call]");

      if (!isGoodbye && typeRef.current === "generate") {
        const hasSelection = lowercaseMsg.includes("technical") || lowercaseMsg.includes("sandbox") || lowercaseMsg.includes("coding");
        const hasStartPhrase = lowercaseMsg.includes("started") || lowercaseMsg.includes("begin") || lowercaseMsg.includes("starting") || lowercaseMsg.includes("start the") || lowercaseMsg.includes("let's get") || lowercaseMsg.includes("let's start");
        if (hasSelection && hasStartPhrase) {
          console.warn("[Agent.tsx] LLM forgot [END_CALL] tag but confirmed transition. Triggering backup transition.");
          isGoodbye = true;
        }
      }

      if (isGoodbye) {
        if (typeRef.current === "generate") {
          transitionToInterview();
        } else {
          // Stop timer if running
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          let attempts = 0;
          const checkAndDisconnect = () => {
            attempts++;
            const isAudioPlaying = audioRef.current && !audioRef.current.paused && !audioRef.current.ended;
            const isStillSpeaking = isSpeakingActiveRef.current || (isAudioPlaying ? true : false);
            if (isStillSpeaking && attempts < 20) {
              console.log("[Agent.tsx] Interviewer is still speaking. Delaying disconnect...");
              setTimeout(checkAndDisconnect, 250);
            } else {
              console.log("[Agent.tsx] Interviewer finished speaking or max wait reached. Disconnecting now...");
              setIsSpeaking(false);
              isSpeakingActiveRef.current = false;
              handleDisconnect();
            }
          };
          setTimeout(checkAndDisconnect, 1000);
        }
      } else {
        // Reset per-turn flags so the next turn captures fresh speech exactly once.
        submittedTextRef.current = ""; // reset so next answer isn't blocked
        submittedThisTurnRef.current = false;
        isListeningRef.current = false;
        if (showSandbox && !hasSubmittedCurrentCodeRef.current) {
          setLastMessage("Sandbox Active. Voice disabled — use sandbox buttons or submit when done.");
        } else {
          setLastMessage("Listening... Speak now");
          startSpeechRecognition();
        }
      }
    }
  };

  // Connect & Disconnect Call Lifecycles
  const startCallWithDuration = async (duration: "brief" | "medium" | "lengthy") => {
    setSelectedDuration(duration);
    selectedDurationRef.current = duration;
    setShowDurationModal(false);
    isTimerEndingRef.current = false;

    // Compute seconds for timer (brief=5min, medium=10min, lengthy=no timer)
    const durationSeconds = duration === "brief" ? 5 * 60 : duration === "medium" ? 10 * 60 : null;

    setCallStatus(CallStatus.CONNECTING);
    isCallActiveRef.current = true;
    isProcessingRef.current = false;
    isListeningRef.current = false;
    submittedThisTurnRef.current = false;
    accumulatedTextRef.current = "";
    sentenceBufferRef.current = "";
    speechQueueRef.current = [];

    if (type === "generate") {
      // The timer remains disabled/null during the setup conversation phase
      setTimerSecondsLeft(null);
    } else {
      setTimerSecondsLeft(durationSeconds);
    }

    // Dynamic Custom Welcome Greeting seeding
    let welcomeMsg = activeFirstMessage || firstMessage || interviewer.firstMessage || "Hello! Thank you for taking the time to speak with me today.";
    if (type === "generate") {
      const profileRole = userResumeData?.targetRole || "Software Engineer";
      if (selectedLanguage === "ur-PK") {
        welcomeMsg = `ہیلو ${userName}! میں دیکھ سکتا ہوں کہ آپ کا ہدف کردار "${profileRole}" ہے۔ کیا آپ اسی کردار کے لیے مشق کرنا چاہیں گے، یا آج کسی دوسرے کردار کی تیاری کرنا چاہتے ہیں؟`;
      } else if (selectedLanguage === "es-ES") {
        welcomeMsg = `¡Hola ${userName}! Veo que tu rol objetivo es "${profileRole}". ¿Te gustaría practicar para este rol o prefieres prepararte para un rol diferente hoy?`;
      } else if (selectedLanguage === "fr-FR") {
        welcomeMsg = `Bonjour ${userName}! Je vois que votre rôle cible est "${profileRole}". Souhaitez-vous vous entraîner pour ce rôle, ou préférez-vous vous préparer pour un autre rôle aujourd'hui?`;
      } else if (selectedLanguage === "zh-CN") {
        welcomeMsg = `你好 ${userName}！我看到你的目标职位是 "${profileRole}"。你想针对这个职位进行练习，还是今天想准备其他职位？`;
      } else if (selectedLanguage === "ar-SA") {
        welcomeMsg = `مرحباً ${userName}! أرى أن دورك المستهدف هو "${profileRole}". هل ترغب في التدرب على هذا الدور، أم ترغب في الاستعداد لدور مختلف اليوم؟`;
      } else if (selectedLanguage === "hi-IN") {
        welcomeMsg = `नमस्ते ${userName}! मैं देख सकता हूँ कि आपकी लक्षित भूमिका "${profileRole}" है। क्या आप इस भूमिका के लिए अभ्यास करना चाहेंगे, या आज किसी अन्य भूमिका की तैयारी करना चाहेंगे?`;
      } else if (selectedLanguage === "de-DE") {
        welcomeMsg = `Hallo ${userName}! Ich sehe, dass deine Zielrolle als "${profileRole}" aufgeführt ist. Möchtest du für diese Rolle üben oder dich heute auf eine andere Rolle vorbereiten?`;
      } else if (selectedLanguage === "pt-BR") {
        welcomeMsg = `Olá ${userName}! Vejo que seu cargo de interesse é "${profileRole}". Você gostaria de praticar para este cargo ou prefere se preparar para um cargo diferente hoje?`;
      } else if (selectedLanguage === "ja-JP") {
        welcomeMsg = `こんにちは ${userName}さん！目標の職種が「${profileRole}」に設定されているようですね。この職種の練習を始めますか？それとも今日は別の職種の準備をしますか？`;
      } else {
        welcomeMsg = `Hello ${userName}! I see your target role is listed as "${profileRole}". Would you like to practice for this role, or would you like to prepare for a different role today?`;
      }
    }

    setMessages([]);
    setCallStatus(CallStatus.ACTIVE);
    setIsSpeaking(true);

    setLastMessage(welcomeMsg);
    setMessages([{ role: "assistant", content: welcomeMsg }]);

    // Speak welcome message (prevent interruption during greeting)
    isGreetingRef.current = true;
    await speakSentence(welcomeMsg);
    isGreetingRef.current = false;

    // Start listening once welcome message finishes speaking
    if (isCallActiveRef.current) {
      setIsSpeaking(false);
      submittedTextRef.current = ""; // reset for fresh session
      submittedThisTurnRef.current = false;
      isListeningRef.current = false;
      setLastMessage("Listening... Speak now");
      startSpeechRecognition();
    }
  };

  const handleCall = () => {
    // Show duration picker modal instead of starting immediately
    setShowDurationModal(true);
  };

  const handleDisconnect = () => {
    setCallStatus(typeRef.current === "generate" ? CallStatus.INACTIVE : CallStatus.FINISHED);
    isCallActiveRef.current = false;
    isListeningRef.current = false;
    submittedThisTurnRef.current = false;

    if (typeRef.current === "generate") {
      setLastMessage("");
      setMessages([]);
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerSecondsLeft(null);

    stopTTSPlayback();
    stopWhisperRecordingOnly();

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } catch (e) {}
  };

    // Quick inline localization translations dictionary
    const translations: Record<string, Record<string, string>> = {
      "ur-PK": {
        "active": "مشق کا سیشن فعال ہے",
        "session_id": "سیشن آئی ڈی",
        "type": "قسم",
        "language": "زبان",
        "connection": "کنکشن",
        "stable": "مستحکم",
        "title": "مصنوعی ذہانت کا انٹرویو لینے والا",
        "profile": "امیدوار کا پروفائل",
        "pace": "بولنے کی رفتار",
        "fillers": "فالتو الفاظ",
        "detected": "پائے گئے",
        "analyzer": "جواب کا تجزیہ کار",
        "insights": "براہ راست بصیرت",
        "situation": "صورتحال",
        "task": "کام",
        "action": "عمل",
        "result": "نتیجہ",
        "evaluation_insights": "تشخیص کی بصیرت",
        "default_feedback": "تجزیہ شروع کرنے کے لیے سلوکی سوالات کے جواب دینا شروع کریں۔",
        "start_session": "وائس سیشن شروع کریں",
        "connecting": "رابطہ قائم کیا جا رہا ہے...",
        "end_session": "مشق کا سیشن ختم کریں",
        "interview_length": "انٹرویو کا دورانیہ",
        "length_desc": "آپ اس سیشن کو کتنا طویل رکھنا چاہیں گے؟",
        "brief": "مختصر",
        "brief_desc": "~5 منٹ · فوری مشق کا دور",
        "medium": "درمیانہ",
        "medium_desc": "~10 منٹ · متوازن سیشن",
        "lengthy": "طویل",
        "lengthy_desc": "20+ منٹ · مکمل انٹرویو کا تجربہ",
        "no_limit": "کوئی حد نہیں",
        "workspace_sandbox": "کام کی جگہ کا سینڈ باکس",
        "coding_sandbox": "کوڈنگ سینڈ باکس",
        "ready": "تیار",
        "need_hint": "کیا آپ کو کوئی اشارہ چاہیے؟",
        "get_hint": "اشارہ حاصل کریں",
        "req_hint": "سقراطی اشارہ کی درخواست کریں",
        "calibration": "مشق کی ترتیب",
        "show_settings": "ترتیبات دکھائیں",
        "hide_settings": "ترتیبات چھپائیں",
        "model": "انٹرویو کا ماڈل",
        "voice": "آواز کا انجن"
      },
      "es-ES": {
        "active": "Sesión de práctica activa",
        "session_id": "ID de sesión",
        "type": "Tipo",
        "language": "Idioma",
        "connection": "Conexión",
        "stable": "Estable",
        "title": "Entrevistador de voz de IA",
        "profile": "Perfil del candidato",
        "pace": "Ritmo de voz",
        "fillers": "Muletillas detectadas",
        "detected": "Detectado",
        "analyzer": "Analizador de respuestas",
        "insights": "Información en vivo",
        "situation": "Situación",
        "task": "Tarea",
        "action": "Acción",
        "result": "Resultado",
        "evaluation_insights": "Análisis de evaluación",
        "default_feedback": "Comienza a responder las preguntas de comportamiento para iniciar el análisis.",
        "start_session": "Iniciar sesión de voz",
        "connecting": "Conectando...",
        "end_session": "Finalizar sesión de práctica",
        "interview_length": "Duración de la entrevista",
        "length_desc": "¿Cuánto tiempo te gustaría que dure esta sesión?",
        "brief": "Breve",
        "brief_desc": "~5 minutos · Ronda de práctica rápida",
        "medium": "Medio",
        "medium_desc": "~10 minutos · Sesión equilibrada",
        "lengthy": "Largo",
        "lengthy_desc": "20+ minutos · Experiencia completa de entrevista",
        "no_limit": "Sin límite",
        "workspace_sandbox": "Sandbox del espacio de trabajo",
        "coding_sandbox": "Sandbox de código",
        "ready": "Listo",
        "need_hint": "¿Necesitas una pista?",
        "get_hint": "Obtener pista",
        "req_hint": "Solicitar pista socrática",
        "calibration": "Calibración de práctica",
        "show_settings": "Mostrar configuración",
        "hide_settings": "Ocultar configuración",
        "model": "Modelo de entrevista",
        "voice": "Motor de voz"
      },
      "fr-FR": {
        "active": "Session de pratique active",
        "session_id": "ID de session",
        "type": "Type",
        "language": "Langue",
        "connection": "Connexion",
        "stable": "Stable",
        "title": "Interviewer vocal IA",
        "profile": "Profil du candidat",
        "pace": "Rythme de parole",
        "fillers": "Tics de langage détectés",
        "detected": "Détecté",
        "analyzer": "Analyseur de réponse",
        "insights": "Aperçu en direct",
        "situation": "Situation",
        "task": "Tâche",
        "action": "Action",
        "result": "Résultat",
        "evaluation_insights": "Analyses d'évaluation",
        "default_feedback": "Commencez à répondre aux questions comportementales pour lancer l'analyse.",
        "start_session": "Démarrer la session vocale",
        "connecting": "Connexion...",
        "end_session": "Terminer la session",
        "interview_length": "Durée de l'entretien",
        "length_desc": "Combien de temps souhaitez-vous que cette session dure ?",
        "brief": "Court",
        "brief_desc": "~5 minutes · Entraînement rapide",
        "medium": "Moyen",
        "medium_desc": "~10 minutes · Session équilibrée",
        "lengthy": "Long",
        "lengthy_desc": "20+ minutes · Entretien complet",
        "no_limit": "Pas de limite",
        "workspace_sandbox": "Bac à sable de rédaction",
        "coding_sandbox": "Bac à sable de codage",
        "ready": "Prêt",
        "need_hint": "Besoin d'un indice ?",
        "get_hint": "Obtenir un indice",
        "req_hint": "Demander un indice socratique",
        "calibration": "Configuration",
        "show_settings": "Afficher les paramètres",
        "hide_settings": "Masquer les paramètres",
        "model": "Modèle d'entretien",
        "voice": "Moteur vocal"
      }
    };

    const t = (key: string): string => {
      const lang = selectedLanguage;
      if (translations[lang] && translations[lang][key]) {
        return translations[lang][key];
      }
      // Fallback translation table to English default mappings
      const defaults: Record<string, string> = {
        "active": "Practice Session Active",
        "session_id": "Session ID",
        "type": "Type",
        "language": "Language",
        "connection": "Connection",
        "stable": "Stable",
        "title": "AI Voice Interviewer",
        "profile": "Candidate Profile",
        "pace": "Speaking Pace",
        "fillers": "Fillers Detected",
        "detected": "Live Insights",
        "analyzer": "Response Analyzer",
        "insights": "Live Insights",
        "situation": "Situation",
        "task": "Task",
        "action": "Action",
        "result": "Result",
        "evaluation_insights": "Evaluation Insights",
        "default_feedback": "Begin answering the behavioral questions to start analysis.",
        "start_session": "Start Voice Session",
        "connecting": "Connecting...",
        "end_session": "End Practice Session",
        "interview_length": "Interview Length",
        "length_desc": "How long would you like this session to be?",
        "brief": "Brief",
        "brief_desc": "~5 minutes · Quick practice round",
        "medium": "Medium",
        "medium_desc": "~10 minutes · Balanced session",
        "lengthy": "Lengthy",
        "lengthy_desc": "20+ minutes · Full interview experience",
        "no_limit": "No limit",
        "workspace_sandbox": "Workspace Sandbox",
        "coding_sandbox": "Coding Sandbox",
        "ready": "Ready",
        "need_hint": "Need a hint?",
        "get_hint": "Get Hint",
        "req_hint": "Request Socratic Hint",
        "calibration": "Practice Calibration",
        "show_settings": "Show Settings",
        "hide_settings": "Hide Settings",
        "model": "Interview Model",
        "voice": "Speech Engine Voice"
      };
      return defaults[key] || key;
    };

    const currentWpmList = userWPMsRef.current;
    const currentAverageWpm = currentWpmList.length > 0
      ? Math.round(currentWpmList.reduce((a, b) => a + b, 0) / currentWpmList.length)
      : 135; // Fallback typical conversation rate

    const fillerUm = fillerCountsRef.current?.um || 0;
    const fillerLike = fillerCountsRef.current?.like || 0;
    const fillerUh = fillerCountsRef.current?.uh || 0;
    const fillerSo = fillerCountsRef.current?.so || 0;

    return (
      <div className="w-full flex flex-col gap-6 font-mona-sans text-zinc-100 selection:bg-violet-500/30 selection:text-white">
        {/* Duration Selection Modal */}
        <AnimatePresence>
          {showDurationModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 20 }}
                className="relative w-full max-w-sm mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl p-7 shadow-2xl"
              >
                <button
                  onClick={() => setShowDurationModal(false)}
                  className="absolute top-4 right-4 text-zinc-600 hover:text-zinc-300 transition-colors text-xs font-bold"
                >
                  ✕
                </button>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-1">{t("interview_length")}</h2>
                <p className="text-[11px] text-zinc-500 mb-6">{t("length_desc")}</p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => startCallWithDuration("brief")}
                    className="group w-full flex items-center justify-between px-5 py-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40 hover:bg-emerald-950/20 transition-all duration-300 cursor-pointer"
                  >
                    <div className="text-left">
                      <div className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-emerald-300 transition-colors">{t("brief")}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{t("brief_desc")}</div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 bg-zinc-300/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">5 min</span>
                  </button>
                  <button
                    onClick={() => startCallWithDuration("medium")}
                    className="group w-full flex items-center justify-between px-5 py-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-amber-500/40 hover:bg-amber-950/20 transition-all duration-300 cursor-pointer"
                  >
                    <div className="text-left">
                      <div className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-amber-300 transition-colors">{t("medium")}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{t("medium_desc")}</div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">10 min</span>
                  </button>
                  <button
                    onClick={() => startCallWithDuration("lengthy")}
                    className="group w-full flex items-center justify-between px-5 py-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-violet-500/40 hover:bg-violet-950/20 transition-all duration-300 cursor-pointer"
                  >
                    <div className="text-left">
                      <div className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-violet-300 transition-colors">{t("lengthy")}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{t("lengthy_desc")}</div>
                    </div>
                    <span className="text-[10px] font-bold text-zinc-300 bg-zinc-900 border border-violet-500/20 px-2.5 py-1 rounded-full">{t("no_limit")}</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sleek Modern Session Status Bar */}
        {callStatus !== CallStatus.INACTIVE && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full backdrop-blur-xl bg-zinc-950/40 border border-zinc-900 px-6 py-3.5 rounded-2xl flex items-center justify-between flex-wrap gap-4 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                {t("active")}
              </span>
            </div>

            <div className="flex gap-6 items-center text-zinc-500 text-[11px] font-semibold">
              <div className="max-sm:hidden">
                <span className="text-zinc-600 mr-1.5">{t("language")}:</span>
                <span className="text-sky-300 font-bold">{currentLangConfig.name.split(" (")[0]}</span>
              </div>
               {activeType === "interview" && (
                 <InterviewTimer
                   initialSeconds={timerSecondsLeft}
                   onTimeUp={() => {
                     console.log("[Agent.tsx] Time is up! Finishing session...");
                     isTimerEndingRef.current = true;
                     if (typeRef.current === "interview") {
                       handleSpeechCompleted("[SYSTEM: Time is up. Conclude the interview warmly, thank the candidate, and ALWAYS append '[END_CALL]' at the very end.]");
                       
                       // Client-side safety timeout: Force disconnect after 8 seconds if LLM yaps, gets rate limited, or fails to hang up
                       setTimeout(() => {
                         if (isCallActiveRef.current) {
                           console.warn("[Agent.tsx] Time-up safety timeout triggered. Forcing disconnect.");
                           handleDisconnect();
                         }
                       }, 8000);
                     } else {
                       handleDisconnect();
                     }
                   }}
                 />
               )}

              <div>
                <span className="text-zinc-600 mr-1.5">{t("connection")}:</span>
                <span className="text-emerald-400 font-bold">{t("stable")}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Settings Panel: Styled as Modern Calibration Drawer */}
        {callStatus === CallStatus.INACTIVE && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={cn(
              "w-full mx-auto p-6 backdrop-blur-2xl bg-zinc-950/40 rounded-2xl flex flex-col gap-5 border border-zinc-900 shadow-2xl relative overflow-hidden group transition-all duration-300",
              showSettings && settingsTab === "leaderboard" ? "max-w-4xl" : "max-w-xl"
            )}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="p-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                    <Settings className="size-4 text-white" />
                  </span>
                  {t("calibration")}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                {showSettings && (
                  <div className="flex items-center bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-[10px] font-mono font-bold">
                    <button
                      onClick={() => setSettingsTab("calibration")}
                      className={cn(
                        "px-3 py-1 rounded-lg transition-all flex items-center gap-1.5",
                        settingsTab === "calibration" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white"
                      )}
                    >
                      <Settings className="size-3" /> Voice & Audio
                    </button>
                    <button
                      onClick={() => setSettingsTab("leaderboard")}
                      className={cn(
                        "px-3 py-1 rounded-lg transition-all flex items-center gap-1.5",
                        settingsTab === "leaderboard" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
                      )}
                    >
                      <Trophy className="size-3 text-amber-400" /> Leaderboard & ELO
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-[10px] font-bold text-white hover:text-zinc-350 cursor-pointer transition-colors duration-200 px-3 py-1.5 bg-zinc-950 border border-zinc-900 rounded-lg hover:border-zinc-800 shadow-md uppercase tracking-wider"
                >
                  {showSettings ? t("hide_settings") : t("show_settings")}
                </button>
              </div>
            </div>

            {/* Interview Language — always visible, must be chosen before starting */}
            {(!showSettings || settingsTab === "calibration") && (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Languages className="size-3.5 text-zinc-400" /> {t("language")}
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="bg-zinc-950 text-zinc-100 text-xs rounded-xl p-3 border border-zinc-900 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-800 outline-none cursor-pointer hover:bg-zinc-900 transition-all font-semibold"
                >
                  {interviewLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name} {!lang.neuralTTS && "(Browser Voice)"}
                    </option>
                  ))}
                </select>
                {!currentLangConfig.neuralTTS && (
                  <p className="text-[10px] text-amber-400/80 font-semibold leading-relaxed">
                    This language uses your browser/OS built-in voice for the interviewer. For best results, install the {currentLangConfig.name.split(" ")[0]} voice in your system settings.
                  </p>
                )}
              </div>
            )}

            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-2 border-t border-zinc-900 pt-4 overflow-hidden"
                >
                  {settingsTab === "leaderboard" ? (
                    <EloLeaderboard currentUserId={userId} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <Brain className="size-3.5 text-zinc-400" /> {t("model")}
                        </label>
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="bg-zinc-950 text-zinc-100 text-xs rounded-xl p-3 border border-zinc-900 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-800 outline-none cursor-pointer hover:bg-zinc-900 transition-all font-semibold"
                        >
                          <option value="openai/gpt-oss-20b">GPT-OSS 20B (Free)</option>
                          <option value="openai/gpt-oss-120b" disabled={userTier === "freemium"}>
                            GPT-OSS 120B {userTier === "freemium" ? "(Premium Only)" : "(Pro)"}
                          </option>
                        </select>
                        <span className="text-[9px] text-emerald-500/80 font-medium leading-tight mt-1">
                          ⚡ Ultra-fast Groq API engine. Instant sub-second response times.
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <Volume2 className="size-3.5 text-zinc-400" /> {t("voice")}
                        </label>
                        <select
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="bg-zinc-950 text-zinc-100 text-xs rounded-xl p-3 border border-zinc-900 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-800 outline-none cursor-pointer hover:bg-zinc-900 transition-all font-semibold"
                        >
                          {selectedLanguage === "ar-SA" ? (
                            <>
                              <option value="groq-noura">Noura (Female - Free)</option>
                              <option value="groq-abdullah" disabled={userTier === "freemium"}>Abdullah {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-aisha" disabled={userTier === "freemium"}>Aisha {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-fahad" disabled={userTier === "freemium"}>Fahad {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-sultan" disabled={userTier === "freemium"}>Sultan {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-lulwa" disabled={userTier === "freemium"}>Lulwa {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                            </>
                          ) : (
                            <>
                              <option value="groq-autumn">Autumn (Female - Free)</option>
                              <option value="groq-diana" disabled={userTier === "freemium"}>Diana {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-hannah" disabled={userTier === "freemium"}>Hannah {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-austin" disabled={userTier === "freemium"}>Austin {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-daniel" disabled={userTier === "freemium"}>Daniel {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                              <option value="groq-troy" disabled={userTier === "freemium"}>Troy {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}</option>
                            </>
                          )}
                          <option value="local">Local Browser Synthesis (Free)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <Mic className="size-3.5 text-zinc-400" /> Speech-to-Text (STT)
                        </label>
                        <select
                          value={selectedStt}
                          onChange={(e) => setSelectedStt(e.target.value as any)}
                          className="bg-zinc-950 text-zinc-100 text-xs rounded-xl p-3 border border-zinc-900 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-800 outline-none cursor-pointer hover:bg-zinc-900 transition-all font-semibold"
                        >
                          <option value="browser">Browser Web Speech (Free)</option>
                          <option value="whisper-turbo" disabled={userTier === "freemium"}>
                            Whisper Large V3 Turbo {userTier === "freemium" ? "(Premium Only)" : "(Premium)"}
                          </option>
                          <option value="whisper-v3" disabled={userTier === "freemium" || userTier === "premium"}>
                            Whisper Large V3 {userTier === "freemium" || userTier === "premium" ? "(Pro Only)" : "(Pro)"}
                          </option>
                        </select>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Main Split Grid for Practice & Editor */}
        <div className={cn(
          "grid grid-cols-1 gap-5 items-start w-full",
          (codingProblem && showSandbox) ? "lg:grid-cols-12" : "max-w-4xl mx-auto"
        )}>
          
          {/* Left Side: Voice Card, Transcript, STAR Tracker */}
          <div className={cn(
            "flex flex-col gap-4 w-full",
            (codingProblem && showSandbox) ? "lg:col-span-6" : "col-span-1"
          )}>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full items-stretch font-mono animate-fadeIn">
              {/* AI Voice Interviewer Orb Card - Terminal Style */}
              <motion.div 
                whileHover={{ y: -1 }}
                onClick={() => {
                  if (callStatus === CallStatus.ACTIVE && isSpeaking) {
                    console.log("[Agent.tsx] Click-to-interrupt: User tapped interviewer orb. Stopping playback.");
                    stopTTSPlayback();
                    setIsSpeaking(false);
                    resumeListeningAfterSpeech();
                  }
                }}
                className={cn(
                  "flex items-center justify-center flex-col gap-3.5 p-4 min-h-[175px] backdrop-blur-xl border rounded-xl flex-1 w-full shadow-2xl relative overflow-hidden transition-all duration-500",
                  callStatus === CallStatus.ACTIVE && isSpeaking
                    ? "bg-black/85 border-zinc-700/80 shadow-[0_0_30px_rgba(255,255,255,0.02)] cursor-pointer hover:border-zinc-500"
                    : "bg-black/40 border-zinc-800/80"
                )}
              >
                <div className="relative flex justify-center items-center h-16 w-16">
                  {/* Circular breathing halo aura */}
                  <div className={cn(
                    "absolute inset-0 border rounded-full transition-all duration-1000",
                    callStatus === CallStatus.ACTIVE && isSpeaking 
                      ? "border-zinc-700/20 scale-110 bg-white/5" 
                      : "border-zinc-800/20 scale-100 opacity-0"
                  )} />
                  <div className={cn(
                    "absolute inset-1.5 border rounded-full transition-all duration-1000",
                    callStatus === CallStatus.ACTIVE && isSpeaking 
                      ? "border-zinc-800 scale-105 bg-white/5 animate-pulse" 
                      : "border-zinc-800/10 scale-100 opacity-0"
                  )} />
                  
                  {/* Voice core orb */}
                  <div className={cn(
                    "z-10 flex items-center justify-center rounded-full size-[48px] relative border transition-all duration-500 shadow-2xl bg-zinc-950",
                    callStatus === CallStatus.ACTIVE && isSpeaking 
                      ? "border-zinc-300 scale-105 shadow-[0_0_15px_rgba(255,255,255,0.1)]" 
                      : "border-zinc-800"
                  )}>
                    {/* Glowing core animation */}
                    <svg className={cn("w-5 h-5", callStatus === CallStatus.ACTIVE && isSpeaking ? "text-white animate-pulse" : "text-zinc-650")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                </div>
                
                <div className="text-center flex flex-col gap-1 items-center">
                  <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono text-center">Alex</h3>
                  <span className="text-[7.5px] text-zinc-400 font-bold tracking-widest bg-zinc-900/60 border border-zinc-855 px-2 py-0.5 rounded uppercase font-mono">
                    console_node: active
                  </span>
                </div>

                {callStatus === CallStatus.ACTIVE && (
                  <div className="flex flex-col items-center gap-2 w-full mt-0.5 font-mono">
                    {isSpeaking ? (
                      <>
                        <div className="flex items-end justify-center gap-1 h-3.5">
                          <div className="w-1 bg-white rounded-full h-2 animate-[pulse_0.7s_infinite]" />
                          <div className="w-1 bg-zinc-300 rounded-full h-3.5 animate-[pulse_1s_infinite] delay-100" />
                          <div className="w-1 bg-white rounded-full h-2.5 animate-[pulse_0.6s_infinite] delay-200" />
                          <div className="w-1 bg-zinc-300 rounded-full h-1.5 animate-[pulse_0.8s_infinite] delay-150" />
                        </div>
                        <span className="text-[7.5px] text-zinc-500 font-bold uppercase tracking-wider mt-1.5 transition-colors">
                          Click orb to interrupt
                        </span>
                      </>
                    ) : (
                      <div className="flex items-center gap-1 h-3.5 opacity-30">
                        <span className="w-1 h-1 bg-zinc-700 rounded-full animate-bounce" />
                        <span className="w-1 h-1 bg-zinc-700 rounded-full animate-bounce delay-100" />
                        <span className="w-1 h-1 bg-zinc-700 rounded-full animate-bounce delay-200" />
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              {/* Candidate Premium Profile Panel - Terminal Style */}
              <motion.div 
                whileHover={{ y: -1 }}
                className="flex items-center justify-center flex-col gap-3.5 p-4 min-h-[175px] backdrop-blur-xl border border-zinc-800/80 bg-black/40 rounded-xl flex-1 w-full shadow-2xl relative overflow-hidden transition-all duration-500 max-md:hidden animate-fadeIn"
              >
                <div className="relative font-mono">
                  <div className="absolute -inset-0.5 rounded-full bg-zinc-800/50 p-[1px]" />
                  <div className="relative w-11 h-11 rounded-full overflow-hidden bg-zinc-955 border border-zinc-800/60">
                    {profileImage ? (
                      <Image
                        src={profileImage}
                        alt={userName}
                        width={44}
                        height={44}
                        className="rounded-full object-cover size-full animate-fadeIn"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                        <User className="w-5 h-5 text-zinc-650" />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-center flex flex-col gap-1 items-center w-full font-mono">
                  <h3 className="text-xs font-bold text-white tracking-wide truncate max-w-[140px] text-center">
                    {userName}
                  </h3>
                  <span className="text-[7.5px] text-zinc-400 font-bold uppercase tracking-wider bg-zinc-900/60 border border-zinc-855 px-2 py-0.5 rounded">
                    candidate_session
                  </span>
                </div>

                {callStatus === CallStatus.ACTIVE && (
                  <div className="w-full flex flex-col gap-2 mt-1 bg-zinc-955/40 border border-zinc-900/60 p-2.5 rounded-xl font-mono">
                    <div className="flex justify-between items-center text-[9px] font-bold">
                      <span className="text-zinc-555 font-mono">speech_cadence</span>
                      <span className="text-white">{currentAverageWpm} WPM</span>
                    </div>
                    <div className="w-full h-1 bg-zinc-900 rounded overflow-hidden">
                      <div 
                        className="h-full bg-white transition-all duration-500"
                        style={{ width: `${Math.min(100, (currentAverageWpm / 200) * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[8px] font-bold text-zinc-555 border-t border-zinc-900/60 pt-1.5 mt-0.5">
                      <span>fillers:</span>
                      <span className="text-zinc-300 font-mono">
                        count({fillerLike + fillerUm + fillerUh})
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Simple Stark Dialogue Transcript Box */}
            {lastMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-zinc-800 rounded-xl w-full shadow-2xl relative overflow-hidden backdrop-blur-xl bg-black/60 p-6 text-center"
              >
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2 font-mono">
                  {isSpeaking || callStatus !== CallStatus.ACTIVE ? "Interviewer" : "Candidate"}
                </div>
                <p
                  key={lastMessage}
                  className="text-sm text-white font-medium leading-relaxed max-w-xl mx-auto animate-fadeIn font-sans"
                >
                  "{lastMessage}"
                </p>
              </motion.div>
            )}
            
            {/* STAR Response Analyzer Board */}
            {callStatus === CallStatus.ACTIVE && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4.5 backdrop-blur-2xl bg-zinc-950/40 border border-zinc-900 rounded-2xl flex flex-col gap-3 shadow-2xl relative overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <h4 className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                    <Sparkles className="size-3.5 text-zinc-300" />
                    {activeSessionType ? `${activeSessionType} Evaluation` : t("analyzer")}
                  </h4>
                  <span className="text-[8px] bg-zinc-900 text-zinc-300 font-bold px-2 py-0.5 rounded-full border border-violet-500/25 uppercase tracking-wider">
                    {t("insights")}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Situation */}
                  <div className={cn(
                    "p-2.5 rounded-xl border flex flex-col gap-1 items-center justify-center text-center transition-all duration-500 backdrop-blur-md",
                    starChecklist.situation 
                      ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-400 shadow-md" 
                      : "bg-zinc-900/10 border-zinc-900 text-zinc-650 hover:border-zinc-800"
                  )}>
                    <CheckCircle2 className={cn("size-3.5 transition-colors duration-500", starChecklist.situation ? "text-emerald-400" : "text-zinc-800")} />
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-full">{starChecklist.labels?.situation || t("situation")}</span>
                  </div>
                  
                  {/* Task */}
                  <div className={cn(
                    "p-2.5 rounded-xl border flex flex-col gap-1 items-center justify-center text-center transition-all duration-500 backdrop-blur-md",
                    starChecklist.task 
                      ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-400 shadow-md" 
                      : "bg-zinc-900/10 border-zinc-900 text-zinc-650 hover:border-zinc-800"
                  )}>
                    <CheckCircle2 className={cn("size-3.5 transition-colors duration-500", starChecklist.task ? "text-emerald-400" : "text-zinc-800")} />
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-full">{starChecklist.labels?.task || t("task")}</span>
                  </div>
                  
                  {/* Action */}
                  <div className={cn(
                    "p-2.5 rounded-xl border flex flex-col gap-1 items-center justify-center text-center transition-all duration-500 backdrop-blur-md",
                    starChecklist.action 
                      ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-400 shadow-md" 
                      : "bg-zinc-900/10 border-zinc-900 text-zinc-650 hover:border-zinc-800"
                  )}>
                    <CheckCircle2 className={cn("size-3.5 transition-colors duration-500", starChecklist.action ? "text-emerald-400" : "text-zinc-800")} />
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-full">{starChecklist.labels?.action || t("action")}</span>
                  </div>
                  
                  {/* Result */}
                  <div className={cn(
                    "p-2.5 rounded-xl border flex flex-col gap-1 items-center justify-center text-center transition-all duration-500 backdrop-blur-md",
                    starChecklist.result 
                      ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-400 shadow-md" 
                      : "bg-zinc-900/10 border-zinc-900 text-zinc-650 hover:border-zinc-800"
                  )}>
                    <CheckCircle2 className={cn("size-3.5 transition-colors duration-500", starChecklist.result ? "text-emerald-400" : "text-zinc-800")} />
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-full">{starChecklist.labels?.result || t("result")}</span>
                  </div>
                </div>
   
                {/* Warnings and Dynamic Feedback */}
                <AnimatePresence>
                  {starChecklist.result && !starChecklist.hasMetrics && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-amber-950/10 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-[10px] flex gap-2.5 items-start shadow-md"
                    >
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span>
                        <strong className="text-amber-300 font-bold uppercase">Missing {starChecklist.labels?.hasMetrics || "Evidence"}:</strong> You outlined a response, but did not support it with specific {starChecklist.labels?.hasMetrics?.toLowerCase() || "details or metrics"}.
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="text-[10px] text-zinc-400 leading-relaxed bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 font-semibold">
                  <span className="text-zinc-300 font-bold uppercase tracking-wider mr-2">{t("evaluation_insights")}:</span>
                  {starChecklist.feedback === "Begin answering the behavioral questions to start analysis." ? t("default_feedback") : starChecklist.feedback}
                </div>
              </motion.div>
            )}

            {/* Action Trigger Buttons */}
            <div className="w-full flex justify-center mt-0.5">
              {isGeneratingFeedback ? (
                <div className="flex flex-col items-center gap-3 py-2 animate-pulse">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-white border-t-transparent"></div>
                  <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase tracking-wider">
                    Generating Feedback...
                  </span>
                </div>
              ) : callStatus !== "ACTIVE" ? (
                <button 
                  className="relative cursor-pointer flex items-center justify-center font-bold text-xs bg-white text-black px-8 py-3 rounded-full hover:bg-zinc-200 transition-all duration-300 active:scale-95 border border-white shadow-xl uppercase tracking-wider shadow-[0_4px_25px_rgba(255,255,255,0.15)]" 
                  onClick={() => handleCall()}
                >
                  <span
                    className={cn(
                      "absolute animate-ping rounded-full opacity-40 bg-zinc-400 h-[80%] w-[80%]",
                      callStatus !== "CONNECTING" && "hidden"
                    )}
                  />
                  <span className="relative flex items-center gap-2 font-black">
                    <span className="size-2 rounded-full bg-black animate-pulse" />
                    {callStatus === "INACTIVE" || callStatus === "FINISHED" ? t("start_session") : t("connecting")}
                  </span>
                </button>
              ) : (
                <button 
                  className="cursor-pointer flex items-center justify-center gap-2 font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-full transition-all duration-300 active:scale-95 border border-rose-500 shadow-xl tracking-wider uppercase hover:shadow-[0_4px_25px_rgba(225,29,72,0.25)]" 
                  onClick={() => handleDisconnect()}
                >
                  <PhoneOff className="size-4.5" /> {t("end_session")}
                </button>
              )}
            </div>
          </div>

          {/* Right Side: Technical Coding Sandbox Redesigned as Premium IDE */}
          {codingProblem && showSandbox && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="lg:col-span-6 flex flex-col gap-3.5 p-4.5 backdrop-blur-2xl bg-zinc-950/20 rounded-2xl border border-zinc-900 shadow-2xl w-full relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5 font-mono">
                <h3 className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase flex items-center gap-2">
                  <Code className="size-4.5 text-zinc-300" />
                  {codingProblem.language === "latex" ? "LaTeX Equation Editor" : 
                   codingProblem.language === "markdown" ? "Markdown Essay Editor" : 
                   codingProblem.language === "text" ? "Writing Sandbox" : "Coding Workspace IDE"}
                </h3>
                <span className="bg-zinc-900 border border-zinc-850 text-zinc-300 font-mono text-[9px] px-3 py-1 rounded font-bold uppercase tracking-wider shadow-inner">
                  {codingProblem.language.toUpperCase()}
                </span>
              </div>

              {/* Premium Code Editor via Monaco Editor */}
              <div className="flex flex-col gap-0 relative">
                {/* IDE Top Window Bar */}
                <div className="flex px-4 py-2.5 border border-zinc-900 rounded-t-xl text-[9px] text-zinc-500 font-semibold flex-row justify-between items-center bg-zinc-950/60 shadow-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500/40" />
                    <span className="w-2 h-2 rounded-full bg-amber-500/40" />
                    <span className="w-2 h-2 rounded-full bg-zinc-300/40" />
                    <span className="ml-2 text-zinc-400 font-bold">
                      draft.txt
                    </span>
                  </div>
                  <span className="text-[8px] uppercase font-bold tracking-widest text-zinc-300 bg-zinc-900 px-2.5 py-0.5 rounded border border-violet-500/20 font-mono">
                    {t("ready")}
                  </span>
                </div>

                {/* Monaco Editor Container */}
                <div className="relative border border-t-0 border-zinc-900 rounded-b-xl overflow-hidden bg-zinc-955/10 shadow-[inset_0_4px_16px_rgba(0,0,0,0.4)] min-h-[650px]">
                  <MonacoSandbox
                    language={codingProblem.language}
                    value={code}
                    onChange={(val) => handleCodeChange(val)}
                    readOnly={callStatus !== CallStatus.ACTIVE}
                  />
                </div>

                {/* Floating Socratic Advisor Alert */}
                <AnimatePresence>
                  {isCodingStuck && callStatus === CallStatus.ACTIVE && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-4 left-4 right-4 bg-zinc-950 border border-violet-500/20 text-zinc-300 rounded-xl p-3 flex gap-3 items-center justify-between shadow-2xl backdrop-blur-xl z-20"
                    >
                      <div className="flex gap-2.5 items-center">
                        <div className="p-1.5 bg-zinc-900 rounded-lg border border-violet-500/20 animate-pulse">
                          <Lightbulb className="size-4 text-zinc-300" />
                        </div>
                        <span className="font-semibold text-zinc-300">
                          {codingProblem.language === "text" || codingProblem.language === "markdown" 
                            ? t("need_hint") 
                            : t("need_hint")}
                        </span>
                      </div>
                      <Button
                        onClick={requestSocraticHint}
                        className="h-8 text-[9px] font-bold uppercase tracking-wider px-3.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 border border-violet-500/30 cursor-pointer shadow-lg active:scale-95"
                      >
                        {t("get_hint")}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sandbox Controls Row */}
              {callStatus === CallStatus.ACTIVE && (
                <div className="flex justify-end gap-3 mt-2">
                  <Button
                    variant="outline"
                    onClick={requestSocraticHint}
                    className="text-[9px] font-bold uppercase tracking-widest px-4 py-2 h-9 border border-zinc-900 text-zinc-500 hover:bg-zinc-900 hover:text-white hover:border-violet-500/30 transition-all rounded-lg cursor-pointer"
                  >
                    <Sparkles className="size-3.5 text-zinc-300" /> {t("req_hint")}
                  </Button>

                  <Button
                    onClick={checkSolutionAndProceed}
                    className="text-[9px] font-bold uppercase tracking-widest px-4 py-2 h-9 bg-violet-600 text-white hover:bg-violet-500 border border-violet-500/30 transition-all rounded-lg cursor-pointer shadow-lg active:scale-95 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="size-3.5 text-white" /> Check Code & Proceed
                  </Button>
                </div>
              )}
            </motion.div>
          )}

        </div>
    </div>
  );
};

export default Agent;
