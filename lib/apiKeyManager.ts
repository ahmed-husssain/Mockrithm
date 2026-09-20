interface ApiKeyInfo {
  key: string;
  remainingTokens: number;
  remainingRequests: number;
  limitTokens: number;
  limitRequests: number;
  resetTokensAt: number; // timestamp in ms
  resetRequestsAt: number; // timestamp in ms
  blockedUntil: number; // timestamp in ms
  
  // Whisper specific metrics
  remainingAudios: number;
  limitAudios: number;
  resetAudiosAt: number; // timestamp in ms
}

class ApiKeyManager {
  private keys: ApiKeyInfo[] = [];

  constructor() {
    this.loadKeys();
  }

  private loadKeys() {
    const foundKeys: string[] = [];
    
    // Scan up to 50 potential keys configured in the environment
    for (let i = 1; i <= 50; i++) {
      const name = i === 1 ? "GROQ_API_KEY" : `GROQ_API_KEY_${i}`;
      const val = process.env[name];
      if (val && val.trim()) {
        foundKeys.push(val.trim());
      }
    }

    this.keys = foundKeys.map(k => ({
      key: k,
      remainingTokens: 100000,
      remainingRequests: 1000,
      limitTokens: 100000,
      limitRequests: 1000,
      resetTokensAt: 0,
      resetRequestsAt: 0,
      blockedUntil: 0,
      remainingAudios: 100,
      limitAudios: 100,
      resetAudiosAt: 0
    }));

    console.log(`[ApiKeyManager] Initialized with ${this.keys.length} active API keys.`);
  }

  public getBestKey(): string {
    if (this.keys.length === 0) {
      this.loadKeys();
    }
    const now = Date.now();
    
    // Re-check and clear expired blocks
    let activeKeys = this.keys.filter(k => k.blockedUntil < now);

    // If all keys are currently blocked, fallback to whichever key resets first
    if (activeKeys.length === 0) {
      activeKeys = [...this.keys].sort((a, b) => a.blockedUntil - b.blockedUntil);
    }

    // Sort active keys by remaining tokens descending, then remaining requests descending
    activeKeys.sort((a, b) => {
      if (b.remainingTokens !== a.remainingTokens) {
        return b.remainingTokens - a.remainingTokens;
      }
      return b.remainingRequests - a.remainingRequests;
    });

    return activeKeys[0]?.key || "";
  }

  public blockKey(key: string, durationSec = 60) {
    const info = this.keys.find(k => k.key === key);
    if (info) {
      info.blockedUntil = Date.now() + durationSec * 1000;
      info.remainingTokens = 0;
      info.remainingRequests = 0;
      console.warn(`[ApiKeyManager] Blocked key ending in ...${key.slice(-6)} for ${durationSec}s.`);
    }
  }

  public updateLimits(key: string, headers: Headers, isAudio = false) {
    const info = this.keys.find(k => k.key === key);
    if (!info) return;

    const remainingTokens = headers.get("x-ratelimit-remaining-tokens");
    const remainingRequests = headers.get("x-ratelimit-remaining-requests");
    const limitTokens = headers.get("x-ratelimit-limit-tokens");
    const limitRequests = headers.get("x-ratelimit-limit-requests");
    const resetTokens = headers.get("x-ratelimit-reset-tokens");
    const resetRequests = headers.get("x-ratelimit-reset-requests");

    const parseResetTime = (timeStr: string | null): number => {
      if (!timeStr) return 0;
      let ms = 0;
      const secMatch = timeStr.match(/([\d.]+)\s*s/);
      const msMatch = timeStr.match(/([\d.]+)\s*ms/);
      const minMatch = timeStr.match(/([\d.]+)\s*m/);

      if (secMatch) ms += parseFloat(secMatch[1]) * 1000;
      if (msMatch) ms += parseFloat(msMatch[1]);
      if (minMatch) ms += parseFloat(minMatch[1]) * 60000;

      return ms;
    };

    if (isAudio) {
      if (remainingRequests !== null) {
        info.remainingAudios = parseInt(remainingRequests, 10);
      }
      if (limitRequests !== null) {
        info.limitAudios = parseInt(limitRequests, 10);
      }
      if (resetRequests) {
        info.resetAudiosAt = Date.now() + parseResetTime(resetRequests);
      }
    } else {
      if (remainingTokens !== null) {
        info.remainingTokens = parseInt(remainingTokens, 10);
      }
      if (remainingRequests !== null) {
        info.remainingRequests = parseInt(remainingRequests, 10);
      }
      if (limitTokens !== null) {
        info.limitTokens = parseInt(limitTokens, 10);
      }
      if (limitRequests !== null) {
        info.limitRequests = parseInt(limitRequests, 10);
      }
      if (resetTokens) {
        info.resetTokensAt = Date.now() + parseResetTime(resetTokens);
      }
      if (resetRequests) {
        info.resetRequestsAt = Date.now() + parseResetTime(resetRequests);
      }
    }
  }

  public async refreshAllLimits() {
    // Generate a valid 0.1-second silent WAV file buffer to query Whisper transcriptions limits
    const silentHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x44, 0x03, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00,
      0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61, 0x20, 0x03, 0x00, 0x00
    ]);
    const silence = Buffer.alloc(800, 128);
    const silentWav = Buffer.concat([silentHeader, silence]);

      for (const keyInfo of this.keys) {
        try {
          // 1. Refresh chat completion limits
          const chatResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${keyInfo.key}`,
            },
            body: JSON.stringify({
              model: "openai/gpt-oss-20b",
              messages: [{ role: "user", content: "Hi" }],
              max_tokens: 1
            })
          });
          
          if (chatResponse.ok) {
            this.updateLimits(keyInfo.key, chatResponse.headers, false);
          } else {
            this.blockKey(keyInfo.key, 3600); // block invalid keys for 1 hour
            continue;
          }

          // 2. Refresh Whisper audio transcription limits
          const audioFormData = new FormData();
        const blob = new Blob([silentWav], { type: "audio/wav" });
        audioFormData.append("file", blob, "silent.wav");
        audioFormData.append("model", "whisper-large-v3-turbo");
        audioFormData.append("language", "en");

        const audioResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keyInfo.key}`,
          },
          body: audioFormData
        });

        if (audioResponse.ok) {
          this.updateLimits(keyInfo.key, audioResponse.headers, true);
        }
      } catch (err) {
        console.error(`[ApiKeyManager] Failed to refresh limits for key:`, err);
      }
    }
  }

  public getKeysStatus() {
    return this.keys.map((k, index) => {
      const name = index === 0 ? "GROQ_API_KEY" : `GROQ_API_KEY_${index + 1}`;
      const masked = k.key.length > 10 ? `${k.key.slice(0, 7)}...${k.key.slice(-6)}` : k.key;
      return {
        name,
        maskedKey: masked,
        remainingTokens: k.remainingTokens,
        remainingRequests: k.remainingRequests,
        limitTokens: k.limitTokens,
        limitRequests: k.limitRequests,
        resetTokensAt: k.resetTokensAt,
        resetRequestsAt: k.resetRequestsAt,
        blockedUntil: k.blockedUntil,
        remainingAudios: k.remainingAudios,
        limitAudios: k.limitAudios,
        resetAudiosAt: k.resetAudiosAt
      };
    });
  }
}

export const apiKeyManager = new ApiKeyManager();

/**
 * Robust wrapper around fetch for Groq API that handles dynamic load-balancing,
 * parses rate-limit headers, and automatically fails over to the next best key
 * in case of a 429 Too Many Requests response or API error.
 */
export async function fetchGroq(path: string, options: RequestInit = {}): Promise<Response> {
  const maxRetries = apiKeyManager.getBestKey() ? 5 : 1;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const key = apiKeyManager.getBestKey();
    if (!key) {
      throw new Error("No active Groq API keys available.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${key}`);

    const url = path.startsWith("http") ? path : `https://api.groq.com/openai/v1${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Update remaining tokens/requests metrics from headers
      const isAudio = path.includes("/audio/") || path.includes("transcriptions");
      apiKeyManager.updateLimits(key, response.headers, isAudio);

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const blockDuration = retryAfter ? parseInt(retryAfter, 10) : 60;
        apiKeyManager.blockKey(key, blockDuration);
        console.warn(`[fetchGroq] Key ending in ...${key.slice(-6)} hit 429. Failover to next key.`);
        lastError = new Error(`Rate limit exceeded (429) for key ending in ...${key.slice(-6)}`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.clone().text();
        console.warn(`[fetchGroq] Key error (status ${response.status}): ${errText}`);
        if (response.status === 400 && errText.includes("model_terms_required")) {
          apiKeyManager.blockKey(key, 600); // Block this key for 10 minutes
          lastError = new Error(`Terms required for model for key ending in ...${key.slice(-6)}: ${errText}`);
          continue;
        }
        if (response.status >= 500) {
          apiKeyManager.blockKey(key, 15);
          lastError = new Error(`Groq Server Error (${response.status}): ${errText}`);
          continue;
        }
      }

      return response;
    } catch (err: any) {
      console.error(`[fetchGroq] Network/fetch error with key ending in ...${key.slice(-6)}:`, err);
      apiKeyManager.blockKey(key, 15);
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to execute Groq request after retrying active keys.");
}
