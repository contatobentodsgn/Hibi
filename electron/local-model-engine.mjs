export function createLlamaEngine({ modelPath, loadRuntime = () => import("node-llama-cpp") }) {
  let llama;
  let model;
  let context;
  let session;
  const grammars = new Map();
  // A gramática de um schema é compilada uma vez e reaproveitada: compilar a cada pergunta custa tempo.
  const grammarFor = async (schema) => {
    const key = JSON.stringify(schema);
    if (!grammars.has(key)) grammars.set(key, await llama.createGrammarForJsonSchema(schema));
    return grammars.get(key);
  };
  return {
    async load() {
      const { getLlama, LlamaChatSession } = await loadRuntime();
      llama ??= await getLlama();
      model = await llama.loadModel({ modelPath });
      context = await model.createContext({ contextSize: 2048 });
      session = new LlamaChatSession({ contextSequence: context.getSequence() });
    },
    async *complete(prompt, { signal, jsonSchema } = {}) {
      if (!session) throw new Error("Local model is not loaded.");
      if (signal?.aborted) return;
      // Each prompt already carries the recent conversation; keeping the session's own
      // history would repeat it and overflow the 2048-token context after a few turns.
      session.resetChatHistory();
      const chunks = [];
      let resolveDone;
      let rejectDone;
      const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
      const grammar = jsonSchema ? await grammarFor(jsonSchema) : undefined;
      const task = session.prompt(prompt, {
        maxTokens: 512,
        ...(grammar ? { grammar } : {}),
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
      grammars.clear();
    },
  };
}
