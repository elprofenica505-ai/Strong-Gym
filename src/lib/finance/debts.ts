import { z } from "zod";
const amount=z.number().finite().positive().max(99999999).multipleOf(0.01);
export const debtBalancesSchema=z.object({
  credit_nio:z.number().finite().min(0).max(9999999999.99).multipleOf(0.01),
  credit_usd:z.number().finite().min(0).max(9999999999.99).multipleOf(0.01),
  debt_nio:z.number().finite().min(0).max(9999999999.99).multipleOf(0.01),
  debt_usd:z.number().finite().min(0).max(9999999999.99).multipleOf(0.01),
}).strict();
const fields={requestId:z.string().uuid(),clientId:z.string().uuid(),concept:z.string().trim().min(2).max(200)};
export const debtIntentSchema=z.discriminatedUnion('kind',[
  z.object({...fields,kind:z.literal('opening'),opening:debtBalancesSchema}).strict(),
  z.object({...fields,kind:z.literal('charge'),amount,currency:z.enum(['NIO','USD'])}).strict(),
  z.object({...fields,kind:z.literal('payment'),amount,currency:z.enum(['NIO','USD']),
    method:z.string().min(1).max(80),account:z.string().min(1).max(80),
    cashReceived:amount.optional(),fx:z.number().finite().min(0.0001).max(10000).multipleOf(0.0001)}).strict(),
]).superRefine((d,ctx)=>{
  if(d.kind==='payment'&&d.cashReceived!==undefined&&getCashChange(d.amount,d.cashReceived)===null)ctx.addIssue({code:'custom',message:'INVALID_CASH_RECEIVED',path:['cashReceived']});
});
export type DebtIntent=z.infer<typeof debtIntentSchema>;
export const debtReceiptSchema=z.object({
  id:z.string().uuid(),reference:z.string(),requestId:z.string().uuid(),kind:z.enum(['opening','charge','payment']),
  clientId:z.string().uuid(),clientName:z.string(),actorId:z.string().uuid(),actorName:z.string().nullable(),
  occurredAt:z.string().datetime({offset:true}),concept:z.string(),currency:z.enum(['NIO','USD']).nullable(),
  amount:amount.nullable(),before:debtBalancesSchema.nullable(),after:debtBalancesSchema,
  transactionId:z.string().uuid().nullable(),
  cashReceived:amount.optional(),changeGiven:z.number().finite().nonnegative().max(99999999).multipleOf(0.01).optional(),
}).superRefine((r,ctx)=>{
  if ((r.cashReceived!==undefined||r.changeGiven!==undefined) && (r.kind!=='payment'||r.amount===null||r.cashReceived===undefined||r.changeGiven===undefined||getCashChange(r.amount,r.cashReceived)!==r.changeGiven)) ctx.addIssue({code:'custom',message:'INVALID_CASH_RECEIPT'});
  if(r.kind==='opening') {
    if(r.before!==null||r.amount!==null||r.currency!==null||r.transactionId!==null)
      ctx.addIssue({code:'custom',message:'INVALID_OPENING_RECEIPT'});
  } else if(r.before===null||r.amount===null||r.currency===null||(r.kind==='payment')!==(r.transactionId!==null))
    ctx.addIssue({code:'custom',message:'INVALID_DEBT_RECEIPT'});
  else {
    const key=r.currency==='NIO'?'debt_nio':'debt_usd';
    for(const k of ['credit_nio','credit_usd','debt_nio','debt_usd'] as const) {
      const expected=r.before[k]+(k===key?(r.kind==='charge'?r.amount:-r.amount):0);
      if(Math.abs(r.after[k]-expected)>0.000001) ctx.addIssue({code:'custom',message:'DEBT_RECEIPT_MISMATCH'});
    }
  }
});
export type DebtReceipt=z.infer<typeof debtReceiptSchema>;
export const debtDetailSchema=z.object({
  protocol:z.literal('debt-v1'),clientId:z.string().uuid(),clientName:z.string(),profileId:z.string().uuid().nullable(),
  source:z.enum(['profile','client']),balances:debtBalancesSchema.nullable(),
  writesEnabled:z.boolean(),canOpen:z.boolean(),cashProtocol:z.literal('cash-v1').optional(),cashAccounts:z.array(z.string()).optional(),entries:z.array(debtReceiptSchema).max(50),
}).refine(d=>(d.source==='client')===(d.profileId===null)&&d.entries.every(e=>e.clientId===d.clientId));
export type DebtDetail=z.infer<typeof debtDetailSchema>;
export function matchesDebtReceipt(receipt:DebtReceipt,intent:DebtIntent) {
  return receipt.requestId===intent.requestId&&receipt.clientId===intent.clientId&&receipt.kind===intent.kind&&receipt.concept===intent.concept&&
    (intent.kind==='opening'?Object.keys(intent.opening).every(k=>receipt.after[k as keyof typeof intent.opening]===intent.opening[k as keyof typeof intent.opening]):
      receipt.amount===intent.amount&&receipt.currency===intent.currency&&(intent.kind!=='payment'||receipt.cashReceived===intent.cashReceived));
}

/** Aritmética de efectivo en centavos; null indica datos incompletos o insuficientes. */
export function getCashChange(applied:number,received:number):number|null {
  if(!amount.safeParse(applied).success||!amount.safeParse(received).success||received<applied)return null;
  return (Math.round(received*100)-Math.round(applied*100))/100;
}
