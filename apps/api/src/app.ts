import express from 'express';
import { API_ROUTES } from '@jarvis/shared';
import { healthRouter } from './routes/health';

export const app = express();

app.use(express.json());
app.use(API_ROUTES.HEALTH, healthRouter);
