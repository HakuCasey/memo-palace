export class NotImplementedError extends Error {
  constructor(msg = "LLM hook not implemented (deferred to future RFC)") {
    super(msg);
    this.name = "NotImplementedError";
  }
}

export async function callLLM(_prompt: string): Promise<string> {
  throw new NotImplementedError();
}
