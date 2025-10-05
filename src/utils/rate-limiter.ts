export class RateLimiter {
  private lastCallTime = 0;
  private minInterval: number;

  constructor(callsPerSecond = 2) {
    this.minInterval = 1000 / callsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastCallTime = Date.now();
  }
}
