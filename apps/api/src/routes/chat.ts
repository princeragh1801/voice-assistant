import { Router } from 'express';
import { z } from 'zod';
import type { ChatMessage, ChatResponseBody } from '@jarvis/types';
import { llmService, LLMServiceError } from '../modules/llm';

const SYSTEM_PROMPT: ChatMessage = {
  role: 'system',
  content: 'You are Jarvis, a helpful personal work assistant. Answer concisely and clearly.',
};

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty').max(8000, 'Message content is too long'),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required').max(50, 'Too many messages'),
});

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join('; ') });
    return;
  }

  try {
    const assistantMessage = await llmService.chat([SYSTEM_PROMPT, ...parsed.data.messages]);
    const body: ChatResponseBody = { message: { role: 'assistant', content: assistantMessage.content } };
    res.json(body);
  } catch (error) {
    if (error instanceof LLMServiceError) {
      console.error(
        'LLM service error:',
        error.message,
        error.providerStatus ? `(provider status ${error.providerStatus})` : '',
      );
    } else {
      console.error('Unexpected error calling LLM service:', error);
    }
    res.status(502).json({ error: 'Failed to get a response from the assistant. Please try again.' });
  }
});
