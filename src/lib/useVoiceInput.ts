import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export type VoiceStage = "idle" | "listening" | "parsing" | "done" | "error";

/**
 * Reusable Web Speech API hook. Returns the transcript after recognition
 * completes, plus the current stage. The caller is responsible for sending
 * the transcript to an AI edge function.
 */
export function useVoiceInput() {
  const [stage, setStage] = useState<VoiceStage>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(
    (onResult?: (text: string) => void) => {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Speech recognition isn't supported. Try Chrome or Edge.");
        setStage("error");
        setError("Browser does not support speech recognition. Use Chrome or Edge.");
        return;
      }

      // stop any in-flight recognition
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }

      setStage("listening");
      setTranscript("");
      setError("");

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          setTranscript(text);
          if (onResult) {
            onResult(text);
          } else {
            setStage("done");
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          if (event.error === "not-allowed") {
            setError("Microphone access denied. Allow it in your browser settings.");
          } else if (event.error === "no-speech") {
            setError("No speech detected. Try again and speak clearly.");
          } else if (event.error === "network") {
            setError("Network error. Check your internet connection.");
          } else {
            setError(`Speech recognition failed (${event.error}).`);
          }
          setStage("error");
        };

        recognition.onend = () => {
          setStage((s) => (s === "listening" ? "idle" : s));
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: any) {
        console.error("Failed to start speech recognition:", err);
        setError("Failed to start speech recognition. Try Chrome or Edge.");
        setStage("error");
      }
    },
    []
  );

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setStage("idle");
  }, []);

  const reset = useCallback(() => {
    setStage("idle");
    setTranscript("");
    setError("");
  }, []);

  return { stage, transcript, error, startListening, stopListening, reset, setStage, setTranscript };
}
