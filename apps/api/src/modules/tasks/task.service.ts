import { prisma } from '../../config/prisma';
import type { Task, TaskPriority, TaskStatus } from '../../generated/prisma/client';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

const BARE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a due-date string. Bare "YYYY-MM-DD" strings are treated as LOCAL midnight
 * (not UTC midnight, which is what `new Date(str)` would do) so that a date the LLM
 * resolves as "today"/"tomorrow" lines up with getTodayTasks()'s local-midnight window.
 */
export function parseDueDate(value: string): Date {
  if (BARE_DATE_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export class TaskNotFoundError extends Error {
  constructor(id: number) {
    super(`Task with id ${id} not found`);
    this.name = 'TaskNotFoundError';
  }
}

export interface GetTasksFilter {
  status?: TaskStatus;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
}

export async function getTasks(filter?: GetTasksFilter): Promise<Task[]> {
  return prisma.task.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTodayTasks(): Promise<Task[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  return prisma.task.findMany({
    where: { dueDate: { gte: startOfToday, lt: startOfTomorrow } },
    orderBy: { dueDate: 'asc' },
  });
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueDate: input.dueDate,
    },
  });
}

async function requireTask(id: number): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new TaskNotFoundError(id);
  return task;
}

export async function updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
  await requireTask(id);
  return prisma.task.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
    },
  });
}

export async function completeTask(id: number): Promise<Task> {
  return updateTask(id, { status: 'COMPLETED' });
}

export async function deleteTask(id: number): Promise<void> {
  await requireTask(id);
  await prisma.task.delete({ where: { id } });
}
