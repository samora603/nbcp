export type OrganizationStatus =
  | "pending"
  | "active"
  | "suspended"
  | "archived"
  | "deleted";

export type LocationStatus = "active" | "inactive";

export interface Location {
  locationId: string;
  name: string;
  code: string;
  status: LocationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  organizationId: string;
  name: string;
  slug: string | null;
  status: OrganizationStatus;
  ownerPrincipalId: string;
  locations: Location[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OrganizationView {
  organizationId: string;
  name: string;
  slug: string | null;
  status: OrganizationStatus;
  ownerPrincipalId: string;
  createdAt: string;
}

export function toOrganizationView(org: Organization): OrganizationView {
  return {
    organizationId: org.organizationId,
    name: org.name,
    slug: org.slug,
    status: org.status,
    ownerPrincipalId: org.ownerPrincipalId,
    createdAt: org.createdAt,
  };
}

export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}
