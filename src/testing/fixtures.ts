import type { StructuredScope, Weakness } from "@/ipc/programs";

export function scope(
  overrides: Partial<StructuredScope> & Pick<StructuredScope, "id" | "assetIdentifier">,
): StructuredScope {
  return {
    assetType: "URL",
    eligibleForBounty: true,
    eligibleForSubmission: true,
    instruction: null,
    maxSeverity: "critical",
    confidentialityRequirement: null,
    integrityRequirement: null,
    availabilityRequirement: null,
    reference: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

export function weakness(overrides: Partial<Weakness> & Pick<Weakness, "id" | "name">): Weakness {
  return { description: null, externalId: null, createdAt: null, ...overrides };
}
