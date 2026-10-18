import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {JSDOM} from 'jsdom';
import {createLoader} from './helpers/react-loader.mjs';
import {debtIntentSchema,debtReceiptSchema,matchesDebtReceipt} from '../src/lib/finance/debts.ts';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://strong.test/es/panel/clientes'});
for(const key of ['window','document','navigator','HTMLElement','Node','FormData','sessionStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.self=dom.window;
const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react/pure.js');
const load=createLoader({
  '@/lib/data/queries':'export const getCurrentUser=async()=>globalThis.__debtTest.user;',
  '@/lib/supabase/server':'export const getSupabaseServerClient=async()=>globalThis.__debtTest.db;',
  '@/lib/supabase/env':'export const isSupabaseConfigured=true;export const DEMO_MODE=false;export const CONFIGURATION_UNAVAILABLE=false;',
  'next/navigation':'export const useRouter=()=>({refresh(){}});',
});
const {GET,POST}=await load('app/api/admin/debts/route.ts');
const {DebtForm}=await load('components/crm/debt-form.tsx');
const originalFetch=globalThis.fetch,originalConfirm=window.confirm;
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;window.confirm=originalConfirm;sessionStorage.clear();});
const client='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333';
const balances={credit_nio:7,credit_usd:3,debt_nio:100,debt_usd:20};
const zero={credit_nio:0,credit_usd:0,debt_nio:0,debt_usd:0};
const intent=(kind='payment')=>({requestId:request,clientId:client,kind,concept:'EJEMPLO deuda',amount:20,currency:'NIO',...(kind==='payment'?{account:'nio',method:'cash',fx:40}:{})});
const receipt=(d=intent(),b=balances)=>({id:'44444444-4444-4444-8444-444444444444',reference:'SD-EJEMPLO',requestId:d.requestId,clientId:d.clientId,kind:d.kind,concept:d.concept,clientName:'Cliente EJEMPLO',actorId:actor,actorName:'Personal EJEMPLO',occurredAt:'2026-10-18T03:00:00Z',amount:d.amount??null,currency:d.currency??null,before:d.kind==='opening'?null:b,after:d.kind==='opening'?d.opening:{...b,debt_nio:b.debt_nio+(d.kind==='charge'?d.amount:-d.amount)},...(d.cashReceived!==undefined?{cashReceived:d.cashReceived,changeGiven:Math.round((d.cashReceived-d.amount)*100)/100}:{}),transactionId:d.kind==='payment'?'55555555-5555-4555-8555-555555555555':null});
const detail=(values=balances)=>({protocol:'debt-v1',clientId:client,clientName:'Cliente EJEMPLO',profileId:actor,source:'profile',balances:values,writesEnabled:true,canOpen:true,cashProtocol:'cash-v1',cashAccounts:['nio'],entries:[]});
const options={protocol:'service-v1',finance_layout:'bank_accounts_split',writes_enabled:true,methods:[{id:'cash',name_es:'Efectivo EJEMPLO',accepts_nio:true,accepts_usd:true}],accounts:[{id:'nio',name:'Caja EJEMPLO',currency:'NIO'}],categories:[]};
const json=(v,status=200)=>Response.json(v,{status});
function reset(role='staff',result=receipt()) {
  let calls=[];
  globalThis.__debtTest={user:role?{id:actor,role}:null,db:{rpc(name,args){calls.push({name,args});return {abortSignal:async()=>({data:result,error:null})};}}};
  return calls;
}
const req=(value,headers={})=>new Request('https://strong.test/api/admin/debts',{method:'POST',headers:{'content-type':'application/json',origin:'https://strong.test',host:'strong.test',...headers},body:JSON.stringify(value)});
for(const role of [null,'member'])test(`API deudas rechaza ${role} antes de RPC`,async()=>{
  const calls=reset(role);assert.equal((await GET(new Request(`https://strong.test/api/admin/debts?client=${client}`))).status,403);assert.equal((await POST(req(intent()))).status,403);assert.equal(calls.length,0);
});
for(const headers of [{origin:'https://other.test'},{origin:'invalid'},{'sec-fetch-site':'cross-site'}])test(`API deudas rechaza origen ${JSON.stringify(headers)}`,async()=>{
  const calls=reset();assert.equal((await POST(req(intent(),headers))).status,403);assert.equal(calls.length,0);
});
test('API envía payload exacto y respuesta privada, sin delegar al cobro por servicio desde HTTP',async()=>{
  const calls=reset();const response=await POST(req(intent()));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(calls[0].name,'finance_debt_record');assert.equal(calls[0].args.p_open,null);assert.equal(calls[0].args.p_kind,'payment');assert.equal(calls[0].args.p_fx,40);
});
for(const invalid of [{...intent(),amount:'20'},{...intent(),amount:0},{...intent(),amount:1.001},{...intent(),currency:'EUR'},{...intent('charge'),fx:40},{kind:'opening',clientId:client,requestId:request,concept:'EJEMPLO',opening:{}}])test(`API valida deuda sin coerción ${JSON.stringify(invalid)}`,async()=>{
  const calls=reset();assert.equal((await POST(req(invalid))).status,422);assert.equal(calls.length,0);
});
for(const corrupt of [null,{}, {...receipt(),requestId:actor},{...receipt(),clientId:actor},{...receipt(),after:{...balances,debt_nio:101}}])test('API no confirma comprobante incoherente '+JSON.stringify(corrupt),async()=>{
  reset('staff',corrupt);assert.equal((await POST(req(intent()))).status,503);
});
test('API GET no entrega otra ficha',async()=>{
  reset('staff',{...detail(),clientId:actor});assert.equal((await GET(new Request(`https://strong.test/api/admin/debts?client=${client}`))).status,503);
});
test('API exceso de abono tiene rechazo explícito',async()=>{
  reset();globalThis.__debtTest.db.rpc=()=>({abortSignal:async()=>({data:null,error:{message:'PAYMENT_EXCEEDS_DEBT'}})});
  const response=await POST(req(intent()));assert.equal(response.status,422);assert.match((await response.json()).error,/supera la deuda/);
});
test('contratos de deuda y apertura exigen campos explícitos',()=>{
  assert.ok(debtIntentSchema.safeParse(intent()).success);assert.ok(debtReceiptSchema.safeParse(receipt()).success);assert.ok(matchesDebtReceipt(receipt(),intent()));
  assert.equal(debtIntentSchema.safeParse({requestId:request,clientId:client,kind:'opening',concept:'EJEMPLO',opening:{...zero,credit_nio:null}}).success,false);
  assert.equal(debtReceiptSchema.safeParse({...receipt(),after:{...balances,debt_nio:80,credit_nio:27}}).success,false);
});
function ui(handler,values=balances) {
  const posts=[];window.confirm=()=>true;
  globalThis.fetch=async(url,init={})=>{
    if(init.method==='POST'){const d=JSON.parse(init.body);posts.push(d);return handler(d);}
    return json(String(url).includes('/api/admin/finance')?options:detail(values));
  };
  render(React.createElement(DebtForm,{clientId:client,locale:'es'}));return posts;
}
async function fill(kind='payment',amount=20) {
  await screen.findByText(/Deuda actual NIO:/);
  fireEvent.change(screen.getByLabelText('Operación'),{target:{value:kind}});
  fireEvent.change(screen.getByLabelText('Importe de deuda o abono'),{target:{value:String(amount)}});
  fireEvent.change(screen.getByLabelText('Motivo de deuda, abono o saldo inicial'),{target:{value:'EJEMPLO deuda'}});
  if(kind==='payment') {
    fireEvent.change(screen.getByLabelText('Método de abono'),{target:{value:'cash'}});
    fireEvent.change(screen.getByLabelText('Cuenta que recibe el abono'),{target:{value:'nio'}});
    fireEvent.change(screen.getByLabelText('Tasa NIO por 1 USD'),{target:{value:'40'}});
  }
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:kind==='payment'?'Registrar abono de deuda':'Registrar deuda manual'}).disabled,false));
}
test('UI no envía excedente ni lo convierte en crédito',async()=>{
  const posts=ui(d=>json(receipt(d)));await fill('payment',120);fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));
  await screen.findByText(/El abono supera la deuda leída/);assert.equal(posts.length,0);
});
test('UI conserva UUID tras respuesta perdida y recupera mismo intento',async()=>{
  let first=true;const posts=ui(d=>{if(first){first=false;throw new TypeError('lost response');}return json(receipt(d));});
  await fill();fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));
  await screen.findByRole('button',{name:'Reintentar la misma operación'});
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:'Reintentar la misma operación'}).disabled,false));
  const stored=JSON.parse(sessionStorage.getItem(`strong-gym:debt-v1:${client}`));assert.equal(stored.requestId,posts[0].requestId);
  fireEvent.click(screen.getByRole('button',{name:'Reintentar la misma operación'}));
  await screen.findByText('Operación confirmada. Referencia: SD-EJEMPLO');assert.deepEqual(posts[0],posts[1]);assert.equal(sessionStorage.getItem(`strong-gym:debt-v1:${client}`),null);
  assert.ok(screen.getByRole('link',{name:'Abrir comprobante del abono'}));
});
test('UI respuesta lenta bloquea doble envío',async()=>{
  let resolve;const posts=ui(()=>new Promise(r=>{resolve=r;}));await fill('charge');const button=screen.getByRole('button',{name:'Registrar deuda manual'});
  fireEvent.click(button);fireEvent.click(button);assert.equal(posts.length,1);assert.equal(screen.getByRole('button',{name:'Confirmando…'}).disabled,true);
  await act(async()=>resolve(json(receipt(posts[0]))));await screen.findByText('Operación confirmada. Referencia: SD-EJEMPLO');
});
test('UI referencia corrupta no genera intento nuevo',async()=>{
  sessionStorage.setItem(`strong-gym:debt-v1:${client}`,'corrupt');const posts=ui(d=>json(receipt(d)));await screen.findByText(/Referencia local ilegible/);
  assert.equal(screen.getByRole('button',{name:'Registrar deuda manual'}).disabled,true);assert.equal(posts.length,0);
});
test('UI apertura no supone cuatro ceros y requiere confirmación',async()=>{
  const posts=ui(d=>json(receipt(d)),null);await screen.findByText(/Sin saldo inicial confirmado/);
  fireEvent.change(screen.getByLabelText('Operación'),{target:{value:'opening'}});
  for(const text of ['Crédito inicial NIO','Crédito inicial USD','Deuda inicial NIO','Deuda inicial USD'])assert.equal(screen.getByLabelText(text).value,'');
  assert.equal(posts.length,0);
});

test('UI apertura requiere importes escritos y confirmación antes de POST',async()=>{
  const posts=ui(d=>json(receipt(d)),null);await screen.findByText(/Sin saldo inicial confirmado/);
  fireEvent.change(screen.getByLabelText('Operación'),{target:{value:'opening'}});
  for(const label of ['Crédito inicial NIO','Crédito inicial USD','Deuda inicial NIO','Deuda inicial USD'])fireEvent.change(screen.getByLabelText(label),{target:{value:'0'}});
  fireEvent.change(screen.getByLabelText('Motivo de deuda, abono o saldo inicial'),{target:{value:'EJEMPLO apertura explícita'}});
  fireEvent.click(screen.getByRole('checkbox'));
  window.confirm=()=>false;fireEvent.click(screen.getByRole('button',{name:'Registrar saldo inicial'}));assert.equal(posts.length,0);
  window.confirm=()=>true;fireEvent.click(screen.getByRole('button',{name:'Registrar saldo inicial'}));
  await screen.findByText('Operación confirmada. Referencia: SD-EJEMPLO');assert.equal(posts.length,1);assert.deepEqual(posts[0].opening,zero);
});
test('UI no reutiliza comprobante anterior durante un intento nuevo incierto',async()=>{
  let fail=false;const posts=ui(d=>{if(fail)throw new TypeError('lost');return json(receipt(d));});
  await fill();fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));
  await screen.findByRole('link',{name:'Abrir comprobante del abono'});
  fail=true;await fill('charge');fireEvent.click(screen.getByRole('button',{name:'Registrar deuda manual'}));
  await screen.findByRole('button',{name:'Reintentar la misma operación'});
  assert.equal(screen.queryByRole('link',{name:'Abrir comprobante del abono'}),null);assert.notEqual(posts[0].requestId,posts[1].requestId);
});

test('UI descartar referencia corrupta requiere revisión explícita, no cobra ni modifica deuda',async()=>{
  sessionStorage.setItem(`strong-gym:debt-v1:${client}`,'corrupt');const posts=ui(d=>json(receipt(d)));await screen.findByText(/Referencia local ilegible/);
  window.confirm=()=>false;fireEvent.click(screen.getByRole('button',{name:'Descartar registro ilegible después de revisar'}));assert.equal(sessionStorage.getItem(`strong-gym:debt-v1:${client}`),'corrupt');
  window.confirm=()=>true;fireEvent.click(screen.getByRole('button',{name:'Descartar registro ilegible después de revisar'}));assert.equal(sessionStorage.getItem(`strong-gym:debt-v1:${client}`),null);assert.equal(posts.length,0);
});

for(const received of [19,0,-1,100.001,Infinity,'100',null])test('API efectivo inválido sin RPC '+String(received),async()=>{
  const calls=reset();assert.equal((await POST(req({...intent(),cashReceived:received}))).status,422);assert.equal(calls.length,0);
});
test('API efectivo usa RPC atómico nuevo y exige comprobante coincidente',async()=>{
  const d={...intent(),cashReceived:100};const calls=reset('staff',receipt(d));assert.equal((await POST(req(d))).status,200);
  assert.equal(calls[0].name,'finance_debt_record_with_cash');assert.equal(calls[0].args.p_amount,20);assert.equal(calls[0].args.p_cash_received,100);
  reset('staff',receipt({...d,cashReceived:101}));assert.equal((await POST(req(d))).status,503);
  reset('staff',{...receipt(d),changeGiven:79});assert.equal((await POST(req(d))).status,503);
});
test('contrato efectivo no admite vuelto en apertura/cargo ni pares incompletos',()=>{
  const d={...intent(),cashReceived:100};
  assert.ok(debtReceiptSchema.safeParse(receipt(d)).success);
  for(const corrupt of [{...receipt(d),changeGiven:undefined},{...receipt(d),cashReceived:undefined},{...receipt(d),changeGiven:81},{...receipt(intent('charge')),cashReceived:100,changeGiven:80}])assert.equal(debtReceiptSchema.safeParse(corrupt).success,false);
  assert.equal(debtIntentSchema.safeParse({...intent('charge'),cashReceived:100}).success,false);
});
for(const applied of [20,60])test(`UI debe60/abona${applied}/entrega100: preview y payload exactos`,async()=>{
  const before={...balances,debt_nio:60};const posts=ui(d=>json(receipt(d,before)),before);await fill('payment',applied);
  fireEvent.click(screen.getByLabelText('Calcular vuelto por entrega de efectivo'));
  fireEvent.change(screen.getByLabelText('Cuenta que recibe el abono'),{target:{value:'nio'}});
  fireEvent.change(screen.getByLabelText('Efectivo recibido (NIO)'),{target:{value:'100'}});
  await screen.findByText(new RegExp(`Vuelto a entregar: NIO ${(100-applied).toFixed(2)} · Deuda restante: ${(60-applied).toFixed(2)}`));
  fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));await screen.findByText(/Operación confirmada/);
  assert.equal(posts.length,1);assert.equal(posts[0].amount,applied);assert.equal(posts[0].cashReceived,100);
});
test('UI efectivo insuficiente no envía, cancelación no persiste y pérdida de respuesta conserva efectivo',async()=>{
  const posts=ui(()=>{throw new TypeError('lost');});await fill();fireEvent.click(screen.getByLabelText('Calcular vuelto por entrega de efectivo'));
  fireEvent.change(screen.getByLabelText('Cuenta que recibe el abono'),{target:{value:'nio'}});
  fireEvent.change(screen.getByLabelText('Efectivo recibido (NIO)'),{target:{value:'10'}});
  fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));await screen.findByText(/El efectivo recibido debe cubrir el abono/);assert.equal(posts.length,0);
  fireEvent.change(screen.getByLabelText('Efectivo recibido (NIO)'),{target:{value:'100'}});
  window.confirm=()=>false;fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));assert.equal(sessionStorage.length,0);
  window.confirm=()=>true;fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'}));await screen.findByRole('button',{name:'Reintentar la misma operación'});
  assert.equal(JSON.parse(sessionStorage.getItem(`strong-gym:debt-v1:${client}`)).cashReceived,100);
  fireEvent.click(screen.getByRole('button',{name:'Reintentar la misma operación'}));await waitFor(()=>assert.equal(posts.length,2));assert.deepEqual(posts[0],posts[1]);
});
