import { z } from "zod";
import { durationPattern } from "./duration.js";

export const recordingFormatVersion = 1;

const durationSchema = z.string().regex(durationPattern);
// A comment tells a person what happens. The player ignores it. An export writes it from fixed phrases, never from session content.
const commentSchema = z.string().max(500).optional();
// A setting value is a short word, for example a mode name. It never holds a path or free text.
const settingValuePattern = /^[\w.:-]{1,40}$/;

export const recordingContextSchema = z.object({
  /** The day of the session. */
  recordedOn: z.iso.date(),
  /** The name of the model that the session used. */
  model: z.string().regex(settingValuePattern).optional(),
  /** High-level settings of the agent, for example the permission mode. */
  settings: z.record(z.string().regex(settingValuePattern), z.string().regex(settingValuePattern)).optional(),
});

// A process name becomes the path of a link in a temporary folder. A recording is data from outside, so allow only safe characters.
// A name can have folders, for example `IntelliJ IDEA.app/Contents/MacOS/idea`. A folder name must not be `..`.
const processNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._() /-]{0,127}$/)
  .refine((name) => name.split("/").every((part) => part !== "" && part !== ".." && part !== "."));

const spawnOperationSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  operation: z.literal("spawn"),
  agent: z.string().min(1),
  processName: processNameSchema,
});

const exitOperationSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  operation: z.literal("exit"),
  agent: z.string().min(1),
});

const writeOperationSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  operation: z.literal("write"),
  // The agent whose placeholders apply. When it is missing, the agent that started last applies.
  agent: z.string().min(1).optional(),
  path: z.string().min(1),
  content: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

const appendOperationSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  operation: z.literal("append"),
  agent: z.string().min(1).optional(),
  path: z.string().min(1),
  // An object becomes one line of JSON with a line break. A text is added as it is.
  content: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

const holdOpenOperationSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  operation: z.literal("holdOpen"),
  agent: z.string().min(1).optional(),
  path: z.string().min(1),
});

const releaseOperationSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  operation: z.literal("release"),
  agent: z.string().min(1).optional(),
  path: z.string().min(1),
});

export const timelineStepSchema = z.discriminatedUnion("operation", [
  spawnOperationSchema,
  exitOperationSchema,
  writeOperationSchema,
  appendOperationSchema,
  holdOpenOperationSchema,
  releaseOperationSchema,
]);

export const expectedStateSchema = z.object({
  offset: durationSchema.optional(),
  comment: commentSchema,
  // The session identifier. It can contain placeholders.
  session: z.string().min(1),
  // The state of the session, or null when the session must not exist.
  state: z.string().min(1).nullable(),
});

export const recordingSchema = z.object({
  header: z.object({
    formatVersion: z.literal(recordingFormatVersion),
    source: z.string().min(1),
    agent: z.string().min(1),
    agentVersion: z.string().min(1),
    platform: z.string().min(1),
    context: recordingContextSchema.optional(),
  }),
  timeline: z.array(timelineStepSchema),
  expected: z.array(expectedStateSchema),
});

export type RecordingContext = z.infer<typeof recordingContextSchema>;
export type TimelineStep = z.infer<typeof timelineStepSchema>;
/** A step without a time offset. The distributive form keeps the three operation types apart. */
export type Operation = TimelineStep extends infer Step ? (Step extends unknown ? Omit<Step, "offset"> : never) : never;
export type ExpectedState = z.infer<typeof expectedStateSchema>;
export type Recording = z.infer<typeof recordingSchema>;
