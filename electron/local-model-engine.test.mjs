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
