export const PartiesEventTypes = {
  PartyCreated: "parties.party.created",
  PartyUpdated: "parties.party.updated",
  PartyActivated: "parties.party.activated",
  PartyInactivated: "parties.party.inactivated",
  PartyDeleted: "parties.party.deleted",
  PartyMerged: "parties.party.merged",
  ClassificationGranted: "parties.classification.granted",
  ClassificationRevoked: "parties.classification.revoked",
  ChannelAdded: "parties.channel.added",
  ChannelRemoved: "parties.channel.removed",
  RelationshipCreated: "parties.relationship.created",
  RelationshipRemoved: "parties.relationship.removed",
  PrincipalLinked: "parties.principal.linked",
  PrincipalUnlinked: "parties.principal.unlinked",
} as const;

export type PartiesEventType =
  (typeof PartiesEventTypes)[keyof typeof PartiesEventTypes];

export const PARTIES_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(PartiesEventTypes),
);
