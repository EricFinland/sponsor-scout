import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { canReadWorkspace, canWriteWorkspace, createSession, publicWorkspace, workspaceAccess } from "@/lib/auth";
import { proxy } from "@/proxy";
afterEach(()=>vi.unstubAllEnvs());
describe("sign-in-free workspace access",()=>{
  it("allows anonymous public reads and redirects old sign-in links",()=>{
    vi.stubEnv("SHEET_WEBHOOK_URL","https://fixture.example/script");vi.stubEnv("WORKSPACE_ACCESS","public-read");
    expect(canReadWorkspace(undefined)).toBe(true);expect(canWriteWorkspace(undefined)).toBe(false);
    expect(proxy(new NextRequest("https://app.example/")).status).toBe(200);
    expect(proxy(new NextRequest("https://app.example/login")).headers.get("location")).toBe("https://app.example/");
  });
  it("does not allow an old session to bypass public view-only mode",()=>{
    vi.stubEnv("TEAM_ACCESS_KEY","fixture-team-access-key-long-enough");const session=createSession();vi.stubEnv("WORKSPACE_ACCESS","public-read");
    expect(canWriteWorkspace(session)).toBe(false);
  });
  it("requires explicit public editing configuration",()=>{
    vi.stubEnv("WORKSPACE_ACCESS","public-edit");expect(canReadWorkspace(undefined)).toBe(true);expect(canWriteWorkspace(undefined)).toBe(true);
    vi.stubEnv("WORKSPACE_ACCESS","typo");expect(workspaceAccess()).toBe("private");expect(publicWorkspace()).toBe(false);expect(canReadWorkspace(undefined)).toBe(false);
  });
});
