import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAuthRedirect, authCallbackUrl} from '../src/lib/auth/redirects.ts';
import {createLoader} from './helpers/react-loader.mjs';
const {requestRecovery,changeRecoveredPassword,validNewPassword}=await createLoader()('lib/auth/password-recovery.ts');

for(const path of ['https://evil.example','//evil.example','/es/../admin','/es/%2f%2fevil','/es/\\evil','/en/panel','/es/ingresar','/es/registro','/es/recuperar/actualizar','/es/panel?next=https://evil','/es/./panel','/es/panel\n']) {
  test(`redirect inseguro/bucle rechazado: ${JSON.stringify(path)}`,()=>assert.equal(safeAuthRedirect(path,'es'),undefined));
}
test('redirect de rol sigue interno; callback usa locale y destino fijo',()=>{
  assert.equal(safeAuthRedirect('/es/panel/clientes','es'),'/es/panel/clientes');
  assert.equal(safeAuthRedirect('/en/mi-cuenta','en'),'/en/mi-cuenta');
  const url=new URL(authCallbackUrl('https://strong.example','en','recovery'));
  assert.equal(url.origin,'https://strong.example');assert.equal(url.pathname,'/api/auth/callback');assert.equal(url.searchParams.get('locale'),'en');
});
test('contraseña nueva conserva espacios y acota longitud',()=>{
  for(const password of ['','short',' '.repeat(12),'x'.repeat(129)])assert.equal(validNewPassword(password),false);
  assert.equal(validNewPassword('  example-pass  '),true);
  assert.equal(validNewPassword('x'.repeat(128)),true);
});
test('recuperación envía SDK real boundary, sin informar existencia; fallas no simulan envío',async()=>{
  let calls=0;
  const client={auth:{resetPasswordForEmail:async(email,options)=>{
    calls++;assert.equal(email,'example@test.invalid');assert.match(options.redirectTo,/locale=en&flow=recovery/);return {error:null};
  }}};
  assert.equal(await requestRecovery(client,' example@test.invalid ','https://strong.example','en'),'sent');
  assert.equal(calls,1);
  assert.equal(await requestRecovery(client,'bad','https://strong.example','en'),'invalid');assert.equal(calls,1);
  client.auth.resetPasswordForEmail=async()=>({error:{message:'private provider detail'}});
  assert.equal(await requestRecovery(client,'example@test.invalid','https://strong.example','es'),'error');
  client.auth.resetPasswordForEmail=async()=>{throw Error('network');};
  assert.equal(await requestRecovery(client,'example@test.invalid','https://strong.example','es'),'error');
});
function boundary(options={}) {
  const calls={update:0,logout:0};
  const user={id:options.id??'expected',factors:options.factors??[]};
  const client={auth:{
    getUser:async()=>({data:{user:options.missing?null:user},error:options.authError??null}),
    mfa:{getAuthenticatorAssuranceLevel:async()=>({data:options.aal??{currentLevel:'aal1',nextLevel:'aal1'},error:options.aalError??null})},
    updateUser:async(data)=>{calls.update++;assert.deepEqual(data,{password:'example-new-password'});if(options.updateThrow)throw Error('response lost');return {data:{user:options.noConfirmation?null:user},error:options.updateError??null};},
    signOut:async(optionsArg)=>{calls.logout++;assert.equal(optionsArg.scope,'global');if(options.logoutThrow)throw Error('network');return {error:options.logoutError??null};},
  }};return {client,calls};
}
for(const [name,opts,result] of [
  ['sesión expirada',{missing:true},'auth'],['identidad cambió en otra pestaña',{id:'different'},'auth'],
  ['Auth error',{authError:{}},'auth'],['assurance ilegible',{aalError:{}},'error'],
  ['MFA requerido',{aal:{currentLevel:'aal1',nextLevel:'aal2'}},'mfa'],
  ['factor verificado aunque JWT viejo',{factors:[{status:'verified'}]},'mfa'],
])test(`no intentar cambio: ${name}`,async()=>{
  const {client,calls}=boundary(opts);assert.equal(await changeRecoveredPassword(client,'expected','example-new-password'),result);assert.deepEqual(calls,{update:0,logout:0});
});
for(const opts of [{updateError:{}},{updateThrow:true},{noConfirmation:true}])test(`no dar éxito ni logout sin confirmación: ${JSON.stringify(opts)}`,async()=>{
  const {client,calls}=boundary(opts);assert.equal(await changeRecoveredPassword(client,'expected','example-new-password'),'error');assert.deepEqual(calls,{update:1,logout:0});
});
for(const opts of [{},{aal:{currentLevel:'aal2',nextLevel:'aal2'},factors:[{status:'verified'}]},{logoutError:{}},{logoutThrow:true}])test(`resultado confirmado distingue cierre: ${JSON.stringify(opts)}`,async()=>{
  const {client,calls}=boundary(opts);assert.equal(await changeRecoveredPassword(client,'expected','example-new-password'),opts.logoutError||opts.logoutThrow?'changed_logout_failed':'changed');assert.deepEqual(calls,{update:1,logout:1});
});
test('contraseña inválida no toca el SDK',async()=>{
  assert.equal(await changeRecoveredPassword({},'expected','short'),'invalid');
});

const loadCallback=(configured=true)=>createLoader({
  '@/lib/supabase/env':`export const isSupabaseConfigured=${configured};`,
  '@/lib/supabase/server':'export const getSupabaseServerClient=()=>globalThis.__callbackClient;',
})('app/api/auth/callback/route.ts');
const {GET}=await loadCallback();
for(const query of ['','?code=x&flow=evil','?error=access_denied&flow=recovery','?code=x&code=y&flow=recovery','?flow=recovery&code='+ 'x'.repeat(4097)])test(`callback inválido no consulta SDK (${query.length})`,async()=>{
  globalThis.__callbackClient=null;
  const response=await GET(new Request('https://untrusted.example/api/auth/callback'+query));
  assert.equal(response.status,303);assert.match(response.headers.get('location'),/^\/es\/(ingresar|recuperar)\?error=link$/);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});
for(const flow of ['signup','recovery'])test(`callback ${flow}: código intercambiado, identidad verificada y next externo ignorado`,async()=>{
  const calls=[];
  globalThis.__callbackClient={auth:{
    exchangeCodeForSession:async code=>{calls.push('exchange');assert.equal(code,'EXAMPLE_CODE');return {data:{session:{user:{id:'expected'}}},error:null};},
    getUser:async()=>{calls.push('verify');return {data:{user:{id:'expected'}},error:null};},
  }};
  const response=await GET(new Request(`https://untrusted.example/api/auth/callback?code=EXAMPLE_CODE&flow=${flow}&locale=en&next=https://evil.example`));
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),flow==='signup'?'/en/mi-cuenta':'/en/recuperar/actualizar');assert.deepEqual(calls,['exchange','verify']);
});
for(const failure of ['exchange','verify','identity','throw'])test(`callback ${failure} no anuncia acceso`,async()=>{
  globalThis.__callbackClient={auth:{
    exchangeCodeForSession:async()=>{if(failure==='throw')throw Error('EXAMPLE_PRIVATE');return {data:{session:{user:{id:'expected'}}},error:failure==='exchange'?{}:null};},
    getUser:async()=>({data:{user:{id:failure==='identity'?'other':'expected'}},error:failure==='verify'?{}:null}),
  }};
  const response=await GET(new Request('https://strong.example/api/auth/callback?code=x&flow=recovery'));
  assert.equal(response.headers.get('location'),'/es/recuperar?error=link');
});
test('callback sin configuración responde503 sin SDK',async()=>{
  const {GET:disabled}=await loadCallback(false);globalThis.__callbackClient=null;
  const response=await disabled(new Request('https://strong.example/api/auth/callback?code=x&flow=recovery'));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'CONFIGURATION_UNAVAILABLE');
});

test('callback con SDK/SSR reales intercambia PKCE, escribe cookies y rechaza replay sin verificador',async()=>{
  const originalFetch=globalThis.fetch;
  const id='00000000-0000-4000-8000-000000000001';
  const user={id,aud:'authenticated',role:'authenticated',email:'example@test.invalid',created_at:'2026-10-01T00:00:00Z'};
  const now=Math.floor(Date.now()/1000);
  const token=[{alg:'HS256',typ:'JWT'},{sub:id,exp:now+3600,iat:now,role:'authenticated',aal:'aal1'}].map(p=>Buffer.from(JSON.stringify(p)).toString('base64url')).join('.')+'.EXAMPLE_SIGNATURE';
  const jar=new Map();
  let challenge=null,requests=0;
  globalThis.__callbackCookies={
    getAll:()=>[...jar].map(([name,value])=>({name,value})),
    set:(name,value,options)=>{if(options?.maxAge===0)jar.delete(name);else jar.set(name,value);},
  };
  let exchanges=0,verifications=0;
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/recover')){
      requests++;const body=JSON.parse(options.body);assert.equal(body.email,'example@test.invalid');
      assert.equal(body.code_challenge_method,'s256');challenge=body.code_challenge;
      assert.equal(new URL(url).searchParams.get('redirect_to'),authCallbackUrl('https://strong.example','es','recovery'));
      return Response.json({});
    }
    if(String(url).includes('/token?grant_type=pkce')){
      exchanges++;const body=JSON.parse(options.body);const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);assert.equal(body.auth_code,'EXAMPLE_CODE');
      return Response.json({access_token:token,refresh_token:'EXAMPLE_REFRESH',expires_in:3600,token_type:'bearer',user});
    }
    assert.ok(String(url).endsWith('/user'));verifications++;
    assert.equal(new Headers(options.headers).get('authorization'),`Bearer ${token}`);return Response.json(user);
  };
  try {
    const {createBrowserClient}=await import('@supabase/ssr');
    const browser=createBrowserClient('https://test-project.supabase.co','EXAMPLE_PUBLIC_KEY',{
      isSingleton:false,auth:{autoRefreshToken:false,detectSessionInUrl:false},
      cookies:{getAll:()=>globalThis.__callbackCookies.getAll(),setAll:items=>items.forEach(({name,value,options})=>globalThis.__callbackCookies.set(name,value,options))},
    });
    assert.equal(await requestRecovery(browser,'example@test.invalid','https://strong.example','es'),'sent');
    assert.equal(requests,1);assert.ok(jar.has('sb-test-project-auth-token-code-verifier'));
    const env='export const isSupabaseConfigured=true;export const SUPABASE_URL="https://test-project.supabase.co";export const SUPABASE_ANON_KEY="EXAMPLE_PUBLIC_KEY";export const assertConnectionAvailable=()=>{};';
    const {GET:real}=await createLoader({
      'server-only':'export {};',
      'next/headers':'export const cookies=async()=>globalThis.__callbackCookies;',
      './env':env,'@/lib/supabase/env':env,
    })('app/api/auth/callback/route.ts');
    const request=()=>new Request('https://strong.example/api/auth/callback?code=EXAMPLE_CODE&flow=recovery');
    const response=await real(request());
    assert.equal(response.headers.get('location'),'/es/recuperar/actualizar');
    assert.equal(exchanges,1);assert.ok(verifications>=1);
    assert.equal(jar.has('sb-test-project-auth-token-code-verifier'),false);
    assert.ok([...jar.keys()].some(key=>key.startsWith('sb-test-project-auth-token')));
    const replay=await real(request());assert.equal(replay.headers.get('location'),'/es/recuperar?error=link');assert.equal(exchanges,1);
  } finally {globalThis.fetch=originalFetch;delete globalThis.__callbackCookies;}
});
