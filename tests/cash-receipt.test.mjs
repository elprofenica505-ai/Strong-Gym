import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createLoader} from './helpers/react-loader.mjs';
import {receiptSchema} from '../src/lib/finance/movements.ts';
import {getCashChange} from '../src/lib/finance/debts.ts';
const id='11111111-1111-4111-8111-111111111111';
const base={id,reference:'SG-EJEMPLO',requestId:id,kind:'debt_payment',debtBefore:60,debtAfter:40,occurredAt:'2026-10-18T03:00:00Z',amount:20,currency:'NIO',amountNio:20,amountUsd:0.5,fx:40,concept:'PRUEBA vuelto',clientId:id,clientName:'Cliente EJEMPLO',categoryName:null,accountId:'cash',accountName:'Caja EJEMPLO',methodName:'Efectivo',actorId:id,actorName:'Personal EJEMPLO',accountBefore:6,accountAfter:26};
const load=createLoader({
  '@/lib/data/queries':"export const getCurrentUser=async()=>({role:'admin',mfa:'ok'});",
  '@/lib/supabase/server':"export const getSupabaseServerClient=async()=>({rpc(){return {abortSignal:async()=>({data:globalThis.__cashReceipt,error:null})}}});",
  'next/navigation':"export function redirect(){throw Error('AUTH')};export function notFound(){throw Error('NOT_FOUND')};",
});
const {default:Page}=await load('app/[locale]/panel/comprobantes/[id]/page.tsx');
const html=async r=>{globalThis.__cashReceipt=r;return renderToStaticMarkup(await Page({params:Promise.resolve({locale:'es',id})}));};
test('comprobante real SSR muestra recibido/vuelto/abono y no niega aplicación de deuda',async()=>{
  const markup=await html({...base,cashReceived:100,changeGiven:80});
  for(const label of ['Efectivo recibido','Vuelto entregado','Abono aplicado · ingreso neto en Caja','Este abono reduce la deuda'])assert.ok(markup.includes(label));
  assert.equal(markup.includes('No aplica ni compensa deudas o créditos'),false);
});
test('comprobante histórico no inventa efectivo ni vuelto',async()=>{
  const markup=await html(base);assert.equal(markup.includes('<dt class="text-sm text-fog">Efectivo recibido'),false);assert.equal(markup.includes('Vuelto entregado'),false);assert.ok(markup.includes('Este abono reduce la deuda'));
});
test('contrato comprobante rechaza vuelto incoherente en abonos y en cobros',()=>{
  assert.ok(receiptSchema.safeParse({...base,cashReceived:100,changeGiven:80}).success);
  // FIN-02: el efectivo y el vuelto también valen para un cobro por servicio.
  assert.ok(receiptSchema.safeParse({...base,kind:'service_income',cashReceived:100,changeGiven:80}).success);
  for(const r of [{...base,cashReceived:100},{...base,cashReceived:100,changeGiven:79},{...base,cashReceived:10,changeGiven:0},{...base,kind:'service_income',cashReceived:100,changeGiven:79}])assert.equal(receiptSchema.safeParse(r).success,false);
});
test('cálculo en centavos no pierde decimales ni acepta efectivo insuficiente',()=>{
  assert.equal(getCashChange(0.29,1),0.71);assert.equal(getCashChange(60,100),40);assert.equal(getCashChange(20,100),80);assert.equal(getCashChange(20,20),0);
  for(const values of [[20,19],[1,1.001],[0,100],[Infinity,100],[20,NaN]])assert.equal(getCashChange(...values),null);
});
