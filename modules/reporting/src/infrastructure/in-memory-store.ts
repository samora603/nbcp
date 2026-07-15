import type { ProjectionStore } from "../application/ports.js";
import type {
  FinancialFact,
  InventoryBalanceProjection,
  InventoryMovementFact,
  OrderFact,
  PaymentFact,
  ProcessedProjectionEvent,
} from "../domain/projections.js";

export class InMemoryProjectionStore implements ProjectionStore {
  private readonly processed = new Set<string>();
  private readonly orderFacts = new Map<string, OrderFact>();
  private readonly paymentFacts = new Map<string, PaymentFact>();
  private readonly inventoryMovements = new Map<string, InventoryMovementFact>();
  private readonly inventoryBalances = new Map<string, InventoryBalanceProjection>();
  private readonly financialFacts = new Map<string, FinancialFact>();

  private processedKey(
    organizationId: string,
    sourceEventId: string,
    handler: string,
  ): string {
    return `${organizationId}:${sourceEventId}:${handler}`;
  }

  private orderKey(organizationId: string, orderId: string): string {
    return `${organizationId}:${orderId}`;
  }

  private paymentKey(organizationId: string, paymentId: string): string {
    return `${organizationId}:${paymentId}`;
  }

  private balanceKey(organizationId: string, sku: string): string {
    return `${organizationId}:${sku}`;
  }

  async isProcessed(
    organizationId: string,
    sourceEventId: string,
    handler: string,
  ): Promise<boolean> {
    return this.processed.has(
      this.processedKey(organizationId, sourceEventId, handler),
    );
  }

  async markProcessed(event: ProcessedProjectionEvent): Promise<void> {
    this.processed.add(
      this.processedKey(
        event.organizationId,
        event.sourceEventId,
        event.handler,
      ),
    );
  }

  async upsertOrderFact(fact: OrderFact): Promise<void> {
    this.orderFacts.set(this.orderKey(fact.organizationId, fact.orderId), {
      ...fact,
    });
  }

  async getOrderFact(
    organizationId: string,
    orderId: string,
  ): Promise<OrderFact | null> {
    const fact = this.orderFacts.get(this.orderKey(organizationId, orderId));
    return fact ? { ...fact } : null;
  }

  async listOrderFacts(organizationId: string): Promise<OrderFact[]> {
    return [...this.orderFacts.values()]
      .filter((f) => f.organizationId === organizationId)
      .map((f) => ({ ...f }));
  }

  async upsertPaymentFact(fact: PaymentFact): Promise<void> {
    this.paymentFacts.set(
      this.paymentKey(fact.organizationId, fact.paymentId),
      { ...fact },
    );
  }

  async getPaymentFactBySourceEvent(
    organizationId: string,
    sourceEventId: string,
  ): Promise<PaymentFact | null> {
    const fact = [...this.paymentFacts.values()].find(
      (f) =>
        f.organizationId === organizationId &&
        f.lastEventId === sourceEventId,
    );
    return fact ? { ...fact } : null;
  }

  async listPaymentFacts(organizationId: string): Promise<PaymentFact[]> {
    return [...this.paymentFacts.values()]
      .filter((f) => f.organizationId === organizationId)
      .map((f) => ({ ...f }));
  }

  async appendInventoryMovement(
    fact: InventoryMovementFact,
  ): Promise<boolean> {
    const key = `${fact.organizationId}:${fact.sourceEventId}:${fact.sku}`;
    if (this.inventoryMovements.has(key)) {
      return false;
    }
    this.inventoryMovements.set(key, { ...fact });
    return true;
  }

  async getInventoryBalance(
    organizationId: string,
    sku: string,
  ): Promise<InventoryBalanceProjection | null> {
    const b = this.inventoryBalances.get(this.balanceKey(organizationId, sku));
    return b ? { ...b } : null;
  }

  async upsertInventoryBalance(
    balance: InventoryBalanceProjection,
  ): Promise<void> {
    this.inventoryBalances.set(
      this.balanceKey(balance.organizationId, balance.sku),
      { ...balance },
    );
  }

  async listInventoryBalances(
    organizationId: string,
  ): Promise<InventoryBalanceProjection[]> {
    return [...this.inventoryBalances.values()]
      .filter((b) => b.organizationId === organizationId)
      .map((b) => ({ ...b }));
  }

  async listInventoryMovements(
    organizationId: string,
  ): Promise<InventoryMovementFact[]> {
    return [...this.inventoryMovements.values()]
      .filter((m) => m.organizationId === organizationId)
      .map((m) => ({ ...m }));
  }

  async appendFinancialFact(fact: FinancialFact): Promise<boolean> {
    const key = `${fact.organizationId}:${fact.projectionEventId}`;
    if (this.financialFacts.has(key)) {
      return false;
    }
    this.financialFacts.set(key, { ...fact });
    return true;
  }

  async listFinancialFacts(organizationId: string): Promise<FinancialFact[]> {
    return [...this.financialFacts.values()]
      .filter((f) => f.organizationId === organizationId)
      .map((f) => ({ ...f }));
  }
}
