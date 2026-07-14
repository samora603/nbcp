import type { UnitOfWork } from "@nbcp/outbox";
import type { Order } from "../domain/order.js";
import type { OrderRepository } from "../application/ports.js";

export class InMemoryOrderRepository implements OrderRepository {
  private readonly byId = new Map<string, Order>();

  private key(organizationId: string, orderId: string): string {
    return `${organizationId}:${orderId}`;
  }

  async save(uow: UnitOfWork, order: Order): Promise<void> {
    const snapshot = structuredClone(order);
    const k = this.key(order.organizationId, order.orderId);
    uow.stageMutation(() => {
      this.byId.set(k, snapshot);
    });
  }

  async findById(
    organizationId: string,
    orderId: string,
  ): Promise<Order | null> {
    const order = this.byId.get(this.key(organizationId, orderId));
    return order ? structuredClone(order) : null;
  }

  async list(input: {
    organizationId: string;
    status?: string;
    customerPartyId?: string;
    locationId?: string;
  }): Promise<Order[]> {
    let rows = [...this.byId.values()].filter(
      (o) => o.organizationId === input.organizationId,
    );
    if (input.status) {
      rows = rows.filter((o) => o.status === input.status);
    }
    if (input.customerPartyId) {
      rows = rows.filter((o) => o.customerPartyId === input.customerPartyId);
    }
    if (input.locationId) {
      rows = rows.filter((o) => o.locationId === input.locationId);
    }
    return rows.map((o) => structuredClone(o));
  }
}
