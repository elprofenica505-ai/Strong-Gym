import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppMode, isPublicSupabaseKey } from '../src/lib/supabase/config-policy.ts';
const jwt=role=>`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({role})).toString('base64url')}.testsignature`;
const key=jwt('anon');
for(const nodeEnv of ['production','development','test',undefined]) {
  test(`${nodeEnv}: ausencia de variables nunca activa demo automáticamente`,()=>{
    assert.equal(resolveAppMode({nodeEnv}),'unavailable');
  });
  test(`${nodeEnv}: configuración pública completa usa Supabase incluso con flag demo`,()=>{
    assert.equal(resolveAppMode({nodeEnv,url:'https://project.supabase.co',key,enableDemo:'true'}),'supabase');
  });
}
test('demo requiere next dev + opt-in + ambas variables ausentes',()=>{
  assert.equal(resolveAppMode({nodeEnv:'development',enableDemo:'true'}),'demo');
  for(const nodeEnv of ['production','test',undefined]) assert.equal(resolveAppMode({nodeEnv,enableDemo:'true'}),'unavailable');
  assert.equal(resolveAppMode({nodeEnv:'development',enableDemo:'true',url:'https://project.supabase.co'}),'unavailable');
});
for(const badKey of [jwt('service_role'),jwt('authenticated'),'sb_secret_EXAMPLE_NOT_A_REAL_KEY','random-text-that-is-long-enough','a.b.c','',key+'.extra']) {
  test(`clave no pública rechazada (${badKey.slice(0,8)})`,()=>{
    assert.equal(isPublicSupabaseKey(badKey),false);
    assert.equal(resolveAppMode({nodeEnv:'production',url:'https://project.supabase.co',key:badKey}),'unavailable');
  });
}
for(const url of ['http://project.supabase.co','javascript:alert(1)','https://user:pass@project.supabase.co','https://project.supabase.co/rest','https://project.supabase.co/?key=secret','https://project.supabase.co/#secret','not-a-url','http://localhost:54321','http://127.0.0.1:54321']) {
  test(`producción rechaza transporte/URL inválida (${url.split(':')[0]})`,()=>assert.equal(resolveAppMode({nodeEnv:'production',url,key}),'unavailable'));
}
test('Supabase local permite HTTP sólo fuera de producción; clave publishable válida',()=>{
  assert.equal(resolveAppMode({nodeEnv:'development',url:'http://127.0.0.1:54321',key}),'supabase');
  assert.equal(resolveAppMode({nodeEnv:'production',url:'https://custom.example',key:'sb_publishable_EXAMPLE_PUBLIC_TEST_KEY_123456'}),'supabase');
});

test('build rechaza clave privada antes de compilar y no muestra su valor',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const secret='sb_secret_EXAMPLE_BUILD_REJECTION_NOT_A_REAL_KEY';
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'build'],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),
    env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:secret},
    encoding:'utf8',timeout:30000,maxBuffer:262144,
  });
  assert.notEqual(result.status,0);
  const output=(result.stdout??'')+(result.stderr??'');
  assert.match(output,/Configuración Supabase inválida/);
  assert.ok(!output.includes(secret));
  assert.doesNotMatch(output,/Compiled successfully/);
});
