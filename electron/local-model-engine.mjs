import { getLlama, LlamaChatSession } from "node-llama-cpp";

export function createLlamaEngine({ modelPath }) {
  let llama;
  let model;
  let context;
  let session;
  return {
    async load() {
      llama ??= await getLlama();
      model = await llama.loadModel({ modelPath });
      context = await model.createContext({ contextSize: 2048 });
      session = new LlamaChatSession({ contextSequence: context.getSequence() });
    },
    async *complete(prompt, { signal } = {}) {
      if (!session) throw new Error("Local model is not loaded.");
      if (signal?.aborted) return;
      const chunks = [];
      let resolveDone;
      let rejectDone;
      const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
      const task = session.prompt(prompt, {
        maxTokens: 512,
        stopOnAbortSignal: true,
        signal,
        onTextChunk(chunk) { chunks.push(chunk); },
      }).then(resolveDone, rejectDone);
      let emitted = 0;
      while (true) {
        while (emitted < chunks.length) yield chunks[emitted++];
        const result = await Promise.race([done.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("pending"), 25))]);
        if (result === "done") break;
      }
      await task;
    },
    async shutdown() {
      session?.dispose?.();
      context?.dispose?.();
      model?.dispose?.();
      llama?.dispose?.();
      session = undefined;
      model = undefined;
      context = undefined;
      llama = undefined;
    },
  };
}
