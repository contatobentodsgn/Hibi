import assert from "node:assert/strict";
import test from "node:test";
import { createLlamaEngine } from "./local-model-engine.mjs";

function fakeRuntime(log) {
  class LlamaChatSession {
    constructor() { this.history = []; }
    resetChatHistory() { this.history = []; log.push("reset"); }
    async prompt(text, { onTextChunk }) {
      this.history.push(text);
      log.push(`prompt with ${this.history.length} turn(s) in history`);
      onTextChunk("ok");
      return "ok";
    }
  }
  return {
    getLlama: async () => ({ loadModel: async () => ({ createContext: async () => ({ getSequence: () => ({}) }) }) }),
    LlamaChatSession,
  };
}

async function collect(iterable) {
  let text = "";
  for await (const chunk of iterable) text += chunk;
  return text;
}

test("every prompt starts from an empty chat history so turns never pile up in the context", async () => {
  const log = [];
  const engine = createLlamaEngine({ modelPath: "/model.gguf", loadRuntime: async () => fakeRuntime(log) });
  await engine.load();

  assert.equal(await collect(engine.complete("primeira")), "ok");
  assert.equal(await collect(engine.complete("segunda")), "ok");

  assert.deepEqual(log.filter((line) => line.startsWith("prompt")), ["prompt with 1 turn(s) in history", "prompt with 1 turn(s) in history"]);
});

test("a JSON schema becomes a grammar once and reaches every constrained prompt", async () => {
  const grammars = [];
  const prompts = [];
  const runtime = {
    getLlama: async () => ({
      loadModel: async () => ({ createContext: async () => ({ getSequence: () => ({}) }) }),
      createGrammarForJsonSchema: async (schema) => { const grammar = { schema }; grammars.push(grammar); return grammar; },
    }),
    LlamaChatSession: class { resetChatHistory() {} async prompt(_text, options) { prompts.push(options.grammar ?? null); options.onTextChunk("{}"); return "{}"; } },
  };
  const engine = createLlamaEngine({ modelPath: "/model.gguf", loadRuntime: async () => runtime });
  await engine.load();
  const schema = { type: "object" };
  await collect(engine.complete("a", { jsonSchema: schema }));
  await collect(engine.complete("b", { jsonSchema: schema }));
  await collect(engine.complete("c"));
  assert.equal(grammars.length, 1);
  assert.deepEqual(prompts, [grammars[0], grammars[0], null]);
});
