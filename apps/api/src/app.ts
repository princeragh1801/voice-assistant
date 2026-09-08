import express, { type ErrorRequestHandler } from 'express';
import { API_ROUTES } from '@jarvis/shared';
import { healthRouter } from './routes/health';
import { chatRouter } from './routes/chat';
import { tasksRouter } from './routes/tasks';
import { conversationRouter } from './routes/conversation';

export const app = express();

app.use(express.json());
app.use(API_ROUTES.HEALTH, healthRouter);
app.use(API_ROUTES.CHAT, chatRouter);
app.use(API_ROUTES.TASKS, tasksRouter);
app.use(API_ROUTES.CONVERSATION, conversationRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};

app.use(errorHandler);
