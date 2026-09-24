import type { AiToolCall, AiToolSchema } from './contracts';

export type ToolRisk = 'read' | 'reversible' | 'destructive' | 'external';

export type ToolExecutionContext = Readonly<{ nowMs: number }>;
export type ToolExecutionResult = Readonly<{ summary: string; data?: Record<string, unknown> }>;
export type ToolValidator = (arguments_: Record<string, unknown>) => boolean;
export type ToolExecutor = (arguments_: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult> | ToolExecutionResult;

export interface PixanoTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly risk: ToolRisk;
  readonly externallyVisible?: boolean;
  readonly bulk?: boolean;
  readonly validate: ToolValidator;
  readonly execute: ToolExecutor;
}

export class ToolRegistry {
  private readonly tools = new Map<string, PixanoTool>();

  register(tool: PixanoTool): this {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate AI tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): PixanoTool | undefined { return this.tools.get(name); }
  has(name: string): boolean { return this.tools.has(name); }
  schemas(): readonly AiToolSchema[] {
    return [...this.tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  validate(call: AiToolCall): string | null {
    const tool = this.get(call.name);
    if (!tool) return `Unknown tool: ${call.name}`;
    try { return tool.validate(call.arguments) ? null : `Invalid arguments for tool: ${call.name}`; }
    catch { return `Invalid arguments for tool: ${call.name}`; }
  }
}
