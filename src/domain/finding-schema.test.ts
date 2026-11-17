import { expect, it } from "vitest";
import { z } from "zod";
import { findingSchema } from "./finding-import";

// The published schema is generated from the Zod schema the importer actually runs, so external
// tools never validate against a contract the app no longer accepts. After changing
// findingSchema, regenerate it with `pnpm test -u`.
it("docs/finding-schema.json matches the importer's schema", async () => {
  const { $schema, ...body } = z.toJSONSchema(findingSchema, { target: "draft-2020-12", io: "input" });
  const schema = {
    $schema,
    $id: "https://github.com/scopedeck/scopedeck/blob/main/docs/finding-schema.json",
    title: "Scopedeck finding",
    description: "A finding that Scopedeck can import into a report draft.",
    ...body,
  };
  await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot("../../docs/finding-schema.json");
});
