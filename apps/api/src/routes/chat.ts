import { Router } from 'express';
import { z } from 'zod';
import type { ChatResponseBody } from '@jarvis/types';
import type { LLMMessage } from '../modules/llm';
import { llmService, LLMServiceError } from '../modules/llm';
import { executeTaskTool, taskToolDefinitions } from '../modules/tasks/task.tools';
import {
  appendExchange,
  getOrCreateActiveConversation,
  getRecentMessages,
  LLM_CONTEXT_WINDOW,
} from '../modules/conversations/conversation.service';

const MAX_TOOL_ITERATIONS = 5;

function buildSystemPrompt(): LLMMessage {
  const now = new Date();
  const humanNow = now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return {
    role: 'system',
    content: [
      'You are Jarvis, a helpful personal work assistant. Answer concisely and clearly.',
      '',
      `The current date and time is ${humanNow} (ISO: ${now.toISOString()}). Use this to resolve relative dates such as "today", "tomorrow", or "next Friday" into actual ISO date strings (e.g. "2026-09-09") whenever a tool needs a date.`,
      '',
      "You can manage the user's tasks using the provided tools:",
      '- get_tasks: list tasks, optionally filtered by status (TODO, IN_PROGRESS, COMPLETED, CANCELLED).',
      '- get_today_tasks: list tasks whose due date is today. Use this only for questions specifically about today (e.g. "what do I have today?") — for questions like "what am I working on", use get_tasks with status IN_PROGRESS instead.',
      '- create_task: create a new task.',
      '- update_task: change any field of an existing task.',
      '- complete_task: mark an existing task as completed.',
      '',
      'IMPORTANT: update_task and complete_task require the task\'s numeric id, not its title. If the user refers to a task by name or description (e.g. "the login bug task"), first call get_tasks to find the matching task and read its id, then call update_task or complete_task with that id. Never guess an id.',
      'If multiple tasks could match what the user means, ask a clarifying question instead of guessing which one.',
      'If a tool reports an error or no matching task is found, explain this to the user in plain language rather than making something up.',
    ].join('\n'),
  };
}

const chatRequestSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(8000, 'Message content is too long'),
});

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join('; ') });
    return;
  }

  const userContent = parsed.data.content;

  let conversationId: number;
  let history: LLMMessage[];
  try {
    const conversation = await getOrCreateActiveConversation();
    conversationId = conversation.id;
    const recentMessages = await getRecentMessages(conversationId, LLM_CONTEXT_WINDOW);
    history = recentMessages.map((message) => ({ role: message.role, content: message.content }));
  } catch (error) {
    console.error('Failed to load conversation history:', error);
    res.status(500).json({ error: 'Failed to load conversation history.' });
    return;
  }

  const llmMessages: LLMMessage[] = [buildSystemPrompt(), ...history, { role: 'user', content: userContent }];

  try {
    let finalContent: string | null = null;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const assistantMessage = await llmService.chat(llmMessages, { tools: taskToolDefinitions });

      if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
        finalContent = assistantMessage.content ?? '';
        break;
      }

      llmMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.toolCalls) {
        const resultContent = await executeTaskTool(toolCall);
        llmMessages.push({ role: 'tool', content: resultContent, toolCallId: toolCall.id });
      }
    }

    if (finalContent === null) {
      console.error('Chat tool-calling loop exceeded the max iteration count without a final answer');
      res
        .status(502)
        .json({ error: 'The assistant is taking too many steps to respond. Please try rephrasing your request.' });
      return;
    }

    // Persist only now that the LLM call has actually produced a final answer — never
    // before, so a failed call never leaves an orphaned question with no answer in
    // history. If persistence itself fails, the user still gets their answer (it just
    // won't survive a refresh) — we log loudly rather than discarding a reply that
    // already cost a real LLM call.
    try {
      await appendExchange(conversationId, userContent, finalContent);
    } catch (error) {
      console.error('Failed to persist chat exchange:', error);
    }

    const body: ChatResponseBody = { message: { role: 'assistant', content: finalContent } };
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
