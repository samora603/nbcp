/** Permission catalog keys owned by Parties. */
export const PartiesPermissions = {
  PartyRead: "parties.party.read",
  PartyManage: "parties.party.manage",
  ClassificationManage: "parties.classification.manage",
  PrincipalLink: "parties.principal.link",
  RelationshipManage: "parties.relationship.manage",
  PartyMerge: "parties.party.merge",
} as const;

export type PartiesPermission =
  (typeof PartiesPermissions)[keyof typeof PartiesPermissions];

export const PARTIES_PERMISSION_KEYS: readonly string[] = Object.values(
  PartiesPermissions,
);
