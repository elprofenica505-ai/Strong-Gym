import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createLoader } from './helpers/react-loader.mjs';
const { AppProvider, useApp }=await createLoader({
  'next/navigation':'export const useRouter=()=>({refresh(){}});',
  '@/lib/supabase/client':'export const getSupabaseBrowserClient=()=>globalThis.__authBoundary;',
})('components/providers/app-provider.tsx');

test('demo de sólo lectura: no restaura sesiones ni almacena contraseñas; limpia sólo su almacenamiento legado',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://strong.example'});
  const previous={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const storage=dom.window.localStorage;
  const bannerKey=readFileSync(new URL('../src/components/layout/demo-banner.tsx',import.meta.url),'utf8')
    .match(/const STORAGE_KEY = "([^"]+)"/)[1];
  storage.setItem(bannerKey,'1');
  storage.setItem('strong-gym:demo-users',JSON.stringify([{id:'demo-admin',role:'admin',password:'EXAMPLE_OLD'}]));
  storage.setItem('strong-gym:demo-session','demo-admin');storage.setItem('strong-gym:demo-bookings:demo-admin','[]');
  storage.setItem('strong-gym:finance:pending','EXAMPLE_PENDING');storage.setItem('sb-project-auth-token','EXAMPLE_SESSION');
  let ctx;
  function Probe(){ctx=useApp();return null;}
  const root=createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async()=>{root.render(React.createElement(AppProvider,{initialUser:{id:'demo-admin',role:'admin'},isDemo:true},React.createElement(Probe)));});
    assert.equal(ctx.user,null);
    assert.equal(ctx.hydrated,true);
    assert.equal(storage.getItem('strong-gym:demo-users'),null);
    assert.equal(storage.getItem('strong-gym:demo-session'),null);
    assert.equal(storage.getItem('strong-gym:demo-bookings:demo-admin'),null);
    // El cierre del aviso de demo no es una credencial legada: debe sobrevivir.
    assert.equal(storage.getItem(bannerKey),'1');
    assert.equal(storage.getItem('strong-gym:finance:pending'),'EXAMPLE_PENDING');
    assert.equal(storage.getItem('sb-project-auth-token'),'EXAMPLE_SESSION');
    let result;
    await act(async()=>{result=await ctx.signUp({fullName:'EXAMPLE',email:'example@test.invalid',password:'EXAMPLE_NEW',birthDate:'1990-03-10',legalAccepted:true});});
    assert.equal(result.ok,false);
    await act(async()=>{result=await ctx.signIn('example@test.invalid','EXAMPLE_NEW');});
    assert.equal(result.ok,false);
    assert.equal(ctx.user,null);
    assert.equal((await ctx.book('example')).ok,false);
    assert.equal(await ctx.updateProfile({fullName:'example'}),false);
    assert.doesNotMatch(JSON.stringify({...storage}),/EXAMPLE_NEW|EXAMPLE_OLD/);
    let calls=0;
    globalThis.__authBoundary={auth:{signInWithPassword:async({email,password})=>{
      calls++;assert.equal(email,'example@test.invalid');assert.equal(password,'EXAMPLE_CONNECTED');return {error:{message:'invalid credentials'}};
    }}};
    await act(async()=>{root.render(React.createElement(AppProvider,{initialUser:null,isDemo:false},React.createElement(Probe)));});
    await act(async()=>{result=await ctx.signIn('example@test.invalid','EXAMPLE_CONNECTED');});
    assert.equal(calls,1);assert.equal(result.ok,false);assert.equal(ctx.isDemo,false);assert.equal(ctx.user,null);
    assert.doesNotMatch(JSON.stringify({...storage}),/EXAMPLE_CONNECTED/);
    globalThis.__authBoundary={auth:{signInWithPassword:async()=>{throw Error('EXAMPLE_NETWORK');}}};
    await act(async()=>{result=await ctx.signIn('example@test.invalid','EXAMPLE_CONNECTED');});
    assert.equal(result.ok,false);assert.equal(ctx.isDemo,false);assert.equal(ctx.user,null);
    let signups=0;dom.window.history.replaceState({},'', '/en/registro');
    globalThis.__authBoundary={auth:{signUp:async(payload)=>{
      signups++;assert.equal(payload.password,'EXAMPLE_NEW_PASSWORD');
      assert.equal(payload.options.emailRedirectTo,'https://strong.example/api/auth/callback?locale=en&flow=signup');
      assert.deepEqual(Object.keys(payload.options.data).sort(),['birth_date','full_name','legal_accepted','phone']);assert.equal(payload.options.data.legal_accepted.version,'2026-10-21-borrador');assert.equal(payload.options.data.birth_date,'1990-03-10');return {data:{session:null},error:null};
    }}};
    await act(async()=>{result=await ctx.signUp({fullName:'EXAMPLE',email:'example@test.invalid',password:'short',birthDate:'1990-03-10',legalAccepted:true});});
    assert.equal(result.ok,false);assert.equal(signups,0);
    await act(async()=>{result=await ctx.signUp({fullName:' EXAMPLE ',email:'example@test.invalid',password:'EXAMPLE_NEW_PASSWORD',birthDate:'1990-03-10',legalAccepted:true});});
    assert.equal(result.ok,true);assert.equal(result.needsConfirmation,true);assert.equal(signups,1);
    for(const [providerError,key] of [[{status:429,code:'over_email_send_rate_limit'},'rateLimited'],[{code:'email_address_not_authorized'},'deliveryUnavailable']]) {
      globalThis.__authBoundary={auth:{
        signUp:async()=>({data:null,error:{...providerError,message:'EXAMPLE_PRIVATE_PROVIDER'}}),
        signInWithPassword:async()=>({data:null,error:{...providerError,message:'EXAMPLE_PRIVATE_PROVIDER'}}),
      }};
      await act(async()=>{result=await ctx.signUp({fullName:'EXAMPLE',email:'example@test.invalid',password:'EXAMPLE_NEW_PASSWORD',birthDate:'1990-03-10',legalAccepted:true});});
      assert.equal(result.ok,false);assert.equal(result.error,key);assert.equal(ctx.user,null);
      await act(async()=>{result=await ctx.signIn('example@test.invalid','EXAMPLE_NEW_PASSWORD');});
      assert.equal(result.ok,false);assert.equal(result.error,key);assert.equal(ctx.user,null);
    }
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    globalThis.window=previous.window;globalThis.document=previous.document;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;
    delete globalThis.__authBoundary;
  }
});

test('bundle fuente sin cuenta admin demo, persistencia de contraseñas ni formularios demo',()=>{
  const provider=readFileSync(new URL('../src/components/providers/app-provider.tsx',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../src/components/auth/auth-form.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(provider,/SEED_ADMIN|admin123|DemoStoredUser|localStorage\.setItem|writeJSON/);
  assert.doesNotMatch(auth,/admin123|admin@stronggym/);
  assert.match(auth,/if \(isDemo\) return/);
});

test('formulario demo real no solicita correo ni contraseña',async()=>{
  const {renderToStaticMarkup}=await import('react-dom/server');
  const {AuthForm}=await createLoader({
    'next/navigation':'export const useRouter=()=>({refresh(){}});',
    '@/components/providers/app-provider':'export const useApp=()=>({isDemo:true,authLoading:false});',
    '@/components/providers/dictionary-provider':'export const useDictionary=()=>({locale:"es",dict:{}});',
  })('components/auth/auth-form.tsx');
  for(const mode of ['login','register']) {
    const html=renderToStaticMarkup(React.createElement(AuthForm,{mode}));
    assert.match(html,/sólo lectura/);assert.doesNotMatch(html,/<form|<input|admin123/);
  }
});

test('getters reales sin configuración en producción fallan antes de SDK/cookies',async()=>{
  const names=['NODE_ENV','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_ENABLE_DEMO'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_PUBLIC_ENABLE_DEMO:'true'});
  globalThis.__configurationCalls=0;
  try {
    const loader=createLoader({
      'server-only':'export {};',
      'next/headers':'export const cookies=()=>{globalThis.__configurationCalls++;throw Error("cookies must not run");};',
      '@supabase/ssr':'export const createBrowserClient=()=>{globalThis.__configurationCalls++;throw Error("SDK must not run");}; export const createServerClient=createBrowserClient;',
    });
    const browser=await loader('lib/supabase/client.ts');
    const server=await loader('lib/supabase/server.ts');
    assert.throws(()=>browser.getSupabaseBrowserClient(),/CONFIGURATION_UNAVAILABLE/);
    await assert.rejects(server.getSupabaseServerClient(),/CONFIGURATION_UNAVAILABLE/);
    assert.equal(globalThis.__configurationCalls,0);
  } finally {
    for(const name of names) if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];
    delete globalThis.__configurationCalls;
  }
});

test('logout real fallido conserva usuario y avisa; éxito confirmado limpia estado',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://strong.example/es/mi-cuenta'});
  const previous={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT,fetch:globalThis.fetch};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.fetch=async()=>Response.json({bookings:[]});dom.window.setTimeout=()=>0;
  globalThis.__authBoundary={auth:{signOut:async()=>({error:{message:'EXAMPLE_PRIVATE'}})}};
  let ctx;function Probe(){ctx=useApp();return null;}
  const root=createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(AppProvider,{initialUser:{id:'expected',role:'member'},isDemo:false},React.createElement(Probe))));
    await act(async()=>ctx.signOut());
    assert.equal(ctx.user.id,'expected');assert.match(ctx.toasts.at(-1).message,/No pudimos confirmar/);
    globalThis.__authBoundary={auth:{signOut:async()=>({error:null})}};
    await act(async()=>ctx.signOut());assert.equal(ctx.user,null);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    globalThis.window=previous.window;globalThis.document=previous.document;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;globalThis.fetch=previous.fetch;delete globalThis.__authBoundary;
  }
});
