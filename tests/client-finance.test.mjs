import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { readClientFinance, readClientPayments } from "../src/lib/crm/client-finance.ts";
import { createLoader } from "./helpers/react-loader.mjs";
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://strong.test'});
for(const key of ['window','document','navigator','HTMLElement','Node'])
  Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,screen,fireEvent,cleanup}=await import('@testing-library/react/pure.js');
const {ClientFinanceSummary,ClientIncomeHistory}=await createLoader()('components/crm/client-finance.tsx');
afterEach(cleanup);
const id='11111111-1111-4111-8111-111111111111',profile='22222222-2222-4222-8222-222222222222';
const finance=()=>({version:1,client_id:id,profile_id:profile,layout:'bank_accounts_split',balance_status:'ready',
  balance_nio:null,balances:{credit_nio:100,credit_usd:7,debt_nio:20,debt_usd:3},
  collections:{count_nio:46,amount_nio:453,count_usd:1,amount_usd:2}});
const detail=(value=finance())=>({client:{id,profile_id:value ? value.profile_id : profile},finance:value,payments:[]});
function show(value=finance(),props={}) {
  return render(React.createElement(ClientFinanceSummary,{detail:detail(value),pending:false,stale:false,disabled:false,retry(){},...props}));
}

test('ficha: mantiene cuatro valores separados y totales cobrados distintos del saldo',()=>{
  show();
  for(const text of ['Crédito NIO: C$ 100.00','Deuda NIO: C$ 20.00','Crédito USD: US$ 7.00','Deuda USD: US$ 3.00','Córdobas: C$ 453.00 · 46 cobros','Dólares: US$ 2.00 · 1 cobro'])
    assert.ok(screen.getByText(text));
  assert.equal(screen.queryByText(/C\$ 80.00/),null);
  assert.ok(screen.getByText(/No es el saldo del cliente ni el dinero disponible en Caja/));
  assert.ok(screen.getByText(/no abonan deudas, crean crédito ni renuevan planes/));
});
for(const state of ['unlinked','missing']) test(`ficha: ${state} no se convierte en saldo cero ni al día`,()=>{
  const value={...finance(),profile_id:state==='unlinked'?null:profile,balance_status:state,balances:null};
  assert.ok(readClientFinance(value,id,value.profile_id));
  show(value);
  assert.ok(screen.getByText(state==='unlinked'?/Ficha sin cuenta web vinculada/:/Cuenta web vinculada, pero sin registro de saldo/));
  assert.equal(screen.queryByText(/Crédito NIO:/),null);
});
test('ficha: registro explícito de cuatro ceros sí se distingue de ausencia',()=>{
  show({...finance(),balances:{credit_nio:0,credit_usd:0,debt_nio:0,debt_usd:0}});
  assert.ok(screen.getByText('Crédito NIO: C$ 0.00'));
  assert.equal(screen.queryByText(/sin registro de saldo/),null);
});
test('ficha: saldo neto legado informa alcance NIO, sin inventar USD ni compensar',()=>{
  show({...finance(),layout:'repository',balance_nio:-23,balances:null});
  assert.ok(screen.getByText(/Saldo legado de cuenta vinculada: C\$ -23.00/));
  assert.ok(screen.getByText(/no informa saldos separados en USD/));
  assert.equal(screen.queryByText(/Crédito USD:/),null);
});
for(const bad of [undefined,null,{}, {...finance(),client_id:'another'}, {...finance(),profile_id:'another'},
  {...finance(),balances:{credit_nio:null,credit_usd:7,debt_nio:20,debt_usd:3}},
  {...finance(),balances:{credit_nio:'100',credit_usd:7,debt_nio:20,debt_usd:3}},
  {...finance(),balances:{credit_nio:NaN,credit_usd:7,debt_nio:20,debt_usd:3}},
  {...finance(),balances:{credit_nio:Infinity,credit_usd:7,debt_nio:20,debt_usd:3}},
  {...finance(),balances:{credit_nio:-1,credit_usd:7,debt_nio:20,debt_usd:3}},
  {...finance(),balance_status:'missing'}, {...finance(),layout:'repository'},
  {...finance(),collections:{count_nio:0,amount_nio:400,count_usd:0,amount_usd:0}},
  {...finance(),collections:null}, {...finance(),collections:{count_nio:1.5,amount_nio:1,count_usd:0,amount_usd:0}},
]) test(`contrato financiero rechaza dato incompleto/incoherente ${JSON.stringify(bad)}`,()=>{
  assert.equal(readClientFinance(bad,id,profile),null);
});
test('ficha: falta de versión SQL muestra error local y reintento sólo lectura',()=>{
  let reads=0;
  show(finance(),{detail:{...detail(),finance:undefined},retry(){reads++;}});
  assert.ok(screen.getByRole('alert'));
  assert.equal(screen.queryByText(/Crédito NIO:/),null);
  fireEvent.click(screen.getByRole('button',{name:'Reintentar saldo y cobros'}));
  assert.equal(reads,1);
});
for(const props of [{pending:true},{stale:true}]) test(`ficha: no anuncia importes antiguos confirmados ${JSON.stringify(props)}`,()=>{
  show(finance(),props);
  assert.equal(screen.queryByText('Crédito NIO: C$ 100.00'),null);
  assert.equal(screen.queryByText('Córdobas: C$ 453.00 · 46 cobros'),null);
});
test('ficha: esquema desconocido no promete saldo ni totales cero',()=>{
  show({...finance(),layout:'unsupported',balance_status:'unsupported',balances:null,collections:null});
  assert.ok(screen.getByRole('alert'));
  assert.equal(screen.queryByText(/Córdobas:/),null);
});
const payment=()=>({id,amount:12,currency:'USD',status:'pending',concept:'EJEMPLO',occurred_at:'2026-10-18T01:00:00Z'});
test('historial: muestra estado y fecha Managua sin interpretar pendiente como pagado',()=>{
  render(React.createElement(ClientIncomeHistory,{detail:{...detail(),payments:[payment()]},pending:false,stale:false}));
  assert.ok(screen.getByText('USD 12.00 · EJEMPLO'));
  assert.ok(screen.getByText(/17 oct 2026.*Pendiente/));
  assert.ok(screen.getByText(/Incluye estados no completados/));
});
for(const invalid of [{...payment(),amount:null},{...payment(),amount:'12'},{...payment(),amount:NaN},{...payment(),currency:'EUR'},{...payment(),occurred_at:'invalid'}]) test(`historial rechaza dato inválido ${JSON.stringify(invalid)}`,()=>{
  assert.equal(readClientPayments([invalid]),null);
  render(React.createElement(ClientIncomeHistory,{detail:{...detail(),payments:[invalid]},pending:false,stale:false}));
  assert.ok(screen.getByRole('alert'));
  assert.equal(screen.queryByText(/USD 0.00|NaN/),null);
});

test('ficha: cuenta de deuda sin login se muestra sólo con fuente explícita coherente',()=>{
  const value={...finance(),profile_id:null,source:'client'};
  assert.ok(readClientFinance(value,id,null));
  show(value);assert.ok(screen.getByText('Créditos y deudas de esta ficha'));
  assert.equal(readClientFinance({...value,source:'profile'},id,null),null);
});
