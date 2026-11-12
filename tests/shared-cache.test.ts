import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ values: new Map<string,{value:unknown;tags:string[]}>(), options: [] as {revalidate:number;tags:string[]}[], cookie: undefined as string | undefined }));
vi.mock("next/cache", () => ({
  unstable_cache: (work:()=>Promise<unknown>, keys:string[], options:{revalidate:number;tags:string[]}) => async () => {
    state.options.push(options); const key=keys.join(":");const saved=state.values.get(key);if(saved)return saved.value;
    const value=await work();state.values.set(key,{value,tags:options.tags});return value;
  },
  revalidateTag: vi.fn((tag:string)=>{for(const [key,entry] of state.values)if(entry.tags.includes(tag))state.values.delete(key);}),
}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>state.cookie?{value:state.cookie}:undefined})}));
import { coalesce, sharedCatalog, invalidateSheetData } from "@/lib/shared-data";
import { getAppData } from "@/lib/data";
import { POST } from "@/app/api/workspace/route";
import { createSession } from "@/lib/auth";
import config from "@data/weights.json";
import { configToRows } from "@/lib/sheet-data";
import type { ScoringConfig } from "@/lib/types";
import { createSheetRuntime } from "./helpers/sheet-runtime";

beforeEach(()=>{vi.stubEnv("WORKSPACE_ACCESS","private");state.values.clear();state.options=[];state.cookie=undefined;vi.stubEnv("SHEET_WEBHOOK_URL","https://fixture.example/script");vi.stubEnv("SHEET_WEBHOOK_SECRET","fixture-only-secret");vi.stubEnv("TEAM_ACCESS_KEY","fixture-team-access-key-long-enough");});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(){
  const runtime=createSheetRuntime({Companies:[{slug:"acme",name:"Acme"}],Profiles:[{slug:"acme",notes:"Before",version:"v1"}],Weights:configToRows(config as ScoringConfig)});
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>new Response(JSON.stringify(runtime.call(JSON.parse(String(init?.body))))));
  vi.stubGlobal("fetch",fetcher);return{runtime,fetcher};
}
describe("private server cache",()=>{
  it("serves public reads without a cookie and rejects anonymous writes in view-only mode",async()=>{
    const {fetcher}=setup();vi.stubEnv("WORKSPACE_ACCESS","public-read");
    expect((await getAppData()).companies[0].name).toBe("Acme");
    const response=await POST(new Request("https://fixture.example/api/workspace",{method:"POST",headers:{origin:"https://fixture.example"},body:JSON.stringify({operations:[{tab:"Profiles",key:"acme",row:{slug:"acme",notes:"Unauthorized"}}]})}));
    expect(response.status).toBe(403);expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("coalesces simultaneous misses, reuses the server cache, and sets a 60-second lifetime",async()=>{
    const {fetcher}=setup();await Promise.all([sharedCatalog(config as ScoringConfig),sharedCatalog(config as ScoringConfig)]);
    await sharedCatalog(config as ScoringConfig);expect(fetcher).toHaveBeenCalledTimes(1);expect(state.options[0].revalidate).toBe(60);
  });
  it("does not cache failures and allows the next request to retry",async()=>{
    let tries=0;const work=()=>{tries++;return tries===1?Promise.reject(new Error("Offline")):Promise.resolve("Online");};
    await expect(coalesce("failure",work)).rejects.toThrow("Offline");await expect(coalesce("failure",work)).resolves.toBe("Online");
  });
  it("keeps cache entries separate when storage credentials change",async()=>{
    const {fetcher}=setup();await sharedCatalog(config as ScoringConfig);vi.stubEnv("SHEET_WEBHOOK_URL","https://another.example/script");await sharedCatalog(config as ScoringConfig);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("checks the session before serving even a warm private cache",async()=>{
    const {fetcher}=setup();await sharedCatalog(config as ScoringConfig);
    await expect(getAppData()).rejects.toThrow("team session");expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("invalidates cached inputs only after an acknowledged save",async()=>{
    const {fetcher}=setup();state.cookie=createSession();expect((await sharedCatalog(config as ScoringConfig)).companies[0].research.notes).toBe("Before");
    const response=await POST(new Request("https://fixture.example/api/workspace",{method:"POST",headers:{origin:"https://fixture.example","Content-Type":"application/json"},body:JSON.stringify({operations:[{tab:"Profiles",key:"acme",expectedVersion:"v1",row:{slug:"acme",notes:"After"}}]})}));
    expect(response.status).toBe(200);expect((await sharedCatalog(config as ScoringConfig)).companies[0].research.notes).toBe("After");expect(fetcher).toHaveBeenCalledTimes(3);
    invalidateSheetData();await sharedCatalog(config as ScoringConfig);expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
