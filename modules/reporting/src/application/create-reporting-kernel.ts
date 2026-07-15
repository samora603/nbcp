import type { TenancyService } from "@nbcp/tenancy";
import type { RbacService } from "@nbcp/rbac";
import { ReportingService } from "./reporting-service.js";
import type { ReportingRuntime } from "./ports.js";
import { InMemoryProjectionStore } from "../infrastructure/in-memory-store.js";

export interface CreateReportingKernelOptions {
  tenancy: TenancyService;
  rbac: RbacService;
}

export interface ReportingKernel {
  service: ReportingService;
  store: InMemoryProjectionStore;
}

export function createReportingKernel(
  options: CreateReportingKernelOptions,
): ReportingKernel {
  const store = new InMemoryProjectionStore();

  const runtime: ReportingRuntime = {
    tenancy: {
      async getOrganization(organizationId) {
        const org = await options.tenancy.getOrganization(organizationId);
        if (!org) return null;
        return {
          organizationId: org.organizationId,
          status: org.status,
        };
      },
      async getMembership(organizationId, principalId) {
        const m = await options.tenancy.getMembership(
          organizationId,
          principalId,
        );
        if (!m) return null;
        return { state: m.state };
      },
    },
    rbac: {
      authorize: (input) => options.rbac.authorize(input),
    },
    store,
    clock: { now: () => new Date().toISOString() },
  };

  return {
    service: new ReportingService(runtime),
    store,
  };
}
