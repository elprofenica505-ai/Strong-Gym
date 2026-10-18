import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {createLoader} from './helpers/react-loader.mjs';
const es=(await createLoader()('i18n/dictionaries/es.ts')).default;
const {RecoveryForm}=await createLoader({
  'next/link':`import React from ${JSON.stringify(import.meta.resolve('react'))};export default function Link(props){return React.createElement('a',props);}`,
  'next/navigation':'export const useRouter=()=>({refresh(){}});',
  '@/components/providers/app-provider':'export const useApp=()=>({isDemo:globalThis.__recoveryDemo??false});',
  '@/components/providers/dictionary-provider':'export const useDictionary=()=>({dict:globalThis.__recoveryDictionary,locale:"es"});',
  '@/lib/supabase/client':'export const getSupabaseBrowserClient=()=>globalThis.__recoveryClient;',
})('components/auth/recovery-form.tsx');
globalThis.__recoveryDictionary=es;

test('sin identidad verificada o en demo no hay inputs de contraseña ni envíos',()=>{
  for(const mode of ['request','update']) {
    globalThis.__recoveryDemo=true;
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(RecoveryForm,{mode})),/<form|<input/);
  }
  globalThis.__recoveryDemo=false;
  const html=renderToStaticMarkup(React.createElement(RecoveryForm,{mode:'update'}));
  assert.doesNotMatch(html,/<form|<input/);assert.match(html,/recuperar/);
});

async function withForm(props,run,Component=RecoveryForm) {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://strong.example/es/recuperar'});
  const saved=new Map();
  for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})) {
    saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  }
  const root=createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Component,props)));
    await run(dom.window.document,()=>new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [name,descriptor] of saved) if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
    delete globalThis.__recoveryClient;
  }
}
test('solicitar enlace: doble submit invoca SDK una vez; confirmación neutral y sin correo en DOM',async()=>{
  let resolve,calls=0;
  const promise=new Promise(r=>{resolve=r;});
  globalThis.__recoveryClient={auth:{resetPasswordForEmail:async()=>{calls++;return promise;}}};
  await withForm({mode:'request'},async(doc,event)=>{
    const form=doc.querySelector('form');form.querySelector('input').value='example@test.invalid';
    await act(async()=>{form.dispatchEvent(event());form.dispatchEvent(event());});
    assert.equal(calls,1);assert.equal(doc.querySelector('button').disabled,true);
    await act(async()=>{resolve({error:null});});
    assert.match(doc.body.textContent,/Si existe una cuenta/);assert.doesNotMatch(doc.body.textContent,/example@test.invalid/);assert.equal(doc.querySelector('form'),null);
  });
});
test('fallo de envío no muestra confirmación y permite reintentar',async()=>{
  globalThis.__recoveryClient={auth:{resetPasswordForEmail:async()=>({error:{message:'EXAMPLE_PRIVATE'}})}};
  await withForm({mode:'request'},async(doc,event)=>{
    doc.querySelector('input').value='example@test.invalid';
    await act(async()=>doc.querySelector('form').dispatchEvent(event()));
    assert.match(doc.querySelector('[role=alert]').textContent,/No pudimos/);
    assert.doesNotMatch(doc.body.textContent,/EXAMPLE_PRIVATE|Si existe una cuenta/);assert.equal(doc.querySelector('button').disabled,false);
  });
});
test('contraseñas distintas se rechazan sin SDK',async()=>{
  globalThis.__recoveryClient=null;
  await withForm({mode:'update',expectedUserId:'expected'},async(doc,event)=>{
    doc.querySelector('[name=password]').value='example-new-password';doc.querySelector('[name=confirmPassword]').value='example-other-password';
    await act(async()=>doc.querySelector('form').dispatchEvent(event()));
    assert.match(doc.querySelector('[role=alert]').textContent,/coincidir/);
  });
});
for(const failed of [false,true])test(`cambio confirmado: formulario retirado, cierre fallido=${failed} no niega guardado`,async()=>{
  let calls=0;
  globalThis.__recoveryClient={auth:{
    getUser:async()=>({data:{user:{id:'expected'}},error:null}),
    mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})},
    updateUser:async()=>{calls++;return {data:{user:{id:'expected'}},error:null};},
    signOut:async()=>({error:failed?{}:null}),
  }};
  await withForm({mode:'update',expectedUserId:'expected',email:'example@test.invalid'},async(doc,event)=>{
    doc.querySelector('[name=password]').value='example-new-password';doc.querySelector('[name=confirmPassword]').value='example-new-password';
    const form=doc.querySelector('form');
    await act(async()=>{form.dispatchEvent(event());form.dispatchEvent(event());});
    assert.equal(calls,1);assert.equal(doc.querySelector('form'),null);assert.equal(doc.querySelector('input'),null);
    assert.match(doc.body.textContent,/Contraseña actualizada/);
    assert.equal(!!doc.querySelector('[role=alert]'),failed);
    if(failed)assert.match(doc.body.textContent,/contraseña sí cambió/);
  });
});

const {AuthForm}=await createLoader({
  'next/link':`import React from ${JSON.stringify(import.meta.resolve('react'))};export default function Link(props){return React.createElement('a',props);}`,
  'next/navigation':'export const useRouter=()=>({refresh(){},replace(){}});',
  '@/components/providers/app-provider':'export const useApp=()=>({isDemo:false,authLoading:false,signIn:globalThis.__loginBoundary,signUp:globalThis.__loginBoundary});',
  '@/components/providers/dictionary-provider':'export const useDictionary=()=>({dict:globalThis.__recoveryDictionary,locale:"es"});',
})('components/auth/auth-form.tsx');
for(const mode of ['login','register'])test(`${mode}: contraseña antigua corta sólo se acepta para intentar login`,async()=>{
  let calls=0;globalThis.__loginBoundary=async()=>{calls++;return {ok:false,error:'invalidCredentials'};};
  try {
    await withForm({mode},async(doc,event)=>{
      doc.querySelector('[name=email]').value='example@test.invalid';
      doc.querySelector('[name=password]').value='old123';
      if(mode==='register') {doc.querySelector('[name=fullName]').value='EXAMPLE';doc.querySelector('[name=confirmPassword]').value='old123';}
      await act(async()=>doc.querySelector('form').dispatchEvent(event()));
      assert.equal(calls,mode==='login'?1:0);
      assert.match(doc.querySelector('[role=alert]').textContent,mode==='login'?/incorrectos/:/12 y 128/);
    },AuthForm);
  } finally {delete globalThis.__loginBoundary;}
});
