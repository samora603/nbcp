import type { UnitOfWork } from "@nbcp/outbox";
import type { Payment } from "../domain/payment.js";
import type { PaymentRepository } from "../application/ports.js";

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly byId = new Map<string, Payment>();

  private key(organizationId: string, paymentId: string): string {
    return `${organizationId}:${paymentId}`;
  }

  async save(uow: UnitOfWork, payment: Payment): Promise<void> {
    const snapshot = structuredClone(payment);
    const k = this.key(payment.organizationId, payment.paymentId);
    uow.stageMutation(() => {
      this.byId.set(k, snapshot);
    });
  }

  async findById(
    organizationId: string,
    paymentId: string,
  ): Promise<Payment | null> {
    const payment = this.byId.get(this.key(organizationId, paymentId));
    return payment ? structuredClone(payment) : null;
  }

  async list(input: {
    organizationId: string;
    orderId?: string;
    status?: string;
  }): Promise<Payment[]> {
    let rows = [...this.byId.values()].filter(
      (p) => p.organizationId === input.organizationId,
    );
    if (input.orderId) {
      rows = rows.filter((p) => p.orderId === input.orderId);
    }
    if (input.status) {
      rows = rows.filter((p) => p.status === input.status);
    }
    return rows.map((p) => structuredClone(p));
  }
}
