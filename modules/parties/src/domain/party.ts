export type PartyKind = "individual" | "organization";

export type PartyStatus =
  | "draft"
  | "active"
  | "inactive"
  | "merged"
  | "deleted";

/** Platform classification keys — customer/supplier/internal (employee). */
export type PartyRoleKey =
  | "customer"
  | "supplier"
  | "vendor"
  | "employee"
  | string;

export const PLATFORM_ROLE_KEYS = [
  "customer",
  "supplier",
  "vendor",
  "employee",
] as const;

export type ChannelType = "email" | "phone" | "mobile" | "fax" | "other";

export type AddressUsage = "billing" | "shipping" | "legal" | "other";

export interface PartyClassification {
  roleKey: string;
  grantedAt: string;
}

export interface ContactChannel {
  channelId: string;
  channelType: ChannelType;
  value: string;
  isPrimary: boolean;
  isVerified: boolean;
}

export interface PostalAddress {
  addressId: string;
  lines: string[];
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  usage: AddressUsage;
  isDefault: boolean;
}

export interface ContactPerson {
  contactPersonId: string;
  name: string;
  channels: ContactChannel[];
}

export interface Party {
  partyId: string;
  organizationId: string;
  kind: PartyKind;
  status: PartyStatus;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  legalName: string | null;
  tradeName: string | null;
  classifications: PartyClassification[];
  channels: ContactChannel[];
  addresses: PostalAddress[];
  contactPersons: ContactPerson[];
  principalId: string | null;
  defaultLocationId: string | null;
  mergedIntoPartyId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PartyRelationship {
  relationshipId: string;
  organizationId: string;
  fromPartyId: string;
  toPartyId: string;
  relationshipType: string;
  createdAt: string;
  removedAt: string | null;
}

export type PartyView = Omit<
  Party,
  "contactPersons"
> & {
  contactPersons: ContactPerson[];
  roleKeys: string[];
};

export function toPartyView(party: Party): PartyView {
  const clone = structuredClone(party);
  return {
    ...clone,
    roleKeys: clone.classifications.map((c) => c.roleKey),
  };
}

export function isTerminalStatus(status: PartyStatus): boolean {
  return status === "deleted" || status === "merged";
}

export function canReceiveNewBusiness(status: PartyStatus): boolean {
  return status === "active" || status === "draft";
}
