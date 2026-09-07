import { Router } from 'express';
import type { HealthCheckResponse } from '@jarvis/types';
import { prisma } from '../config/prisma';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let database: HealthCheckResponse['database'] = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch (error) {
    console.error('Health check DB ping failed:', error);
  }

  const body: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database,
  };

  res.json(body);
});
