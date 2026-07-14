export type OutboxMetricName =
  | "outbox.unpublished"
  | "outbox.published"
  | "outbox.poison"
  | "outbox.relay.success"
  | "outbox.relay.failure"
  | "outbox.relay.poisoned";

export interface OutboxMetrics {
  gauge(name: OutboxMetricName, value: number): void;
  increment(name: OutboxMetricName, by?: number): void;
}

export interface OutboxLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export class InMemoryOutboxMetrics implements OutboxMetrics {
  readonly gauges = new Map<string, number>();
  readonly counters = new Map<string, number>();

  gauge(name: OutboxMetricName, value: number): void {
    this.gauges.set(name, value);
  }

  increment(name: OutboxMetricName, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }
}

export class ConsoleOutboxLogger implements OutboxLogger {
  info(message: string, fields?: Record<string, unknown>): void {
    console.info(`[outbox] ${message}`, fields ?? {});
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    console.warn(`[outbox] ${message}`, fields ?? {});
  }

  error(message: string, fields?: Record<string, unknown>): void {
    console.error(`[outbox] ${message}`, fields ?? {});
  }
}

export class SilentOutboxLogger implements OutboxLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
}
