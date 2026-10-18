import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";
const { POST } = await createLoader({
  "@/lib/data/queries": "export const getCurrentUser=async()=>({id:'test'});export const getMyBookings=async()=>[];",
  "@/lib/supabase/env": "export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;",
  "@/lib/supabase/server": "export const getSupabaseServerClient=async()=>globalThis.__bookingWriteDb;",
})("app/api/bookings/route.ts");
function setup(data) {
  globalThis.__bookingWriteDb = {rpc(name, args) {
    assert.equal(name,"book_session");
    assert.deepEqual(args,{p_session_id:"test-session"});
    return Promise.resolve({data,error:null});
  }};
}
const request = () => new Request("https://strong.test/api/bookings", {
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:"test-session"}),
});
for (const data of [null, {}, "uuid", {id:"b"}, {id:"b",session_id:"other",status:"confirmed"}, {id:"b",session_id:"test-session",status:"cancelled"}])
  test(`API reserva: RPC incompleto/incoherente no es éxito ${JSON.stringify(data)}`, async () => {
    setup(data);
    const r=await POST(request());
    assert.equal(r.status,503);
    assert.equal(r.headers.get("cache-control"),"private, no-store");
    assert.deepEqual(await r.json(),{error:"UNCONFIRMED"});
  });
test("API reserva: contrato válido conserva referencia y sesión", async () => {
  const data={id:"b",session_id:"test-session",status:"confirmed"};
  setup(data);
  const r=await POST(request());
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,booking:data});
});
