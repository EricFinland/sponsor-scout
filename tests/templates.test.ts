import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  mergeTemplates,
  parseTemplateBackup,
  templateBackup,
  templateFor,
  TEMPLATES,
  validateTemplate,
  validatePersonalTemplates,
} from "@/lib/templates";
const custom = {
  id: "custom-example",
  label: "Event sponsorship",
  industries: [] as const,
  subject: "A partnership with {{company}}",
  body: "Hi {{first}},\n\n{{hook}}\n\nThank you,\n{{sender}}",
};
describe("personal email templates", () => {
  it("overrides a starter only in the personal library and retains new templates", () => {
    const original = TEMPLATES[0].subject;
    const edited = { ...TEMPLATES[0], subject: "Personal subject" };
    const newTemplate = validateTemplate(custom);
    const library = mergeTemplates([edited, newTemplate]);
    expect(library).toHaveLength(5);
    expect(templateFor("beverage_cpg", library).subject).toBe(
      "Personal subject",
    );
    expect(TEMPLATES[0].subject).toBe(original);
    expect(library.find((t) => t.id === custom.id)?.label).toBe(custom.label);
  });
  it("fills known placeholders without altering bracketed research notes", () => {
    expect(
      fillTemplate(
        "Hi {{first}} at {{company}}. {{hook}} [project cost] {{sender}}",
        {
          first: "Alex",
          company: "Acme",
          hook: "A researched hook.",
          sender: "Sam",
        },
      ),
    ).toBe("Hi Alex at Acme. A researched hook. [project cost] Sam");
  });
  it("preserves paragraphs and Unicode through export/import", () => {
    const t = validateTemplate({
      ...custom,
      body: custom.body + "\nClean water — together 💧",
      updatedAt: "2026-11-11T20:00:00.000Z",
    });
    expect(parseTemplateBackup(templateBackup([t]))).toEqual([t]);
  });
  it.each(["{{frist}}", "{{ first }}", "{{company}", "sender}}"])(
    "rejects broken or unsupported placeholder %s",
    (token) => {
      expect(() =>
        validateTemplate({ ...custom, body: "Hi " + token }),
      ).toThrow(/placeholder/i);
    },
  );
  it("rejects empty content, oversized messages and invalid industries", () => {
    expect(() => validateTemplate({ ...custom, label: " " })).toThrow("name");
    expect(() => validateTemplate({ ...custom, subject: "" })).toThrow(
      "subject",
    );
    expect(() =>
      validateTemplate({ ...custom, body: "x".repeat(5001) }),
    ).toThrow("message");
    expect(() =>
      validateTemplate({ ...custom, industries: ["__proto__"] }),
    ).toThrow("industries");
  });
  it("rejects malformed, duplicate and excessive backups before applying them", () => {
    expect(() => parseTemplateBackup("bad-json")).toThrow("JSON");
    expect(() => parseTemplateBackup('{"version":2,"templates":[]}')).toThrow(
      "version 1",
    );
    const t = validateTemplate(custom);
    expect(() => validatePersonalTemplates([t, t])).toThrow("duplicate");
    expect(() =>
      validatePersonalTemplates(
        Array.from({ length: 101 }, (_, i) => ({ ...t, id: `custom-${i}` })),
      ),
    ).toThrow("100");
  });
});
