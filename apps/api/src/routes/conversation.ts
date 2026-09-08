import { Router } from 'express';
import type { ClientChatMessage, ConversationResponseBody } from '@jarvis/types';
import { findActiveConversation, getRecentMessages, HYDRATION_WINDOW } from '../modules/conversations/conversation.service';

export const conversationRouter = Router();

conversationRouter.get('/', async (_req, res) => {
  try {
    const conversation = await findActiveConversation();
    if (!conversation) {
      const body: ConversationResponseBody = { messages: [] };
      res.json(body);
      return;
    }

    const messages = await getRecentMessages(conversation.id, HYDRATION_WINDOW);
    const body: ConversationResponseBody = {
      messages: messages.map((message): ClientChatMessage => ({ role: message.role, content: message.content })),
    };
    res.json(body);
  } catch (error) {
    console.error('Failed to load conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation history.' });
  }
});
