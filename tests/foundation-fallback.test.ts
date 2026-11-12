import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/propublica", () => ({
  searchFoundations: vi.fn(async () => {
    throw new Error("Unavailable");
  }),
}));
vi.mock("@/lib/data", () => ({
  isExistingPartner: (name: string) => name === "Partner",
}));
import { GET } from "@/app/api/foundations/route";
describe("company enrichment when foundation search is unavailable", () => {
  it("allows continuing with other sources without claiming a foundation is absent or dropping partner protection", async () => {
    const response = await GET(
      new Request("https://example.com/api/foundations?q=Partner"),
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.candidates).toEqual([]);
    expect(data.alreadyPartner).toBe(true);
    expect(data.warning).toContain("unverified");
  });
});
