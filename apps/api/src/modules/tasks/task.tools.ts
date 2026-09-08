import { z } from 'zod';
import type { LLMToolCall, ToolDefinition } from '../llm/types';
import type { Task } from '../../generated/prisma/client';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  completeTask,
  createTask,
  getTasks,
  getTodayTasks,
  parseDueDate,
  updateTask,
  TaskNotFoundError,
} from './task.service';

/**
 * Formats a Date as a local (not UTC) "YYYY-MM-DD" string for the LLM to read back
 * to the user. Serializing dueDate as a raw ISO timestamp (JSON.stringify's default
 * for Date) reads as UTC, which can show as the wrong calendar day to the model —
 * e.g. a task due at local midnight Sept 8 in UTC+5:30 is "2026-09-07T18:30:00.000Z",
 * which the model would otherwise narrate as "September 7".
 */
function formatLocalDate(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serializeTaskForLLM(task: Task) {
  return { ...task, dueDate: formatLocalDate(task.dueDate) };
}

export const taskToolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_tasks',
      description:
        "Get the user's tasks, optionally filtered by status. Use this to find a task's id when the user refers to a task by name or description rather than by id.",
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: TASK_STATUSES,
            description: 'Optional. Only return tasks with this status. Omit to return tasks in every status.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_tasks',
      description:
        'Get tasks whose due date falls within today. Use this only for questions specifically about today (e.g. "what do I have today?"), not for general questions like "what am I working on" — use get_tasks with status IN_PROGRESS for that.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Required. Short title for the task.' },
          description: { type: 'string', description: 'Optional. Longer description of the task.' },
          priority: {
            type: 'string',
            enum: TASK_PRIORITIES,
            description: 'Optional. Defaults to MEDIUM if omitted.',
          },
          dueDate: {
            type: 'string',
            description:
              'Optional. An ISO 8601 date or date-time string, e.g. "2026-09-09". Resolve relative dates like "tomorrow" using the current date given in the system prompt.',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        "Update one or more fields of an existing task. Requires the task's numeric id — call get_tasks first if you only know the task by name or description. Only include fields that should change.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: "Required. The task's id, obtained from get_tasks or get_today_tasks." },
          title: { type: 'string', description: 'Optional. New title.' },
          description: { type: 'string', description: 'Optional. New description.' },
          status: { type: 'string', enum: TASK_STATUSES, description: 'Optional. New status.' },
          priority: { type: 'string', enum: TASK_PRIORITIES, description: 'Optional. New priority.' },
          dueDate: { type: 'string', description: 'Optional. New due date as an ISO 8601 date or date-time string.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description:
        "Mark an existing task as completed. Requires the task's numeric id — call get_tasks first if you only know the task by name or description.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: "Required. The task's id, obtained from get_tasks or get_today_tasks." },
        },
        required: ['id'],
      },
    },
  },
];

const dueDateSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), 'dueDate must be a valid date string');

const getTasksArgsSchema = z.object({ status: z.enum(TASK_STATUSES).optional() });
const getTodayTasksArgsSchema = z.object({});

const createTaskArgsSchema = z.object({
  title: z.string().min(1, 'title is required').max(200, 'title is too long'),
  description: z.string().max(4000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dueDateSchema.optional(),
});

const updateTaskArgsSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dueDateSchema.optional(),
});

const completeTaskArgsSchema = z.object({ id: z.number().int().positive() });

export async function executeTaskTool(toolCall: LLMToolCall): Promise<string> {
  const { name, arguments: rawArgs } = toolCall.function;

  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({ error: `Invalid JSON arguments for tool "${name}"` });
  }

  try {
    switch (name) {
      case 'get_tasks': {
        const { status } = getTasksArgsSchema.parse(args);
        const tasks = await getTasks(status ? { status } : undefined);
        return JSON.stringify({ tasks: tasks.map(serializeTaskForLLM) });
      }
      case 'get_today_tasks': {
        getTodayTasksArgsSchema.parse(args);
        const tasks = await getTodayTasks();
        return JSON.stringify({ tasks: tasks.map(serializeTaskForLLM) });
      }
      case 'create_task': {
        const parsedArgs = createTaskArgsSchema.parse(args);
        const task = await createTask({
          title: parsedArgs.title,
          description: parsedArgs.description,
          priority: parsedArgs.priority,
          dueDate: parsedArgs.dueDate ? parseDueDate(parsedArgs.dueDate) : undefined,
        });
        return JSON.stringify({ task: serializeTaskForLLM(task) });
      }
      case 'update_task': {
        const { id, ...fields } = updateTaskArgsSchema.parse(args);
        const task = await updateTask(id, {
          title: fields.title,
          description: fields.description,
          status: fields.status,
          priority: fields.priority,
          dueDate: fields.dueDate ? parseDueDate(fields.dueDate) : undefined,
        });
        return JSON.stringify({ task: serializeTaskForLLM(task) });
      }
      case 'complete_task': {
        const { id } = completeTaskArgsSchema.parse(args);
        const task = await completeTask(id);
        return JSON.stringify({ task: serializeTaskForLLM(task) });
      }
      default:
        return JSON.stringify({ error: `Unknown tool "${name}"` });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return JSON.stringify({
        error: `Invalid arguments for tool "${name}": ${error.issues.map((issue) => issue.message).join('; ')}`,
      });
    }
    if (error instanceof TaskNotFoundError) {
      return JSON.stringify({ error: error.message });
    }
    console.error(`Task tool "${name}" failed:`, error);
    return JSON.stringify({ error: `Failed to execute tool "${name}"` });
  }
}
