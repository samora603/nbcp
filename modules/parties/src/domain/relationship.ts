export const RELATIONSHIP_TYPES = [
  "contact_of",
  "subsidiary_of",
  "employer_of",
  "billing_parent_of",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number] | string;

export function isAllowlistedRelationshipType(type: string): boolean {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(type);
}
