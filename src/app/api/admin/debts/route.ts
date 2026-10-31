import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/queries";
import { canManageFinance } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { debtDetailSchema,debtIntentSchema,debtReceiptSchema,matchesDebtReceipt } from "@/lib/finance/debts";
import { sameOrigin } from "@/lib/security/same-origin";
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const errors:Record<string,string>={
  INVALID_CASH_RECEIVED:'El efectivo recibido debe cubrir el abono, con máximo dos decimales. El vuelto no aumenta crédito.',
  CASH_ACCOUNT_REQUIRED:'El efectivo y su vuelto sólo se registran en una cuenta de caja activa de la misma moneda.',
  AUTH:'No tenés acceso a deudas y abonos.',ADMIN_REQUIRED:'Sólo administración puede registrar el saldo inicial explícito.',
  PAYMENT_EXCEEDS_DEBT:'El abono supera la deuda actual en esa moneda. No se guardó ni se creó crédito.',
  BALANCE_NOT_INITIALIZED:'No hay un registro de saldo confirmado. Administración debe conciliar y registrar los cuatro saldos iniciales; no se supone cero.',
  BALANCE_ALREADY_EXISTS:'Ya existe un saldo. No se reemplaza ni reinicia; revisá la ficha.',
  BALANCE_LINK_RECONCILIATION_REQUIRED:'El vínculo de la ficha necesita conciliación. No se mezclaron saldos.',
  REQUEST_CONFLICT:'La referencia pertenece a otra operación. Conservá el intento y revisá el historial.',
  FINANCE_REVIEW_REQUIRED:'Revisá instalación, permisos y disparadores antes de una operación nueva.',
  INVALID_DEBT:'Revisá importe, moneda y concepto. No se confirmó una operación nueva.',
  INVALID_PAYMENT:'Revisá importe, tasa y límites de la cuenta.',INVALID_ACCOUNT:'Elegí una cuenta activa de la misma moneda.',
  INVALID_METHOD:'Elegí un método activo que acepte esa moneda.',NOT_FOUND:'No encontramos la ficha. No creés otra sin buscarla.',
};
function failure(error:{message?:string;code?:string}) {
  const key=error.message??'';
  if(Object.hasOwn(errors,key)) return reply({error:errors[key],code:`DEBT_${key}`},['AUTH','ADMIN_REQUIRED'].includes(key)?403:key==='REQUEST_CONFLICT'?409:422);
  return reply({error:'No se pudo confirmar la operación. Revisá el historial y reintentá con la misma referencia; no generés otro intento.',code:['PGRST202','42883','42P01'].includes(error.code??'')?'DEBT_SETUP_REQUIRED':'DEBT_UNCONFIRMED'},503);
}
async function context() {
  if(!isSupabaseConfigured||!canManageFinance(await getCurrentUser())) return {response:reply({error:errors.AUTH},403)};
  const db=await getSupabaseServerClient();
  return db?{db}:{response:reply({error:'No se confirmó la conexión.'},503)};
}
export async function GET(request:Request) {
  try {
    const ctx=await context();if(!ctx.db)return ctx.response;
    const client=new URL(request.url).searchParams.get('client');
    if(!z.string().uuid().safeParse(client).success)return reply({error:'Ficha inválida.'},422);
    const {data,error}=await ctx.db.rpc('finance_debt_detail',{p_client:client}).abortSignal(AbortSignal.timeout(15000));
    if(error)return failure(error);
    const parsed=debtDetailSchema.safeParse(data);
    return parsed.success&&parsed.data.clientId===client?reply(parsed.data):failure({});
  }catch{return failure({});}
}
export async function POST(request:Request) {
  try {
    if(!sameOrigin(request))return reply({error:'Origen no permitido.'},403);
    const ctx=await context();if(!ctx.db)return ctx.response;
    const parsed=debtIntentSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return reply({error:'Datos incompletos o inválidos. No se enviaron a la base.'},422);
    const d=parsed.data;
    const {data,error}=await ctx.db.rpc(d.kind==='payment'&&d.cashReceived!==undefined?'finance_debt_record_with_cash':'finance_debt_record',{
      p_request:d.requestId,p_kind:d.kind,p_client:d.clientId,p_concept:d.concept,
      p_amount:d.kind==='opening'?null:d.amount,p_currency:d.kind==='opening'?null:d.currency,
      p_method:d.kind==='payment'?d.method:null,p_account:d.kind==='payment'?d.account:null,p_fx:d.kind==='payment'?d.fx:null,
      p_open:d.kind==='opening'?d.opening:null,
      ...(d.kind==='payment'&&d.cashReceived!==undefined?{p_cash_received:d.cashReceived}:{}),
    }).abortSignal(AbortSignal.timeout(25000));
    if(error)return failure(error);
    const result=debtReceiptSchema.safeParse(data);
    return result.success&&matchesDebtReceipt(result.data,d)?reply(result.data):failure({});
  }catch{return failure({});}
}
