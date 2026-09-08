import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_ROUTES } from '@jarvis/shared';
import type { ChatRequestBody, ChatResponseBody, ClientChatMessage, ConversationResponseBody } from '@jarvis/types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';

type Status = 'idle' | 'loading' | 'error';

interface LastAttempt {
  content: string;
  voice: boolean;
}

function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone access denied — allow microphone permission to use voice input.';
    case 'no-speech':
      return 'No speech detected — try again.';
    default:
      return `Voice input error: ${code}`;
  }
}

export function Chat() {
  const [messages, setMessages] = useState<ClientChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Whether the initial GET /api/conversation hydration call is still in flight. The
  // form stays disabled until this resolves, so an optimistic append can never race
  // with the hydration response overwriting the whole `messages` list.
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Tracks whether the message currently in flight came from voice input, so only
  // its reply gets auto-spoken. A ref, not state: write-then-read bookkeeping for
  // sendMessage, never rendered directly.
  const wasVoiceInitiatedRef = useRef(false);

  // The last {content, voice} submitted, for handleRetry to resend after a failure.
  // The backend only ever accepts a single new message (not the full transcript),
  // so retry can't just resend `messages` anymore.
  const lastAttemptRef = useRef<LastAttempt | null>(null);

  const { speak, stop: stopSpeaking, isSpeaking, isSupported: canSpeak } = useSpeechSynthesis();

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch(API_ROUTES.CONVERSATION);
        if (!res.ok) throw new Error(`Failed to load conversation history (status ${res.status})`);
        const data = (await res.json()) as ConversationResponseBody;
        if (!cancelled) setMessages(data.messages);
      } catch (err: unknown) {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleVoiceResult(transcript: string) {
    submitMessage(transcript, true);
  }

  const {
    start: startListening,
    stop: stopListening,
    isListening,
    isSupported: canListen,
    error: speechError,
  } = useSpeechRecognition({ onResult: handleVoiceResult });

  async function sendMessage(content: string) {
    const isVoiceReply = wasVoiceInitiatedRef.current;
    setStatus('loading');
    setErrorMessage(null);
    try {
      const requestBody: ChatRequestBody = { content };
      const res = await fetch(API_ROUTES.CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorBody: unknown = await res.json().catch(() => null);
        const message =
          errorBody && typeof errorBody === 'object' && 'error' in errorBody && typeof errorBody.error === 'string'
            ? errorBody.error
            : `Request failed with status ${res.status}`;
        throw new Error(message);
      }

      const data = (await res.json()) as ChatResponseBody;
      setMessages((prev) => [...prev, data.message]);
      setStatus('idle');
      lastAttemptRef.current = null;
      if (isVoiceReply) speak(data.message.content);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  function submitMessage(content: string, voice: boolean): boolean {
    const trimmed = content.trim();
    if (!trimmed || status === 'loading' || historyLoading) return false;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    wasVoiceInitiatedRef.current = voice;
    lastAttemptRef.current = { content: trimmed, voice };
    void sendMessage(trimmed);
    return true;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitMessage(input, false)) setInput('');
  }

  function handleRetry() {
    const attempt = lastAttemptRef.current;
    if (!attempt) return;
    wasVoiceInitiatedRef.current = attempt.voice;
    void sendMessage(attempt.content);
  }

  function handleMicClick() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  return (
    <section>
      <h2>Chat</h2>
      {historyLoading && <p>Loading conversation…</p>}
      {historyError && <p>Couldn&apos;t load conversation history: {historyError} (starting fresh)</p>}
      <ul>
        {messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role === 'user' ? 'You' : 'Jarvis'}:</strong> {message.content}{' '}
            {message.role === 'assistant' && canSpeak && (
              <button type="button" onClick={() => speak(message.content)} aria-label="Replay this reply aloud">
                🔊
              </button>
            )}
          </li>
        ))}
      </ul>

      {status === 'loading' && <p>Jarvis is thinking…</p>}
      {status === 'error' && (
        <p>
          {errorMessage ?? 'Something went wrong.'}{' '}
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Jarvis something…"
          disabled={status === 'loading' || isListening || historyLoading}
        />
        <button type="submit" disabled={status === 'loading' || isListening || historyLoading}>
          Send
        </button>
        {canListen ? (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={status === 'loading' || historyLoading}
            aria-pressed={isListening}
          >
            {isListening ? '🛑 Stop listening' : '🎤'}
          </button>
        ) : (
          <span>Voice input isn&apos;t supported in this browser.</span>
        )}
        {isSpeaking && (
          <button type="button" onClick={stopSpeaking}>
            ⏹ Stop
          </button>
        )}
      </form>

      {isListening && <p>Listening…</p>}
      {speechError && <p>{describeSpeechError(speechError)}</p>}
    </section>
  );
}
