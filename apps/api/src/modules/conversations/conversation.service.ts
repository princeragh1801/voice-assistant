import { prisma } from '../../config/prisma';
import type { Conversation, Message } from '../../generated/prisma/client';

/**
 * Only this many of the most recent messages are sent to the LLM as context on each
 * call. Full history is never deleted from Postgres (see appendExchange) — this only
 * bounds token cost/latency as a conversation grows over weeks/months. Real
 * summarization of older history is deferred to a later phase.
 */
export const LLM_CONTEXT_WINDOW = 20;

/**
 * How many of the most recent messages the frontend hydrates on load (GET
 * /api/conversation). This is a display/pagination bound, not data loss — full
 * history always remains in Postgres.
 */
export const HYDRATION_WINDOW = 100;

/**
 * Returns the single ongoing conversation this app maintains (the most recently
 * created one), read-only — never creates a row. Used by GET /api/conversation so a
 * page load before the very first message ever sent doesn't write to the database.
 */
export async function findActiveConversation(): Promise<Conversation | null> {
  return prisma.conversation.findFirst({ orderBy: { createdAt: 'desc' } });
}

/**
 * Same as findActiveConversation, but creates the conversation if none exists yet.
 * Used by POST /api/chat, which always needs a conversation to append to.
 */
export async function getOrCreateActiveConversation(): Promise<Conversation> {
  const existing = await findActiveConversation();
  if (existing) return existing;
  return prisma.conversation.create({ data: {} });
}

/**
 * Returns up to `limit` of the most recent messages for a conversation, oldest
 * first. Ordered by (createdAt, id) rather than createdAt alone: messages written
 * in the same appendExchange transaction can share an identical createdAt (Postgres
 * now() is fixed for the whole transaction), so id — which reflects true insertion
 * order — is needed as a tiebreaker to avoid ever returning a reply before its
 * question.
 */
export async function getRecentMessages(conversationId: number, limit: number): Promise<Message[]> {
  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return recent.reverse();
}

/**
 * Persists one user/assistant text exchange. Only ever called after an LLM call has
 * already succeeded with a final natural-language answer — tool-call bookkeeping
 * ('tool'-role messages, assistant tool-call-only messages) is never persisted, only
 * the clean user/assistant turns the frontend actually displays.
 */
export async function appendExchange(
  conversationId: number,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, role: 'user', content: userContent } }),
    prisma.message.create({ data: { conversationId, role: 'assistant', content: assistantContent } }),
    // Bumps Conversation.updatedAt via @updatedAt even with an empty data object —
    // keeps "most recently active" meaningful once multiple conversations can exist.
    prisma.conversation.update({ where: { id: conversationId }, data: {} }),
  ]);
}
