import { useState } from 'react';
import type { FormEvent } from 'react';
import { API_ROUTES } from '@jarvis/shared';
import type { ChatRequestBody, ChatResponseBody, ClientChatMessage } from '@jarvis/types';

type Status = 'idle' | 'loading' | 'error';

export function Chat() {
  const [messages, setMessages] = useState<ClientChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function sendMessages(nextMessages: ClientChatMessage[]) {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const requestBody: ChatRequestBody = { messages: nextMessages };
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
      setMessages([...nextMessages, data.message]);
      setStatus('idle');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || status === 'loading') return;

    const nextMessages: ClientChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    void sendMessages(nextMessages);
  }

  function handleRetry() {
    if (messages.length > 0) void sendMessages(messages);
  }

  return (
    <section>
      <h2>Chat</h2>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role === 'user' ? 'You' : 'Jarvis'}:</strong> {message.content}
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
          disabled={status === 'loading'}
        />
        <button type="submit" disabled={status === 'loading'}>
          Send
        </button>
      </form>
    </section>
  );
}
