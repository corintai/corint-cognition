import { z } from 'zod';

export interface ToolExecutionContext {
  sessionId: string;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export abstract class Tool<TInput = unknown, TOutput = unknown> {
  abstract name: string;
  abstract description: string;
  abstract parameters: z.ZodSchema<TInput>;

  abstract execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;

  toOpenAITool(): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  } {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: zodToJsonSchema(this.parameters),
      },
    };
  }

  validate(input: unknown): TInput {
    return this.parameters.parse(input);
  }
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getOpenAITools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.getAll().map(tool => tool.toOpenAITool());
  }
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodString) {
    return withDescription({ type: 'string' }, schema);
  }
  if (schema instanceof z.ZodNumber) {
    return withDescription({ type: 'number' }, schema);
  }
  if (schema instanceof z.ZodBoolean) {
    return withDescription({ type: 'boolean' }, schema);
  }
  if (schema instanceof z.ZodArray) {
    return withDescription({ type: 'array', items: zodToJsonSchema(schema.element) }, schema);
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const key of Object.keys(shape)) {
      const propertySchema = shape[key];
      properties[key] = zodToJsonSchema(propertySchema);
      if (!propertySchema.isOptional()) {
        required.push(key);
      }
    }

    const jsonSchema: Record<string, unknown> = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      jsonSchema.required = required;
    }

    return withDescription(jsonSchema, schema);
  }
  if (schema instanceof z.ZodEnum) {
    return withDescription({ type: 'string', enum: schema.options }, schema);
  }
  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema.enum) as Array<string | number>;
    return withDescription({ enum: values }, schema);
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodNullable) {
    return {
      anyOf: [zodToJsonSchema(schema.unwrap()), { type: 'null' }],
    };
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault());
  }
  if (schema instanceof z.ZodUnion) {
    return {
      anyOf: schema.options.map((option: z.ZodTypeAny) => zodToJsonSchema(option)),
    };
  }
  if (schema instanceof z.ZodLiteral) {
    return { const: schema.value };
  }
  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.valueSchema),
    };
  }
  if (schema instanceof z.ZodTuple) {
    const items = schema.items.map((item: z.ZodTypeAny) => zodToJsonSchema(item));
    return {
      type: 'array',
      items,
      minItems: items.length,
      maxItems: items.length,
    };
  }
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema.innerType());
  }

  return {};
}

function withDescription(
  jsonSchema: Record<string, unknown>,
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  const description = schema.description;
  if (description) {
    return { ...jsonSchema, description };
  }
  return jsonSchema;
}
