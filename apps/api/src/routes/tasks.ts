import { Router } from 'express';
import { z } from 'zod';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  createTask,
  deleteTask,
  getTasks,
  getTodayTasks,
  parseDueDate,
  updateTask,
  TaskNotFoundError,
} from '../modules/tasks/task.service';

export const tasksRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

const statusQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
});

const dateStringSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), 'dueDate must be a valid date string');

const createTaskSchema = z.object({
  title: z.string().min(1, 'title is required').max(200, 'title is too long'),
  description: z.string().max(4000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dateStringSchema.optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dateStringSchema.nullable().optional(),
});

function issuesToMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

tasksRouter.get('/today', async (_req, res) => {
  try {
    const tasks = await getTodayTasks();
    res.json({ tasks });
  } catch (error) {
    console.error("Failed to load today's tasks:", error);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

tasksRouter.get('/', async (req, res) => {
  const parsed = statusQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: issuesToMessage(parsed.error) });
    return;
  }

  try {
    const tasks = await getTasks(parsed.data.status ? { status: parsed.data.status } : undefined);
    res.json({ tasks });
  } catch (error) {
    console.error('Failed to load tasks:', error);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

tasksRouter.post('/', async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: issuesToMessage(parsed.error) });
    return;
  }

  try {
    const task = await createTask({
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? parseDueDate(parsed.data.dueDate) : undefined,
    });
    res.status(201).json({ task });
  } catch (error) {
    console.error('Failed to create task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

tasksRouter.patch('/:id', async (req, res) => {
  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: issuesToMessage(parsedParams.error) });
    return;
  }

  const parsedBody = updateTaskSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: issuesToMessage(parsedBody.error) });
    return;
  }

  try {
    const task = await updateTask(parsedParams.data.id, {
      title: parsedBody.data.title,
      description: parsedBody.data.description,
      status: parsedBody.data.status,
      priority: parsedBody.data.priority,
      dueDate:
        parsedBody.data.dueDate === undefined
          ? undefined
          : parsedBody.data.dueDate === null
            ? null
            : parseDueDate(parsedBody.data.dueDate),
    });
    res.json({ task });
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Failed to update task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

tasksRouter.delete('/:id', async (req, res) => {
  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: issuesToMessage(parsedParams.error) });
    return;
  }

  try {
    await deleteTask(parsedParams.data.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Failed to delete task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});
