import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { CatalogRuntime } from "./ports.js";
import {
  toCatalogItemView,
  isTerminalStatus,
  isItemOrderable,
  isValidTrait,
  moneyValidationError,
  resolveListPrice,
  type CatalogItem,
  type CatalogItemView,
  type CatalogVariant,
  type ItemPrice,
  type ItemStatus,
  type Money,
  type OfferingTrait,
  type VariantStatus,
} from "../domain/catalog-item.js";
import { CatalogEventTypes } from "../domain/events.js";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { CatalogPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

/**
 * Catalog application facade (S2).
 * Owns commercial offerings; depends on Core facades + optional Parties/Audit.
 */
export class CatalogService {
  constructor(private readonly runtime: CatalogRuntime) {}

  private publish(
    uow: UnitOfWork,
    type: string,
    organizationId: string,
    payload: Record<string, unknown>,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "catalog",
      organizationId,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  private async requireOrg(organizationId: string): Promise<void> {
    const org = await this.runtime.tenancy.getOrganization(organizationId);
    if (!org || org.status !== "active") {
      throw new ValidationError("organization not active");
    }
  }

  private async requireAuthorized(
    actor: ActorContext,
    permissionKey: string,
  ): Promise<void> {
    const membership = await this.runtime.tenancy.getMembership(
      actor.organizationId,
      actor.principalId,
    );
    if (!membership || membership.state !== "active") {
      throw new AuthorizationError("active membership required");
    }
    const decision = await this.runtime.rbac.authorize({
      principalId: actor.principalId,
      permissionKey,
      organizationId: actor.organizationId,
      locationId: actor.locationId ?? null,
    });
    if (!decision.allowed) {
      throw new AuthorizationError(
        `denied: ${decision.reason ?? permissionKey}`,
      );
    }
  }

  private async requireItem(
    organizationId: string,
    catalogItemId: string,
  ): Promise<CatalogItem> {
    const item = await this.runtime.items.findById(
      organizationId,
      catalogItemId,
    );
    if (!item) {
      throw new NotFoundError(`catalog item not found: ${catalogItemId}`);
    }
    return item;
  }

  private normalizeTraits(traits: string[]): OfferingTrait[] {
    if (!traits.length) {
      throw new ValidationError("at least one offering trait required");
    }
    const out: OfferingTrait[] = [];
    for (const t of traits) {
      if (!isValidTrait(t)) {
        throw new ValidationError(`unknown offering trait: ${t}`);
      }
      if (!out.includes(t)) out.push(t);
    }
    return out;
  }

  private requireMoney(money: Money): Money {
    const err = moneyValidationError(money);
    if (err) throw new ValidationError(err);
    return {
      currency: money.currency,
      amountMinor: money.amountMinor,
    };
  }

  async createItem(
    actor: ActorContext,
    input: {
      code: string;
      name: string;
      description?: string | null;
      traits: string[];
      status?: "draft" | "active";
      orderable?: boolean;
      stockable?: boolean;
      taxCategoryId?: string | null;
      supplierPartyId?: string | null;
      locationIds?: string[];
      listPrice?: Money;
      metadata?: Record<string, unknown>;
    },
  ): Promise<CatalogItemView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);

    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code) throw new ValidationError("code required");
    if (!name) throw new ValidationError("name required");

    const traits = this.normalizeTraits(input.traits);
    const existing = await this.runtime.items.findByCode(
      actor.organizationId,
      code,
    );
    if (existing) {
      throw new ConflictError(`catalog code already exists: ${code}`);
    }

    if (input.supplierPartyId) {
      await this.assertSupplierParty(
        actor.organizationId,
        input.supplierPartyId,
      );
    }
    if (input.locationIds?.length) {
      await this.assertLocations(actor.organizationId, input.locationIds);
    }

    const now = this.runtime.clock.now();
    const status: ItemStatus = input.status ?? "draft";
    const stockable =
      input.stockable ?? traits.includes("goods");
    const orderable = input.orderable ?? status === "active";

    const prices: ItemPrice[] = [];
    if (input.listPrice) {
      const money = this.requireMoney(input.listPrice);
      prices.push({
        priceId: this.runtime.ids.id(),
        variantId: null,
        money,
        validFrom: null,
        validTo: null,
      });
    }

    const item: CatalogItem = {
      catalogItemId: this.runtime.ids.id(),
      organizationId: actor.organizationId,
      code,
      name,
      description: input.description?.trim() || null,
      traits,
      status,
      orderable,
      stockable,
      taxCategoryId: input.taxCategoryId ?? null,
      supplierPartyId: input.supplierPartyId ?? null,
      locationIds: input.locationIds ? [...input.locationIds] : [],
      variants: [],
      prices,
      metadata: input.metadata ? { ...input.metadata } : {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, item);
    this.publish(uow, CatalogEventTypes.ItemCreated, actor.organizationId, {
      catalogItemId: item.catalogItemId,
      code: item.code,
      traits: item.traits,
      status: item.status,
      stockable: item.stockable,
    });
    if (prices[0]) {
      this.publish(uow, CatalogEventTypes.PriceChanged, actor.organizationId, {
        catalogItemId: item.catalogItemId,
        variantId: null,
        currency: prices[0].money.currency,
        amountMinor: prices[0].money.amountMinor,
      });
    }
    await uow.commit();
    return toCatalogItemView(item);
  }

  async updateItem(
    actor: ActorContext,
    input: {
      catalogItemId: string;
      name?: string;
      description?: string | null;
      traits?: string[];
      orderable?: boolean;
      stockable?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    if (isTerminalStatus(item.status)) {
      throw new ValidationError("cannot update deleted catalog item");
    }

    const changed: string[] = [];
    const next = { ...item, variants: [...item.variants], prices: [...item.prices] };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError("name required");
      next.name = name;
      changed.push("name");
    }
    if (input.description !== undefined) {
      next.description = input.description?.trim() || null;
      changed.push("description");
    }
    if (input.traits !== undefined) {
      next.traits = this.normalizeTraits(input.traits);
      changed.push("traits");
    }
    if (input.orderable !== undefined) {
      next.orderable = input.orderable;
      changed.push("orderable");
    }
    if (input.stockable !== undefined) {
      next.stockable = input.stockable;
      changed.push("stockable");
    }
    if (input.metadata !== undefined) {
      next.metadata = { ...input.metadata };
      changed.push("metadata");
    }
    next.updatedAt = this.runtime.clock.now();

    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.ItemUpdated, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      changedFields: changed,
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  async activateItem(
    actor: ActorContext,
    catalogItemId: string,
  ): Promise<CatalogItemView> {
    return this.transitionStatus(actor, catalogItemId, "active", [
      "draft",
      "inactive",
    ]);
  }

  async inactivateItem(
    actor: ActorContext,
    catalogItemId: string,
  ): Promise<CatalogItemView> {
    return this.transitionStatus(actor, catalogItemId, "inactive", [
      "active",
      "draft",
    ]);
  }

  async deleteItem(
    actor: ActorContext,
    catalogItemId: string,
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(actor.organizationId, catalogItemId);
    if (item.status === "deleted") {
      return toCatalogItemView(item);
    }
    const now = this.runtime.clock.now();
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants],
      prices: [...item.prices],
      status: "deleted",
      orderable: false,
      deletedAt: now,
      updatedAt: now,
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.ItemDeleted, actor.organizationId, {
      catalogItemId: next.catalogItemId,
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  private async transitionStatus(
    actor: ActorContext,
    catalogItemId: string,
    to: "active" | "inactive",
    fromAllowed: ItemStatus[],
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(actor.organizationId, catalogItemId);
    if (!fromAllowed.includes(item.status)) {
      throw new ValidationError(
        `cannot transition from ${item.status} to ${to}`,
      );
    }
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants],
      prices: [...item.prices],
      status: to,
      orderable: to === "active",
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(
      uow,
      to === "active"
        ? CatalogEventTypes.ItemActivated
        : CatalogEventTypes.ItemInactivated,
      actor.organizationId,
      { catalogItemId: next.catalogItemId },
    );
    await uow.commit();
    return toCatalogItemView(next);
  }

  async addVariant(
    actor: ActorContext,
    input: {
      catalogItemId: string;
      code: string;
      name: string;
      stockable?: boolean | null;
      options?: Record<string, string>;
      listPrice?: Money;
    },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    if (isTerminalStatus(item.status)) {
      throw new ValidationError("cannot modify deleted catalog item");
    }
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code) throw new ValidationError("variant code required");
    if (!name) throw new ValidationError("variant name required");
    if (
      item.variants.some(
        (v) => v.code.toLowerCase() === code.toLowerCase() && v.status !== "retired",
      )
    ) {
      throw new ConflictError(`variant code already exists: ${code}`);
    }

    const now = this.runtime.clock.now();
    const variant: CatalogVariant = {
      variantId: this.runtime.ids.id(),
      code,
      name,
      status: "active",
      stockable: input.stockable ?? null,
      options: input.options ? { ...input.options } : {},
      createdAt: now,
      updatedAt: now,
    };
    const prices = [...item.prices];
    if (input.listPrice) {
      const money = this.requireMoney(input.listPrice);
      prices.push({
        priceId: this.runtime.ids.id(),
        variantId: variant.variantId,
        money,
        validFrom: null,
        validTo: null,
      });
    }
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants, variant],
      prices,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.VariantCreated, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      variantId: variant.variantId,
      code: variant.code,
    });
    if (input.listPrice) {
      this.publish(uow, CatalogEventTypes.PriceChanged, actor.organizationId, {
        catalogItemId: next.catalogItemId,
        variantId: variant.variantId,
        currency: input.listPrice.currency,
        amountMinor: input.listPrice.amountMinor,
      });
    }
    await uow.commit();
    return toCatalogItemView(next);
  }

  async updateVariant(
    actor: ActorContext,
    input: {
      catalogItemId: string;
      variantId: string;
      name?: string;
      stockable?: boolean | null;
      options?: Record<string, string>;
      status?: VariantStatus;
    },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    const idx = item.variants.findIndex((v) => v.variantId === input.variantId);
    if (idx < 0) {
      throw new NotFoundError(`variant not found: ${input.variantId}`);
    }
    const current = item.variants[idx]!;
    if (current.status === "retired") {
      throw new ValidationError("cannot update retired variant");
    }
    const updated: CatalogVariant = {
      ...current,
      options: { ...current.options },
      updatedAt: this.runtime.clock.now(),
    };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError("variant name required");
      updated.name = name;
    }
    if (input.stockable !== undefined) {
      updated.stockable = input.stockable;
    }
    if (input.options !== undefined) {
      updated.options = { ...input.options };
    }
    if (input.status !== undefined) {
      updated.status = input.status;
    }
    const variants = [...item.variants];
    variants[idx] = updated;
    const next: CatalogItem = {
      ...item,
      variants,
      prices: [...item.prices],
      updatedAt: this.runtime.clock.now(),
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.VariantUpdated, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      variantId: updated.variantId,
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  async retireVariant(
    actor: ActorContext,
    input: { catalogItemId: string; variantId: string },
  ): Promise<CatalogItemView> {
    return this.updateVariant(actor, {
      catalogItemId: input.catalogItemId,
      variantId: input.variantId,
      status: "retired",
    });
  }

  async setListPrice(
    actor: ActorContext,
    input: {
      catalogItemId: string;
      variantId?: string | null;
      money: Money;
      validFrom?: string | null;
      validTo?: string | null;
    },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    if (isTerminalStatus(item.status)) {
      throw new ValidationError("cannot price deleted catalog item");
    }
    const variantId = input.variantId ?? null;
    if (variantId) {
      const variant = item.variants.find((v) => v.variantId === variantId);
      if (!variant || variant.status === "retired") {
        throw new NotFoundError(`variant not found: ${variantId}`);
      }
    }
    const money = this.requireMoney(input.money);
    const now = this.runtime.clock.now();
    const prices = item.prices.filter((p) => p.variantId !== variantId);
    prices.push({
      priceId: this.runtime.ids.id(),
      variantId,
      money,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    });
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants],
      prices,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.PriceChanged, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      variantId,
      currency: money.currency,
      amountMinor: money.amountMinor,
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  async setLocationApplicability(
    actor: ActorContext,
    input: { catalogItemId: string; locationIds: string[] },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    if (isTerminalStatus(item.status)) {
      throw new ValidationError("cannot update deleted catalog item");
    }
    if (input.locationIds.length) {
      await this.assertLocations(actor.organizationId, input.locationIds);
    }
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants],
      prices: [...item.prices],
      locationIds: [...input.locationIds],
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.ItemUpdated, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      changedFields: ["locationIds"],
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  async setTaxCategory(
    actor: ActorContext,
    input: { catalogItemId: string; taxCategoryId: string | null },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.TaxManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    if (isTerminalStatus(item.status)) {
      throw new ValidationError("cannot update deleted catalog item");
    }
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants],
      prices: [...item.prices],
      taxCategoryId: input.taxCategoryId,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.ItemUpdated, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      changedFields: ["taxCategoryId"],
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  async linkSupplierParty(
    actor: ActorContext,
    input: { catalogItemId: string; partyId: string | null },
  ): Promise<CatalogItemView> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemManage);
    const item = await this.requireItem(
      actor.organizationId,
      input.catalogItemId,
    );
    if (isTerminalStatus(item.status)) {
      throw new ValidationError("cannot update deleted catalog item");
    }
    if (input.partyId) {
      await this.assertSupplierParty(actor.organizationId, input.partyId);
    }
    const next: CatalogItem = {
      ...item,
      variants: [...item.variants],
      prices: [...item.prices],
      supplierPartyId: input.partyId,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.items.save(uow, next);
    this.publish(uow, CatalogEventTypes.ItemUpdated, actor.organizationId, {
      catalogItemId: next.catalogItemId,
      changedFields: ["supplierPartyId"],
    });
    await uow.commit();
    return toCatalogItemView(next);
  }

  private async assertSupplierParty(
    organizationId: string,
    partyId: string,
  ): Promise<void> {
    if (!this.runtime.parties) {
      throw new ValidationError("parties port required to link supplier");
    }
    const party = await this.runtime.parties.getParty(organizationId, partyId);
    if (!party) {
      throw new NotFoundError(`party not found: ${partyId}`);
    }
    if (party.status === "deleted" || party.status === "merged") {
      throw new ValidationError("supplier party is terminal");
    }
  }

  private async assertLocations(
    organizationId: string,
    locationIds: string[],
  ): Promise<void> {
    const locations = await this.runtime.tenancy.listLocations(organizationId);
    const byId = new Map(locations.map((l) => [l.locationId, l]));
    for (const id of locationIds) {
      const loc = byId.get(id);
      if (!loc || loc.status !== "active") {
        throw new ValidationError(`location not active: ${id}`);
      }
    }
  }

  async getItem(
    organizationId: string,
    catalogItemId: string,
  ): Promise<CatalogItemView | null> {
    const item = await this.runtime.items.findById(
      organizationId,
      catalogItemId,
    );
    return item ? toCatalogItemView(item) : null;
  }

  async findItems(
    actor: ActorContext,
    filter: {
      status?: string;
      trait?: string;
      text?: string;
      locationId?: string;
    } = {},
  ): Promise<CatalogItemView[]> {
    await this.requireAuthorized(actor, CatalogPermissions.ItemRead);
    const rows = await this.runtime.items.list({
      organizationId: actor.organizationId,
      ...filter,
    });
    return rows.map(toCatalogItemView);
  }

  async assertItemOrderable(input: {
    organizationId: string;
    catalogItemId: string;
    variantId?: string | null;
    locationId?: string | null;
  }): Promise<void> {
    const item = await this.requireItem(
      input.organizationId,
      input.catalogItemId,
    );
    const opts: { variantId?: string | null; locationId?: string | null } = {};
    if (input.variantId !== undefined) opts.variantId = input.variantId;
    if (input.locationId !== undefined) opts.locationId = input.locationId;
    const result = isItemOrderable(item, opts);
    if (!result.ok) {
      throw new ValidationError(result.reason);
    }
  }

  async resolveListPrice(input: {
    organizationId: string;
    catalogItemId: string;
    variantId?: string | null;
    at?: string | null;
  }): Promise<Money | null> {
    const item = await this.requireItem(
      input.organizationId,
      input.catalogItemId,
    );
    const opts: { variantId?: string | null; at?: string | null } = {};
    if (input.variantId !== undefined) opts.variantId = input.variantId;
    if (input.at !== undefined) opts.at = input.at;
    return resolveListPrice(item, opts);
  }
}
