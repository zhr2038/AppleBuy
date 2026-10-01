// Placeholder for a future real Apple adapter (M2). It is NOT wired into any CLI command or runner.
// Every method, including retries, throws: there is no code path that can reach Apple from C-002.
// Its `kind` is deliberately not "mock", so Engine and runEngine refuse it structurally.

export class RealActionBlockedError extends Error {
  constructor(method: string) {
    super(`RealActionBlocked: ${method} — 真实苹果适配器未实现且未获授权（C-002 仅离线演练）`);
    this.name = "RealActionBlockedError";
  }
}

export class RealApplePortBlocked {
  readonly kind = "real-blocked" as const;
  readonly label = "真实苹果适配器（已阻断，未实现）";
  async observe(): Promise<never> {
    throw new RealActionBlockedError("observe");
  }
  async chooseSlot(_opId: string, _ref: string): Promise<never> {
    throw new RealActionBlockedError("chooseSlot");
  }
  async advance(_opId: string): Promise<never> {
    throw new RealActionBlockedError("advance");
  }
  async submitOrder(_opId: string, _capability: unknown): Promise<never> {
    throw new RealActionBlockedError("submitOrder");
  }
  async lookupOrder(_opId: string): Promise<never> {
    throw new RealActionBlockedError("lookupOrder");
  }
}
