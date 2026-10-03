import { useCallback, useEffect, useRef, useState } from "react";

type VoiceButtonProps = {
  onTranscript: (text: string) => void;
  lang?: string;
  disabled?: boolean;
  continuous?: boolean;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const win = window as unknown as Record<string, unknown>;
  return (win.SpeechRecognition ??
    win.webkitSpeechRecognition ??
    null) as SpeechRecognitionConstructor | null;
}

export function VoiceButton({
  onTranscript,
  lang = "ja-JP",
  disabled = false,
  continuous = false,
}: VoiceButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => getSpeechRecognition() !== null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const keepListeningRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    keepListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    stopListening();

    const recognition = new SpeechRecognitionClass();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.continuous = continuous;
    keepListeningRef.current = continuous;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        onTranscriptRef.current(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      const canContinue = continuous && keepListeningRef.current && event.error === "no-speech";
      if (canContinue) return;
      keepListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (!keepListeningRef.current) {
        setIsListening(false);
        recognitionRef.current = null;
        return;
      }
      window.setTimeout(() => {
        if (!keepListeningRef.current) return;
        try {
          recognition.start();
        } catch {
          keepListeningRef.current = false;
          setIsListening(false);
          recognitionRef.current = null;
        }
      }, 200);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [continuous, lang, stopListening]);

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  if (!isSupported) return null;

  return (
    <button
      type="button"
      className={`voiceButton ${isListening ? "voiceButton--listening" : ""}`}
      onClick={isListening ? stopListening : startListening}
      disabled={disabled}
      title={isListening ? "Arrêter la dictée" : "Dictée vocale"}
      aria-label={isListening ? "Arrêter la dictée vocale" : "Démarrer la dictée vocale"}
    >
      {isListening ? (
        <span className="voiceButton__pulse" />
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Microphone"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      )}
    </button>
  );
}
