import { useState } from "react";
import { Mic, Send, Square, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/lib/useVoiceInput";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Shared composer: talk to the AI or type — always both. */
const VoiceTextComposer = ({ onSend, disabled, placeholder = "Type or tap the mic…" }: Props) => {
  const [text, setText] = useState("");
  const { stage, startListening, stopListening } = useVoiceInput();
  const listening = stage === "listening";

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || disabled) return;
    setText("");
    onSend(v);
  };

  const handleMic = () => {
    if (listening) {
      stopListening();
      return;
    }
    startListening((spoken) => submit(spoken));
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 rounded-2xl border border-border bg-surface px-3 py-2">
        <textarea
          value={listening ? "" : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          rows={1}
          disabled={disabled || listening}
          placeholder={listening ? "Listening…" : placeholder}
          className="w-full bg-transparent outline-none resize-none text-foreground placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </div>

      <button
        onClick={handleMic}
        disabled={disabled}
        aria-label={listening ? "Stop listening" : "Speak"}
        className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center transition-all ${
          listening ? "bg-destructive animate-pulse" : "bg-secondary active:scale-95"
        }`}
      >
        {listening ? (
          <Square className="w-5 h-5 text-secondary-foreground" />
        ) : (
          <Mic className="w-5 h-5 text-secondary-foreground" />
        )}
      </button>

      <button
        onClick={() => submit(text)}
        disabled={disabled || !text.trim()}
        aria-label="Send"
        className="w-12 h-12 shrink-0 rounded-full bg-primary flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
      >
        {disabled ? (
          <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
        ) : (
          <Send className="w-5 h-5 text-primary-foreground" />
        )}
      </button>
    </div>
  );
};

export default VoiceTextComposer;
