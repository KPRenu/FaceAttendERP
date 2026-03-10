
/**
 * Utility to verify face with retry logic and timeout handling.
 * This is especially useful for waking up remote servers (like Hugging Face Spaces).
 */
export async function verifyFaceWithRetry(
  userId: string,
  image: string,
  onStatusChange?: (status: string) => void
) {
  const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
  
  const attemptVerify = async (isRetry = false) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      if (onStatusChange) {
        onStatusChange(isRetry ? "Retrying verification..." : "Initializing AI verification...");
      }

      const response = await fetch(`${AI_SERVER_URL}/verify-face`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, image }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Verification failed");
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error("AI server connection timed out. It might be waking up.");
      }
      
      if (!isRetry) {
        if (onStatusChange) onStatusChange("Server waking up. Retrying in 5s...");
        await new Promise(r => setTimeout(r, 5000));
        return attemptVerify(true);
      }
      
      throw error;
    }
  };

  return attemptVerify();
}

/**
 * Pings the server periodically to keep it awake.
 */
export function startKeepAlivePing() {
  const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
  
  // Only ping if it's a remote URL
  if (AI_SERVER_URL.includes('localhost') || AI_SERVER_URL.includes('127.0.0.1')) {
    return () => {}; // No-op for local development
  }

  const interval = setInterval(() => {
    fetch(`${AI_SERVER_URL}/`).catch(() => {}); // Ping root or docs
  }, 5 * 60 * 1000); // 5 minutes

  return () => clearInterval(interval);
}
