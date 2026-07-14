import type { UnitOfWork } from "@nbcp/outbox";
import type { CatalogItem } from "../domain/catalog-item.js";
import type { CatalogItemRepository } from "../application/ports.js";

export class InMemoryCatalogItemRepository implements CatalogItemRepository {
  private readonly byId = new Map<string, CatalogItem>();

  private key(organizationId: string, catalogItemId: string): string {
    return `${organizationId}:${catalogItemId}`;
  }

  async save(uow: UnitOfWork, item: CatalogItem): Promise<void> {
    const snapshot = structuredClone(item);
    const k = this.key(item.organizationId, item.catalogItemId);
    uow.stageMutation(() => {
      this.byId.set(k, snapshot);
    });
  }

  async findById(
    organizationId: string,
    catalogItemId: string,
  ): Promise<CatalogItem | null> {
    const item = this.byId.get(this.key(organizationId, catalogItemId));
    return item ? structuredClone(item) : null;
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<CatalogItem | null> {
    const normalized = code.trim().toLowerCase();
    for (const item of this.byId.values()) {
      if (
        item.organizationId === organizationId &&
        item.status !== "deleted" &&
        item.code.toLowerCase() === normalized
      ) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async list(input: {
    organizationId: string;
    status?: string;
    trait?: string;
    text?: string;
    locationId?: string;
  }): Promise<CatalogItem[]> {
    let rows = [...this.byId.values()].filter(
      (i) => i.organizationId === input.organizationId,
    );
    if (input.status) {
      rows = rows.filter((i) => i.status === input.status);
    } else {
      rows = rows.filter((i) => i.status !== "deleted");
    }
    if (input.trait) {
      const trait = input.trait;
      rows = rows.filter((i) =>
        (i.traits as string[]).includes(trait),
      );
    }
    if (input.text) {
      const q = input.text.toLowerCase();
      rows = rows.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q),
      );
    }
    if (input.locationId) {
      const loc = input.locationId;
      rows = rows.filter(
        (i) => i.locationIds.length === 0 || i.locationIds.includes(loc),
      );
    }
    return rows.map((i) => structuredClone(i));
  }
}
