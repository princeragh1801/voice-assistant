import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechRecognitionOptions {
  onResult: (transcript: string) => void;
}

interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function useSpeechRecognition({ onResult }: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionConstructor() !== undefined;
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Keep the latest onResult callback available to the recognition instance's
  // event handler without needing to recreate that instance every render.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;

    setError(null);
    const recognition = new Ctor();
    // Push-to-talk, single utterance: not continuous, no interim results.
    // Swapping this for always-listening later is a change confined to this hook.
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (transcript) onResultRef.current(transcript);
    };
    recognition.onerror = (event) => {
      setError(event.error);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    // abort(), not stop(): a manual cancel shouldn't still deliver a partial result.
    recognitionRef.current?.abort();
    setIsListening(false);
  }, []);

  return { isSupported, isListening, error, start, stop };
}
