import type { AiToolCall } from './contracts';
import { ToolRegistry, type ToolRisk } from './tools';

export interface Confirmation {
  readonly id: string;
  readonly digest: string;
  readonly calls: readonly AiToolCall[];
  readonly expiresAtMs: number;
}

export type PolicyOutcome =
  | Readonly<{ kind: 'execute' }>
  | Readonly<{ kind: 'confirm'; confirmation: Confirmation }>
  | Readonly<{ kind: 'blocked'; reason: string }>;

const encoder = new TextEncoder();
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
};

const normalizeCalls = (calls: readonly AiToolCall[]): readonly AiToolCall[] => calls.map((call) => ({
  name: call.name,
  arguments: JSON.parse(canonicalize(call.arguments)) as Record<string, unknown>,
}));

const digest = async (value: string): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const randomNonce = (): string => crypto.randomUUID();

const requiresConfirmation = (risk: ToolRisk, bulk: boolean, externallyVisible: boolean): boolean =>
  risk === 'destructive' || risk === 'external' || bulk || externallyVisible;

export class AiToolPolicy {
  private readonly confirmations = new Map<string, Confirmation>();
  private readonly consumed = new Set<string>();

  constructor(private readonly registry: ToolRegistry, private readonly confirmationTtlMs = 60_000) {}

  async decide(calls: readonly AiToolCall[], nowMs = Date.now()): Promise<PolicyOutcome> {
    if (calls.length === 0) return { kind: 'execute' };
    if (calls.length > 2) return { kind: 'blocked', reason: 'At most two tool calls are allowed per turn.' };

    let requiresApproval = calls.length > 1;
    for (const call of calls) {
      const validation = this.registry.validate(call);
      if (validation) return { kind: 'blocked', reason: validation };
      const tool = this.registry.get(call.name)!;
      requiresApproval ||= requiresConfirmation(tool.risk, tool.bulk === true, tool.externallyVisible === true);
    }
    if (!requiresApproval) return { kind: 'execute' };

    const normalizedCalls = normalizeCalls(calls);
    const nonce = randomNonce();
    const confirmation: Confirmation = Object.freeze({
      id: nonce,
      digest: await digest(`${nonce}:${canonicalize(normalizedCalls)}`),
      calls: normalizedCalls,
      expiresAtMs: nowMs + this.confirmationTtlMs,
    });
    this.confirmations.set(confirmation.id, confirmation);
    return { kind: 'confirm', confirmation };
  }

  async consume(id: string, calls: readonly AiToolCall[], nowMs = Date.now()): Promise<PolicyOutcome> {
    const confirmation = this.confirmations.get(id);
    if (!confirmation || this.consumed.has(id)) return { kind: 'blocked', reason: 'Confirmation is invalid or already used.' };
    if (nowMs > confirmation.expiresAtMs) {
      this.confirmations.delete(id);
      return { kind: 'blocked', reason: 'Confirmation has expired.' };
    }
    const expectedDigest = await digest(`${confirmation.id}:${canonicalize(normalizeCalls(calls))}`);
    if (expectedDigest !== confirmation.digest) return { kind: 'blocked', reason: 'Confirmation does not match these tool calls.' };
    this.consumed.add(id);
    this.confirmations.delete(id);
    return { kind: 'execute' };
  }
}
