"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, Globe, Briefcase, FileUp, Loader2, 
  Check, ArrowRight, ShieldAlert, Award, RefreshCw,
  FileText, Activity, CheckCircle, AlertTriangle, HelpCircle,
  Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveOnboardingData } from "@/lib/actions/onboarding.action";
import { getResumeById } from "@/lib/actions/resume.action";
import { updateUserTier } from "@/lib/actions/auth.action";
import { openPaddleCheckout } from "@/lib/paddle";
import PDFRenderer from "@/components/resume/PDFRenderer";

// Interactive Legible Resume Preview Component
const ResumePreview = ({ data, title }: { data: any; title: string }) => {
  if (!data) return null;
  const basics = data.basics || {};
  const skills = data.skills || [];
  const work = data.work || [];
  const education = data.education || [];

  return (
    <div className="mt-4 p-5 bg-zinc-950/80 border border-zinc-900 rounded-2xl flex flex-col gap-4 text-left animate-fadeIn">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <FileText className="size-4 text-white" /> {title}
        </h4>
        {basics.email && (
          <span className="text-xs font-mono text-zinc-400">{basics.email}</span>
        )}
      </div>
      
      {/* Basics Info */}
      <div className="flex flex-col gap-1">
        <span className="text-base font-bold text-white">{basics.name || "Candidate Name"}</span>
        <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">{basics.label || "Professional"}</span>
        {basics.summary && (
          <p className="text-xs text-zinc-400 leading-relaxed mt-2 bg-white/[0.02] p-3 rounded-xl border border-white/5 font-medium italic">
            "{basics.summary}"
          </p>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Extracted Skills</span>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill: any, idx: number) => {
              const name = typeof skill === 'string' ? skill : skill.name || "";
              return name ? (
                <span key={idx} className="text-xs font-mono px-2.5 py-1 bg-zinc-900 border border-white/10 text-zinc-200 rounded">
                  {name}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Work Experience */}
      {work.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider border-t border-zinc-900/50 pt-3">Work History</span>
          <div className="flex flex-col gap-4">
            {work.slice(0, 3).map((job: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between items-start flex-wrap gap-1.5">
                  <span className="font-bold text-zinc-100">{job.position} at {job.company}</span>
                  <span className="text-xs font-mono text-zinc-400">{job.startDate} — {job.endDate || "Present"}</span>
                </div>
                <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-1 mt-1">
                  {(job.highlights || []).slice(0, 3).map((h: string, hIdx: number) => (
                    <li key={hIdx} className="leading-relaxed font-medium">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface OnboardingWizardClientProps {
  userId: string;
  userName: string;
  userTier?: string;
}

export default function OnboardingWizardClient({ userId, userName, userTier = "freemium" }: OnboardingWizardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramResumeId = searchParams.get("resumeId");
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  const [isFreemiumLoading, setIsFreemiumLoading] = useState(false);
  const [isPremiumLoading, setIsPremiumLoading] = useState(false);

  const handleSelectFreemium = async () => {
    setIsFreemiumLoading(true);
    try {
      const res = await updateUserTier(userId, "freemium");
      if (res.success) {
        setStep(6);
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 2000);
      } else {
        setError("Failed to select plan. Please try again.");
      }
    } catch (e: any) {
      console.error(e);
      setError("An error occurred selecting plan.");
    } finally {
      setIsFreemiumLoading(false);
    }
  };

  const handlePay = async () => {
    setIsPremiumLoading(true);
    try {
      const res = await fetch("/api/payment/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tier: "premium",
        }),
      });

      const data = await res.json();
      if (data.transactionId) {
        const opened = await openPaddleCheckout(data.transactionId);
        if (!opened && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          setIsPremiumLoading(false);
        }
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError(data.error || "Failed to initialize checkout.");
        setIsPremiumLoading(false);
      }
    } catch (e: any) {
      console.error(e);
      setError("Could not reach payment gateway.");
      setIsPremiumLoading(false);
    }
  };
  const [country, setCountry] = useState("");
  const [role, setRole] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFileUrl(null);
    }
  }, [file]);

  useEffect(() => {
    if (paramResumeId) {
      const loadBuiltResume = async () => {
        try {
          setIsProcessing(true);
          setStatusText("Loading built resume...");
          const resume = await getResumeById(userId, paramResumeId);
          if (resume && resume.parsedData) {
            setParsedData(resume.parsedData);
            setFileName(resume.fileName || "Built_Resume.pdf");
            if (resume.parsedData.basics?.label) {
              setRole(resume.parsedData.basics.label);
            }
            const basics = resume.parsedData.basics as any;
            if (basics?.country) {
              setCountry(basics.country);
            }
            setStep(3);
          }
        } catch (err: any) {
          console.error("Error loading built resume:", err);
        } finally {
          setIsProcessing(false);
        }
      };
      loadBuiltResume();
    }
  }, [paramResumeId, userId]);
  
  // States for API interactions
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Parsed and Optimized Resume Details
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [parsedData, setParsedData] = useState<any>(null);
  const [atsAnalysis, setAtsAnalysis] = useState<any>(null);
  const [fixedParsedData, setFixedParsedData] = useState<any>(null);
  const [fixedAtsAnalysis, setFixedAtsAnalysis] = useState<any>(null);
  const [summary, setSummary] = useState("");

  // Helper functions to allow real-time editing of all extracted resume fields
  const updateBasics = (field: string, value: string) => {
    setParsedData((prev: any) => ({
      ...prev,
      basics: {
        ...(prev?.basics || {}),
        [field]: value,
      },
    }));
  };

  const updateSkill = (index: number, value: string) => {
    setParsedData((prev: any) => {
      const currentSkills = [...(prev?.skills || [])];
      if (typeof currentSkills[index] === "object" && currentSkills[index] !== null) {
        currentSkills[index] = { ...currentSkills[index], name: value };
      } else {
        currentSkills[index] = value;
      }
      return { ...prev, skills: currentSkills };
    });
  };

  const removeSkill = (index: number) => {
    setParsedData((prev: any) => {
      const currentSkills = [...(prev?.skills || [])];
      currentSkills.splice(index, 1);
      return { ...prev, skills: currentSkills };
    });
  };

  const addSkill = () => {
    setParsedData((prev: any) => ({
      ...prev,
      skills: [...(prev?.skills || []), "New Skill"],
    }));
  };

  const updateWork = (workIdx: number, field: string, value: any) => {
    setParsedData((prev: any) => {
      const currentWork = [...(prev?.work || [])];
      currentWork[workIdx] = {
        ...(currentWork[workIdx] || {}),
        [field]: value,
      };
      return { ...prev, work: currentWork };
    });
  };

  const updateWorkHighlight = (workIdx: number, hIdx: number, value: string) => {
    setParsedData((prev: any) => {
      const currentWork = [...(prev?.work || [])];
      const highlights = [...(currentWork[workIdx]?.highlights || [])];
      highlights[hIdx] = value;
      currentWork[workIdx] = { ...currentWork[workIdx], highlights };
      return { ...prev, work: currentWork };
    });
  };

  const removeWorkHighlight = (workIdx: number, hIdx: number) => {
    setParsedData((prev: any) => {
      const currentWork = [...(prev?.work || [])];
      const highlights = [...(currentWork[workIdx]?.highlights || [])];
      highlights.splice(hIdx, 1);
      currentWork[workIdx] = { ...currentWork[workIdx], highlights };
      return { ...prev, work: currentWork };
    });
  };

  const addWorkHighlight = (workIdx: number) => {
    setParsedData((prev: any) => {
      const currentWork = [...(prev?.work || [])];
      const highlights = [...(currentWork[workIdx]?.highlights || []), "Key achievement or responsibility..."];
      currentWork[workIdx] = { ...currentWork[workIdx], highlights };
      return { ...prev, work: currentWork };
    });
  };

  const removeWork = (workIdx: number) => {
    setParsedData((prev: any) => {
      const currentWork = [...(prev?.work || [])];
      currentWork.splice(workIdx, 1);
      return { ...prev, work: currentWork };
    });
  };

  const addWork = () => {
    setParsedData((prev: any) => ({
      ...prev,
      work: [
        ...(prev?.work || []),
        {
          company: "Company Name",
          position: "Job Title",
          startDate: "2022",
          endDate: "Present",
          highlights: ["Key achievement or responsibility..."],
        },
      ],
    }));
  };

  const updateEducation = (eduIdx: number, field: string, value: string) => {
    setParsedData((prev: any) => {
      const currentEdu = [...(prev?.education || [])];
      currentEdu[eduIdx] = {
        ...(currentEdu[eduIdx] || {}),
        [field]: value,
      };
      return { ...prev, education: currentEdu };
    });
  };

  const removeEducation = (eduIdx: number) => {
    setParsedData((prev: any) => {
      const currentEdu = [...(prev?.education || [])];
      currentEdu.splice(eduIdx, 1);
      return { ...prev, education: currentEdu };
    });
  };

  const addEducation = () => {
    setParsedData((prev: any) => ({
      ...prev,
      education: [
        ...(prev?.education || []),
        {
          institution: "University / Institution",
          studyType: "Bachelor's",
          area: "Computer Science",
          startDate: "2018",
          endDate: "2022",
        },
      ],
    }));
  };

  // Load custom handwritten font
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024 // 5MB
  });

  const getJobDescription = (targetRole: string) => {
    const roleLower = targetRole.toLowerCase();
    if (roleLower.includes("frontend") || roleLower.includes("react")) {
      return "Looking for a Frontend Developer with expertise in React, Next.js, HTML5, CSS3, Tailwind CSS, and TypeScript. Responsible for building responsive user interfaces, optimizing page loading performance, collaborating with designers, and ensuring semantic HTML and accessibility best practices.";
    }
    if (roleLower.includes("backend") || roleLower.includes("node")) {
      return "Looking for a Backend Developer with expertise in Node.js, Express, databases (SQL, NoSQL, Firestore), and system architecture. Responsible for creating high-performance APIs, database optimization, backend security, server management, and cloud integrations.";
    }
    if (roleLower.includes("software engineer") || roleLower.includes("developer")) {
      return "Looking for a Software Engineer proficient in JavaScript, React, Node.js, and TypeScript. Responsible for building scalable web applications, designing RESTful APIs, participating in code reviews, and collaborating with cross-functional teams. Experience with cloud databases, automated testing, and CI/CD pipelines is highly preferred.";
    }
    if (roleLower.includes("data scientist") || roleLower.includes("machine learning")) {
      return "Looking for a Data Scientist with expertise in Python, machine learning models, SQL, data analysis, and visualization. Responsible for parsing large data sets, building predictive algorithms, and presenting insights to stakeholders.";
    }
    if (roleLower.includes("product manager") || roleLower.includes("pm")) {
      return "Looking for a Product Manager with strong product strategy, user research, agile product development, roadmap planning, and cross-functional leadership skills. Responsible for defining product vision, analyzing product metrics, and collaborating with design and engineering teams.";
    }
    return `Looking for a skilled ${targetRole} to join our growing team. The ideal candidate will have strong expertise in the relevant field, experience with industry-standard tools, excellent problem-solving capabilities, and strong communication skills.`;
  };

  const handleUploadAndParse = async () => {
    if (!file) {
      setError("Please select a PDF resume file to continue.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    setStatusText("EXTRACTING RESUME TEXT & PARSING...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to process resume upload.");
      }

      const data = await res.json();
      setRawText(data.rawText);
      setParsedData(data.parsedData);
      setFileName(data.fileName);

      // Prepopulate role and country from parsing details
      const detectedLabel = data.parsedData?.basics?.label;
      const lowerRaw = (data.rawText || "").toLowerCase();
      const lowerFile = (data.fileName || "").toLowerCase();

      if (detectedLabel && detectedLabel !== "Software Developer") {
        setRole(detectedLabel);
      } else if (lowerRaw.includes("intern") || lowerFile.includes("intern")) {
        setRole("Software Development Intern");
      } else if (detectedLabel) {
        setRole(detectedLabel);
      } else {
        setRole("Software Engineer");
      }

      const basics = data.parsedData?.basics as any;
      if (basics?.country) {
        setCountry(basics.country);
      }

      setIsProcessing(false);
      // Proceed to review details (Step 3)
      setStep(3);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during upload.");
      setIsProcessing(false);
    }
  };

  const handleEvaluateAts = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusText("CALCULATING ATS COMPATIBILITY...");

    try {
      const jd = getJobDescription(role);
      const res = await fetch("/api/resume/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedData, rawText, jobDescription: jd }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to calculate ATS score.");
      }

      const data = await res.json();
      setAtsAnalysis(data);
      setIsProcessing(false);
      setStep(4);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during evaluation.");
      setIsProcessing(false);
    }
  };

  const handleOptimizeResume = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusText("AUTO-OPTIMIZING RESUME WITH AI...");

    try {
      const jd = getJobDescription(role);
      const res = await fetch("/api/resume/autofix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedData, jobDescription: jd }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to optimize resume.");
      }

      const data = await res.json();
      setFixedParsedData(data.optimizedData);

      setStatusText("RE-EVALUATING IMPROVED ATS SCORE...");
      const scoreRes = await fetch("/api/resume/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedData: data.optimizedData, jobDescription: jd }),
      });

      if (!scoreRes.ok) {
        const errorData = await scoreRes.json();
        throw new Error(errorData.error || "Failed to re-evaluate ATS score.");
      }

      const scoreData = await scoreRes.json();
      setFixedAtsAnalysis(scoreData);

      // Generate a short professional profile summary dynamically
      const changesText = `Successfully optimized resume for target role of '${role}'. Aligned key highlights under the STAR framework and integrated missing keywords: ${scoreData.missingKeywords.slice(0, 4).join(", ") || "N/A"}.`;
      setSummary(changesText);

      setStep(5);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during optimization.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusText("PERSISTING PROFILE TO DATABASE...");

    try {
      const res = await saveOnboardingData({
        userId,
        country,
        role,
        rawText,
        parsedData,
        atsAnalysis,
        fixedParsedData: fixedParsedData || parsedData,
        summary
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to save onboarding data.");
      }

      if (userTier === "premium" || userTier === "pro") {
        setStep(6);
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 2000);
      } else {
        setIsProcessing(false);
        setStep(5);
      }
    } catch (err: any) {
      setError(err.message || "Final save failed.");
      setIsProcessing(false);
    }
  };

  // Determine Graded Stamp letter based on score
  const getGradeStamp = (score: number) => {
    if (score >= 90) return { l: "A+", c: "text-emerald-500 border-emerald-500" };
    if (score >= 80) return { l: "B", c: "text-blue-500 border-blue-500" };
    if (score >= 65) return { l: "C-", c: "text-amber-500 border-amber-500" };
    if (score >= 50) return { l: "D", c: "text-orange-500 border-orange-500" };
    return { l: "F", c: "text-red-500 border-red-500" };
  };

  return (
    <div className="w-full max-w-5xl relative z-10 font-mona-sans px-2">
      <div className="backdrop-blur-2xl bg-zinc-950/45 border border-white/10 rounded-3xl p-6 sm:p-10 shadow-[0_0_50px_rgba(0,0,0,0.85)] relative overflow-hidden flex flex-col gap-6">
        
        {/* Glowing aura */}
        <div className="absolute -top-40 -right-40 size-80 bg-white/[0.02] blur-[80px] rounded-full pointer-events-none" />

        {/* Step tracker dot indicator */}
        <div className="flex justify-between items-center w-full mb-2 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-white rounded-lg blur opacity-15" />
              <div className="relative bg-white/5 p-1.5 rounded-lg border border-white/10">
                <img
                  src="/logo.svg"
                  alt="Mockrithm Logo"
                  className="w-5.5 h-5.5"
                />
              </div>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-black text-white font-mono tracking-tight">MOCKRITHM</span>
              <span className="text-[10px] font-mono tracking-wider text-zinc-400 uppercase">
                Career Calibration
              </span>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[2, 3, 4, 5].map((s) => {
              if (s === 5 && (userTier === "premium" || userTier === "pro")) return null;
              return (
                <span 
                  key={s} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step === s 
                      ? "w-6 bg-white" 
                      : step > s 
                      ? "w-2 bg-zinc-400" 
                      : "w-2 bg-zinc-800"
                  }`} 
                />
              );
            })}
          </div>
        </div>

        {error && (
          <div className="bg-rose-950/20 border border-rose-500/30 text-rose-350 rounded-xl p-4 text-xs font-mono flex items-start gap-2.5 shadow-lg">
            <ShieldAlert className="size-5 shrink-0 mt-0.5 text-rose-455" />
            <span>{error}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Welcome Screen */}
          {step === 1 && (
            <motion.div 
              key="step-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6 max-w-xl mx-auto"
            >
              <div className="flex flex-col gap-2 text-center sm:text-left">
                <h1 className="text-3xl font-black tracking-tight text-white font-mono leading-tight">
                  Welcome to Mockrithm, {userName}!
                </h1>
                <p className="text-base text-zinc-200 leading-relaxed font-semibold">
                  Let&apos;s build your professional career engine. We will parse your resume, assess your ATS score, and configure our AI to give you the ultimate personalized preparation experience.
                </p>
              </div>

              <div className="h-[1px] bg-zinc-900 w-full my-1" />

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-white shrink-0">
                    <Sparkles className="size-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Practice that fits you</h4>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">Every interview adapts to your specific resume, background, and career goals.</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-white shrink-0">
                    <RefreshCw className="size-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Track your progress</h4>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">We analyze your mock interviews to update your details and show your improvement over time.</p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => setStep(2)}
                className="w-full mt-4 h-12 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Get Started
              </Button>
            </motion.div>
          )}

          {/* Resume Upload Screen (Step 2) */}
          {step === 2 && (
            <motion.div 
              key="step-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6 max-w-xl mx-auto w-full"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight text-white">Import Your Resume</h2>
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-mono">STEP 02 OF 05</p>
              </div>

              <p className="text-sm text-zinc-200 leading-relaxed font-semibold">
                Upload your resume in PDF format. We will extract all text, structures, skills, and work highlights instantly.
              </p>

              <div 
                {...getRootProps()} 
                className={`border border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-zinc-950/50 ${
                  isDragActive ? "border-white bg-white/5" : "border-zinc-850 hover:border-white/20 hover:bg-zinc-900/50"
                }`}
              >
                <input {...getInputProps()} />
                <FileUp className="size-10 mb-4 text-zinc-400" />
                
                {file ? (
                  <div className="flex flex-col gap-4 items-center w-full max-w-sm">
                    <div className="flex flex-col gap-1.5 items-center">
                      <span className="text-sm font-bold text-white max-w-[280px] truncate">{file.name}</span>
                      <span className="text-xs font-mono text-zinc-350">{(file.size / 1024 / 1024).toFixed(2)} MB • READY</span>
                    </div>
                    <div className="flex gap-2.5 mt-2 w-full justify-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="px-4 py-2 bg-red-950/40 border border-red-500/30 hover:bg-red-900/40 text-red-200 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer"
                      >
                        Delete File
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/user/dashboard/resume/templates?from=onboarding");
                        }}
                        className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer"
                      >
                        Build a Resume
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 items-center">
                    <span className="text-sm font-bold text-zinc-200">Drag & drop your resume PDF here</span>
                    <span className="text-xs font-mono text-zinc-400">or click to browse local files (Max 5MB)</span>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/user/dashboard/resume/templates?from=onboarding");
                        }}
                        className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Sparkles className="size-3.5 text-white animate-pulse" /> Create with Resume Builder
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <Button 
                  onClick={() => setStep(1)}
                  variant="outline"
                  className="flex-1 h-12 rounded-xl border border-zinc-850 hover:bg-zinc-900 text-xs font-bold uppercase tracking-wider text-zinc-200 cursor-pointer"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleUploadAndParse}
                  disabled={!file || isProcessing}
                  className="flex-1 h-12 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="size-4 animate-spin" /> Processing...
                    </span>
                  ) : (
                    "Upload and Parse"
                  )}
                </Button>
              </div>

              {isProcessing && (
                <div className="text-center font-mono text-xs text-zinc-400 uppercase tracking-widest mt-2 animate-pulse">
                  // {statusText}
                </div>
              )}
            </motion.div>
          )}

          {/* Review Parsed Details Screen (Step 3) */}
          {step === 3 && parsedData && (
            <motion.div 
              key="step-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">Review Extracted Details</h2>
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-mono">STEP 03 OF 05</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                  {/* Left Side: Interactive Resume Editor */}
                  <div className="lg:col-span-6 flex flex-col gap-5 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    
                    {/* Header Box */}
                    <div className="p-4 bg-white/[0.015] border border-white/5 rounded-2xl flex flex-col gap-3">
                      <span className="text-xs font-bold uppercase text-white tracking-wider font-mono flex items-center gap-1.5">
                        <Sparkles className="size-4 text-white" /> Profile Calibration
                      </span>
                      <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                        We auto-detected these details from your resume. You can edit any field, skill, work experience, or summary below before calculating your ATS score.
                      </p>

                      <div className="flex flex-col gap-2 mt-1">
                        <label className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                          <Briefcase className="size-4 text-white" /> Target Job Role
                        </label>
                        <input
                          type="text"
                          value={role}
                          onChange={(e) => {
                            setRole(e.target.value);
                            updateBasics("label", e.target.value);
                          }}
                          placeholder="e.g. Software Engineer"
                          className="bg-zinc-950 text-white text-xs rounded-xl p-3 border border-zinc-900 focus:border-zinc-700 outline-none leading-relaxed font-semibold transition-all"
                        />
                      </div>
                    </div>

                    {/* Section 1: Basic Information */}
                    <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-3">
                      <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center justify-between">
                        <span>Personal Information</span>
                        <span className="text-[10px] text-zinc-500 font-normal">Editable</span>
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-mono uppercase text-zinc-400">Full Name</label>
                          <input
                            type="text"
                            value={parsedData.basics?.name || ""}
                            onChange={(e) => updateBasics("name", e.target.value)}
                            placeholder="Full Name"
                            className="bg-zinc-900 text-white text-xs rounded-lg p-2.5 border border-zinc-800 focus:border-zinc-600 outline-none font-semibold"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-mono uppercase text-zinc-400">Email Address</label>
                          <input
                            type="text"
                            value={parsedData.basics?.email || ""}
                            onChange={(e) => updateBasics("email", e.target.value)}
                            placeholder="Email"
                            className="bg-zinc-900 text-white text-xs rounded-lg p-2.5 border border-zinc-800 focus:border-zinc-600 outline-none font-semibold"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase text-zinc-400">Professional Summary</label>
                        <textarea
                          rows={3}
                          value={parsedData.basics?.summary || ""}
                          onChange={(e) => updateBasics("summary", e.target.value)}
                          placeholder="Short summary of your background..."
                          className="bg-zinc-900 text-white text-xs rounded-lg p-2.5 border border-zinc-800 focus:border-zinc-600 outline-none font-semibold leading-relaxed resize-y"
                        />
                      </div>
                    </div>

                    {/* Section 2: Skills Editor */}
                    <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                          Skills & Competencies ({parsedData.skills?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={addSkill}
                          className="text-[10px] font-mono px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md transition-all cursor-pointer"
                        >
                          + Add Skill
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-1">
                        {(parsedData.skills || []).map((skillItem: any, idx: number) => {
                          const val = typeof skillItem === "string" ? skillItem : skillItem?.name || "";
                          return (
                            <div key={idx} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg hover:border-zinc-700 transition-all">
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => updateSkill(idx, e.target.value)}
                                className="bg-transparent text-white text-xs font-mono outline-none border-none w-28 focus:w-36 transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => removeSkill(idx)}
                                className="text-zinc-500 hover:text-rose-400 text-xs font-bold shrink-0 cursor-pointer ml-1"
                                title="Remove skill"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section 3: Work History Editor */}
                    <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                          Work Experience ({parsedData.work?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={addWork}
                          className="text-[10px] font-mono px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md transition-all cursor-pointer"
                        >
                          + Add Experience
                        </button>
                      </div>

                      <div className="flex flex-col gap-4">
                        {(parsedData.work || []).map((w: any, workIdx: number) => (
                          <div key={workIdx} className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono uppercase text-zinc-400">Position #{workIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeWork(workIdx)}
                                className="text-zinc-500 hover:text-rose-400 text-xs font-bold cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={w.position || ""}
                                onChange={(e) => updateWork(workIdx, "position", e.target.value)}
                                placeholder="Job Position"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                              <input
                                type="text"
                                value={w.company || ""}
                                onChange={(e) => updateWork(workIdx, "company", e.target.value)}
                                placeholder="Company Name"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={w.startDate || ""}
                                onChange={(e) => updateWork(workIdx, "startDate", e.target.value)}
                                placeholder="Start Date"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                              <input
                                type="text"
                                value={w.endDate || ""}
                                onChange={(e) => updateWork(workIdx, "endDate", e.target.value)}
                                placeholder="End Date"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                            </div>

                            {/* Highlights */}
                            <div className="flex flex-col gap-2 mt-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono uppercase text-zinc-400">Key Highlights</span>
                                <button
                                  type="button"
                                  onClick={() => addWorkHighlight(workIdx)}
                                  className="text-[9px] font-mono text-zinc-300 hover:text-white underline cursor-pointer"
                                >
                                  + Add Bullet
                                </button>
                              </div>
                              {(w.highlights || []).map((h: string, hIdx: number) => (
                                <div key={hIdx} className="flex items-center gap-2">
                                  <textarea
                                    rows={2}
                                    value={h}
                                    onChange={(e) => updateWorkHighlight(workIdx, hIdx, e.target.value)}
                                    className="bg-zinc-950 text-zinc-200 text-xs rounded-lg p-2 border border-zinc-800 outline-none font-medium flex-1 resize-y"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeWorkHighlight(workIdx, hIdx)}
                                    className="text-zinc-500 hover:text-rose-400 text-xs font-bold shrink-0 cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section 4: Education Editor */}
                    <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                          Education ({parsedData.education?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={addEducation}
                          className="text-[10px] font-mono px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md transition-all cursor-pointer"
                        >
                          + Add Education
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        {(parsedData.education || []).map((edu: any, eduIdx: number) => (
                          <div key={eduIdx} className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono uppercase text-zinc-400">Education #{eduIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeEducation(eduIdx)}
                                className="text-zinc-500 hover:text-rose-400 text-xs font-bold cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={edu.institution || ""}
                                onChange={(e) => updateEducation(eduIdx, "institution", e.target.value)}
                                placeholder="Institution Name"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                              <input
                                type="text"
                                value={edu.studyType || edu.degree || ""}
                                onChange={(e) => updateEducation(eduIdx, "studyType", e.target.value)}
                                placeholder="Degree (e.g. Bachelor's)"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={edu.area || ""}
                                onChange={(e) => updateEducation(eduIdx, "area", e.target.value)}
                                placeholder="Field / Major"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                              <input
                                type="text"
                                value={edu.endDate || ""}
                                onChange={(e) => updateEducation(eduIdx, "endDate", e.target.value)}
                                placeholder="Graduation Year"
                                className="bg-zinc-950 text-white text-xs rounded-lg p-2 border border-zinc-800 outline-none font-semibold"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                {/* Right Side: Detailed visual preview */}
                <div className="lg:col-span-6 flex flex-col gap-4">
                  <ResumePreview data={parsedData} title="Structured Resume Preview" />
                </div>
              </div>

              <div className="flex gap-4 border-t border-white/5 pt-4">
                <Button 
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="flex-1 h-12 rounded-xl border border-zinc-850 hover:bg-zinc-900 text-xs font-bold uppercase tracking-wider text-zinc-200 cursor-pointer"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleEvaluateAts}
                  disabled={isProcessing}
                  className="flex-1 h-12 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="size-4 animate-spin" /> Scoring...
                    </span>
                  ) : (
                    "Evaluate ATS Match"
                  )}
                </Button>
              </div>

              {isProcessing && (
                <div className="text-center font-mono text-xs text-zinc-400 uppercase tracking-widest mt-1 animate-pulse">
                  // {statusText}
                </div>
              )}
            </motion.div>
          )}

          {/* ATS Diagnostics (Step 4: Graded/Marked Paper View) */}
          {step === 4 && atsAnalysis && (
            <motion.div 
              key="step-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">ATS Diagnostics & Feedback</h2>
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-mono">STEP 04 OF 04</p>
              </div>

              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="size-10 animate-spin text-white" />
                  <span className="font-mono text-xs tracking-widest text-zinc-300">{statusText}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  {/* Left Side: Score card & Feedback notes */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    
                    {/* Graded Circle Stamp */}
                    <div className="p-6 bg-rose-950/10 border border-rose-500/20 rounded-2xl flex flex-col items-center gap-4 text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-1 bg-red-500/10 text-red-400 text-[10px] font-mono uppercase tracking-wider border-b border-l border-red-500/20 rounded-bl-lg">
                        Analysis Phase
                      </div>
                      
                      <span className="text-xs font-mono uppercase tracking-wider text-rose-350">ATS Compliance Grade</span>
                      
                      <div className={`size-28 rounded-full border-4 flex items-center justify-center font-bold text-4xl rotate-[-8deg] shadow-lg font-mono ${getGradeStamp(atsAnalysis.atsScore).c} bg-zinc-950/60`}>
                        {getGradeStamp(atsAnalysis.atsScore).l}
                      </div>

                      <div className="flex flex-col gap-1 mt-1">
                        <span className="text-2xl font-black text-white font-mono">{atsAnalysis.atsScore}% Score</span>
                        <p className="text-xs text-zinc-300 font-semibold leading-relaxed max-w-xs mt-1">
                          Review feedback tags to align your resume with target role: <span className="font-bold text-white">#{role}</span>.
                        </p>
                      </div>
                    </div>

                    {/* Detailed ATS Checklist & Advice */}
                    <div className="flex flex-col gap-4 p-5 bg-zinc-950/60 border border-zinc-900 rounded-2xl overflow-y-auto max-h-[380px]">
                      {/* Strengths */}
                      {atsAnalysis.strengths && atsAnalysis.strengths.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle className="size-3.5 text-emerald-400" /> Strengths
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-xs text-zinc-300 pl-1 font-semibold leading-relaxed">
                            {atsAnalysis.strengths.map((str: string, i: number) => (
                              <li key={i}>{str}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Gaps / Critical Warnings */}
                      {atsAnalysis.weaknesses && atsAnalysis.weaknesses.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                          <span className="text-[10px] font-mono font-bold text-rose-405 uppercase tracking-wider flex items-center gap-1.5">
                            <AlertTriangle className="size-3.5 text-rose-450" /> Critical Gaps
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-xs text-zinc-300 pl-1 font-semibold leading-relaxed">
                            {atsAnalysis.weaknesses.map((weak: string, i: number) => (
                              <li key={i}>{weak}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Actionable Suggestions */}
                      {atsAnalysis.improvementSuggestions && atsAnalysis.improvementSuggestions.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                          <span className="text-[10px] font-mono font-bold text-amber-405 uppercase tracking-wider flex items-center gap-1.5">
                            <HelpCircle className="size-3.5 text-amber-450" /> Recommendations
                          </span>
                          <ul className="list-disc list-inside space-y-1 text-xs text-zinc-300 pl-1 font-semibold leading-relaxed">
                            {atsAnalysis.improvementSuggestions.map((sug: string, i: number) => (
                              <li key={i}>{sug}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Structured Resume Preview (100% width, no gray background) */}
                  <div className="lg:col-span-7 flex flex-col gap-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                      Resume Document Preview
                    </span>
                    <PDFRenderer data={parsedData} mode="normal" />
                  </div>

                  {/* Full-Width Bottom Action Bar (Spans 100% of wizard width) */}
                  <div className="col-span-1 lg:col-span-12 flex gap-4 w-full pt-4 border-t border-white/10 mt-2">
                    <Button 
                      onClick={() => setStep(3)}
                      variant="outline"
                      className="w-32 sm:w-40 h-12 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-xs font-bold uppercase tracking-wider text-zinc-200 cursor-pointer"
                    >
                      Back
                    </Button>
                    <Button 
                      onClick={handleCompleteOnboarding}
                      disabled={isProcessing}
                      className="flex-1 h-12 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xl"
                    >
                      {isProcessing ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <Loader2 className="size-4 animate-spin" /> Saving Profile...
                        </span>
                      ) : (
                        "Complete Onboarding"
                      )}
                    </Button>
                  </div>

                </div>
              )}
            </motion.div>
          )}

          {/* Plan Selection Screen (Step 5) */}
          {step === 5 && (
            <motion.div 
              key="step-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6 max-w-2xl mx-auto w-full"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight text-white">Select Your Plan Tier</h2>
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-mono">STEP 04 OF 04</p>
              </div>

              <p className="text-sm text-zinc-200 leading-relaxed font-semibold">
                Choose the calibration plan that fits your preparation goals. You can change your selection anytime.
              </p>

              <div className="grid md:grid-cols-2 gap-6 mt-2">
                {/* Freemium Card */}
                <div className="border border-zinc-900 bg-zinc-950/45 rounded-2xl p-6 flex flex-col justify-between hover:border-zinc-800 transition-all">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase bg-zinc-900 px-2.5 py-1 rounded-full">
                        Free Access
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-200">Freemium</h3>
                    <p className="text-zinc-400 text-xs mt-2 leading-relaxed">
                      Basic trial with standard features and restricted credits.
                    </p>
                    <ul className="space-y-2.5 mt-5 text-[11px] text-zinc-400">
                      <li className="flex items-center gap-2">
                        <Check className="size-3.5 text-zinc-600 shrink-0" />
                        <span>Standard AI Voice Engine</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-3.5 text-zinc-600 shrink-0" />
                        <span>5 Mock Interview Practices</span>
                      </li>
                    </ul>
                  </div>
                  <Button
                    onClick={handleSelectFreemium}
                    disabled={isFreemiumLoading || isPremiumLoading}
                    className="mt-6 w-full py-2.5 rounded-lg border border-zinc-850 hover:bg-zinc-900 hover:text-white text-zinc-300 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    {isFreemiumLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Continue Freemium"}
                  </Button>
                </div>

                {/* Premium Card */}
                <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 flex flex-col justify-between hover:border-white/20 transition-all relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/[0.02] to-white/[0.08] pointer-events-none" />

                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-bold tracking-widest text-black uppercase bg-white px-2.5 py-1 rounded-full flex items-center gap-1">
                        <Crown className="size-3 fill-black text-black" /> Premium
                      </span>
                      <span className="text-[11px] font-bold text-white">$14.99 USD</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">Premium Tier</h3>
                    <p className="text-zinc-400 text-xs mt-2 leading-relaxed">
                      Complete, high-volume prep engine with smart telemetry and parsing.
                    </p>
                    <ul className="space-y-2.5 mt-5 text-[11px] text-white">
                      <li className="flex items-center gap-2">
                        <Check className="size-3.5 text-white shrink-0" />
                        <span>70 AI Voice Interviews / month</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-3.5 text-white shrink-0" />
                        <span>Full Real-Time HTML Preview</span>
                      </li>
                    </ul>
                  </div>
                  <Button
                    onClick={handlePay}
                    disabled={isFreemiumLoading || isPremiumLoading}
                    className="mt-6 w-full py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    {isPremiumLoading ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Initializing...
                      </>
                    ) : (
                      <>
                        Upgrade to Premium <ArrowRight className="size-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-4 mt-2">
                <Button 
                  onClick={() => setStep(4)}
                  variant="outline"
                  className="w-full h-12 rounded-xl border border-zinc-850 hover:bg-zinc-900 text-xs font-bold uppercase tracking-wider text-zinc-200 cursor-pointer"
                >
                  Back
                </Button>
              </div>
            </motion.div>
          )}

          {/* Success Screen (Step 6) */}
          {step === 6 && (
            <motion.div 
              key="step-6"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center py-10 gap-4 max-w-xl mx-auto"
            >
              <div className="size-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white mb-2 shadow-2xl relative">
                <div className="absolute inset-0 bg-white/5 rounded-full blur animate-ping" />
                <Check className="size-8" />
              </div>
              <h2 className="text-2xl font-black text-white font-mono">Onboarding Success!</h2>
              <p className="text-sm text-zinc-300 font-semibold max-w-sm">
                Your profile has been saved. We are preparing your interactive dashboard...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
