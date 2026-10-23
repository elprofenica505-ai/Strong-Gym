"use client";
import { useCallback,useMemo,useRef,useState,useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCrmResource } from "./use-crm-resource";
import { crmRequest } from "@/lib/crm/request";
import { getCashChange,debtIntentSchema,debtDetailSchema,debtReceiptSchema,matchesDebtReceipt,type DebtIntent,type DebtReceipt,type DebtDetail } from "@/lib/finance/debts";
import { financeOptionsSchema,type FinanceOptions } from "@/lib/finance/movements";
const validate=(v:unknown)=>debtDetailSchema.safeParse(v).success;
const validateOptions=(v:unknown)=>financeOptionsSchema.safeParse(v).success;
const event='strong-gym:debt-pending';
const subscribe=(fn:()=>void)=>{window.addEventListener(event,fn);window.addEventListener('storage',fn);return()=>{window.removeEventListener(event,fn);window.removeEventListener('storage',fn);};};
const serverSnapshot=()=>null;
const input='w-full min-w-0 rounded-lg border border-line bg-paper p-2.5 text-ink disabled:opacity-60';
const labels={credit_nio:'Crédito inicial NIO',credit_usd:'Crédito inicial USD',debt_nio:'Deuda inicial NIO',debt_usd:'Deuda inicial USD'};
const kinds={opening:'Registrar saldo inicial',charge:'Registrar deuda manual',payment:'Registrar abono de deuda'};
const num=(f:FormData,key:string)=>String(f.get(key)??'').trim()===''?NaN:Number(f.get(key));
export function DebtForm({clientId,locale,disabled=false,onBusy,onRefresh}:{clientId:string;locale:string;disabled?:boolean;onBusy?:(value:boolean)=>void;onRefresh?:()=>void}) {
  const router=useRouter();
  const key=`strong-gym:debt-v1:${clientId}`;
  const read=useCallback(()=>{try{return sessionStorage.getItem(key);}catch{return 'UNAVAILABLE';}},[key]);
  const raw=useSyncExternalStore(subscribe,read,serverSnapshot);
  const recovered=useMemo(()=>{
    if(raw===null)return {intent:null,error:false};
    try{const p=debtIntentSchema.safeParse(JSON.parse(raw));if(p.success&&p.data.clientId===clientId)return {intent:p.data,error:false};}catch{}
    return {intent:null,error:true};
  },[raw,clientId]);
  const pending=recovered.intent;
  const [revision,setRevision]=useState(0);
  const data=useCrmResource<DebtDetail>(`/api/admin/debts?client=${clientId}`,revision,true,validate);
  const options=useCrmResource<FinanceOptions>('/api/admin/finance',revision,true,validateOptions);
  const [kind,setKind]=useState<'opening'|'charge'|'payment'>('charge');
  const [currency,setCurrency]=useState<'NIO'|'USD'>('NIO');
  const [cashMode,setCashMode]=useState(false);
  const [amountText,setAmountText]=useState('');
  const [receivedText,setReceivedText]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [receipt,setReceipt]=useState<DebtReceipt|null>(null);
  const lock=useRef(false);
  const current=data.data?.clientId===clientId?data.data:null;
  const waiting=disabled||busy;
  const operation=pending?.kind??kind;
  const selectedCurrency=pending&&pending.kind!=='opening'?pending.currency:currency;
  const withCash=operation==='payment'&&(pending?.kind==='payment'?pending.cashReceived!==undefined:cashMode);
  const applied=pending&&pending.kind!=='opening'?pending.amount:Number(amountText);
  const received=pending?.kind==='payment'&&pending.cashReceived!==undefined?pending.cashReceived:Number(receivedText);
  const change=getCashChange(applied,received);
  const debt=current?.balances?.[selectedCurrency==='NIO'?'debt_nio':'debt_usd'];
  const blocked=waiting||data.loading||!!data.error||!current||!current.writesEnabled||recovered.error||
    (operation==='opening'?(!current.canOpen||current.balances!==null):current.balances===null)||
    (operation==='payment'&&(options.loading||!!options.error||!options.data?.writes_enabled));
  function store(value:DebtIntent|null) {
    if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);
    window.dispatchEvent(new window.Event(event));
  }
  async function send(intent:DebtIntent) {
    if(lock.current)return;lock.current=true;setBusy(true);onBusy?.(true);setReceipt(null);setMessage('');
    try {
      try{store(intent);}catch{throw new Error('No se pudo guardar la referencia local. No se envió la operación.');}
      const result=debtReceiptSchema.parse(await crmRequest('/api/admin/debts',intent));
      if(!matchesDebtReceipt(result,intent))throw new Error('El comprobante no coincide. Conservá la referencia y revisá el historial.');
      setReceipt(result);
      if(intent.kind==='opening')setKind('charge');
      try{store(null);}catch{throw new Error('La operación está confirmada, pero no pudimos limpiar la referencia local. Reintentá con la misma referencia para recuperarla.');}
      setAmountText('');setReceivedText('');
      setMessage(`Operación confirmada. Referencia: ${result.reference}`);
      setRevision(n=>n+1);onRefresh?.();router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:'Resultado no confirmado. Revisá el historial y conservá la referencia.');}
    finally{lock.current=false;setBusy(false);onBusy?.(false);}
  }
  return <section aria-label="Deudas y abonos" className="space-y-4 rounded-xl border border-line p-4">
    <h3 className="font-bold">Deudas y abonos</h3>
    <p className="text-sm text-fog">Registro manual, sin renovar planes ni generar cargos por fecha. Abonos parciales permitidos; el importe aplicado no puede superar la deuda. Podés recibir un billete mayor y entregar vuelto en la misma moneda. No crea crédito ni compensa saldos entre monedas.</p>
    {data.data&&!current&&<p role="alert">La respuesta no corresponde a esta ficha. Reintentá la lectura; no se habilitan operaciones.</p>}
    {data.loading?<p role="status">Confirmando registro de deudas…</p>:data.error?<p role="alert">{data.error} Revisá DEUDAS-ABONOS.sql; no repitás operaciones.</p>:current&&<>
      <p className="text-sm text-fog">{current.balances===null?'Sin saldo inicial confirmado: administración debe registrar explícitamente los cuatro importes, sin suponer ceros.':`Deuda actual NIO: C$ ${current.balances.debt_nio.toFixed(2)} · USD: US$ ${current.balances.debt_usd.toFixed(2)}`}</p>
      {!current.writesEnabled&&<p role="alert">No se habilitarán operaciones nuevas hasta confirmar instalación y permisos.</p>}
    </>}
    <button type="button" className="text-brand-300 underline" disabled={waiting} onClick={()=>setRevision(n=>n+1)}>Reintentar</button>
    {recovered.error&&<div className="space-y-2">
      <p role="alert">Referencia local ilegible. No se enviará un intento nuevo; revisá historial y almacenamiento antes de continuar.</p>
      <button type="button" className="text-sm underline" disabled={waiting} onClick={()=>{
        if(!window.confirm('¿Confirmaste el resultado revisando historial, Caja y deuda? Descartar este registro local no revierte operaciones. Si no podés confirmar qué ocurrió, no lo descartés ni generés otro intento.'))return;
        try{store(null);setMessage('Registro local descartado tras revisión manual. No se revirtió ninguna operación.');}catch{setMessage('El almacenamiento sigue inaccesible; no se enviarán operaciones nuevas.');}
      }}>Descartar registro ilegible después de revisar</button>
    </div>}
    {message&&<p role="status" className="break-words text-sm">{message}</p>}
    {pending&&<div className="space-y-2 rounded-xl border border-brand/40 p-3">
      <p className="break-all text-sm">Intento conservado: {pending.requestId} · {kinds[pending.kind]}. Revisá el historial antes de cambiarlo.</p>
      <button type="button" className="text-brand-300 underline disabled:opacity-50" disabled={waiting} onClick={()=>void send(pending)}>Reintentar la misma operación</button>
      <button type="button" className="block text-sm underline" disabled={waiting} onClick={()=>{
        if(!window.confirm('¿Ya revisaste el historial y el resultado? Cerrar la referencia no revierte nada. Sólo cerrala si confirmaste el resultado o el rechazo; una respuesta perdida puede haber guardado la operación.'))return;
        try{store(null);setMessage('Referencia cerrada por confirmación manual. No se revirtió ninguna operación.');}catch{setMessage('No se pudo cerrar la referencia local.');}
      }}>Cerrar intento revisado</button>
    </div>}
    <form key={pending?.requestId??'new'} className="space-y-3" onSubmit={event=>{
      event.preventDefault();if(blocked||pending||lock.current)return;
      const f=new FormData(event.currentTarget);
      if(operation==='opening'&&f.get('confirmed')!=='on'){setMessage('Confirmá que conciliaste los saldos iniciales.');return;}
      if(withCash&&(!current?.cashProtocol||!current.cashAccounts?.includes(String(f.get('account')??'')))){setMessage('Elegí una cuenta de caja habilitada para efectivo y vuelto en esta moneda.');return;}
      const parsed=debtIntentSchema.safeParse({requestId:crypto.randomUUID(),kind:operation,clientId,concept:String(f.get('concept')??''),
        ...(operation==='opening'?{opening:Object.fromEntries(Object.keys(labels).map(k=>[k,num(f,k)]))}:{amount:num(f,'amount'),currency:selectedCurrency}),
        ...(operation==='payment'?{method:String(f.get('method')??''),account:String(f.get('account')??''),fx:num(f,'fx'),...(withCash?{cashReceived:num(f,'cashReceived')}:{})}:{})});
      if(withCash&&getCashChange(num(f,'amount'),num(f,'cashReceived'))===null){setMessage('El efectivo recibido debe cubrir el abono. Revisá importes y decimales; no se envió la operación.');return;}
      if(!parsed.success){setMessage('Completá los campos y revisá decimales. No se envió la operación.');return;}
      const d=parsed.data;
      if(d.kind==='payment'&&current?.balances&&d.amount>current.balances[d.currency==='NIO'?'debt_nio':'debt_usd']){
        setMessage('El abono supera la deuda leída en esa moneda. No se envió ni se convirtió el sobrante en crédito.');return;
      }
      if(!window.confirm(d.kind==='opening'?`¿Registrar estos saldos iniciales conciliados para ${current?.clientName}? ${JSON.stringify(d.opening)}. No es entrada de dinero en Caja. Motivo: ${d.concept}`:
        `¿${kinds[d.kind]} para ${current?.clientName} de ${d.currency} ${d.amount.toFixed(2)}? Motivo: ${d.concept}. ${d.kind==='charge'?'Aumenta deuda; no entra dinero en Caja.':`Disminuye deuda y registra sólo el abono neto en la cuenta elegida; tasa NIO/USD ${d.fx}. No crea crédito ni renueva planes.${d.cashReceived!==undefined?` Efectivo recibido: ${d.currency} ${d.cashReceived.toFixed(2)}. Vuelto a entregar: ${d.currency} ${getCashChange(d.amount,d.cashReceived)?.toFixed(2)}.`:''}`}`))return;
      void send(d);
    }}>
      <fieldset disabled={waiting||!!pending||recovered.error} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">Operación<select className={input} value={operation} onChange={e=>setKind(e.target.value as typeof kind)}>
          <option value="charge">Registrar deuda manual</option><option value="payment">Registrar abono de deuda</option>
          {current?.canOpen&&current.balances===null&&<option value="opening">Registrar saldo inicial conciliado</option>}
        </select></label>
        {operation==='opening'?<>
          {Object.entries(labels).map(([key,label])=><label key={key} className="min-w-0 text-sm">{label}<input className={input} name={key} type="number" min="0" max="9999999999.99" step="0.01" required defaultValue={pending?.kind==='opening'?pending.opening[key as keyof typeof pending.opening]:undefined}/></label>)}
          <label className="text-sm sm:col-span-2"><input name="confirmed" type="checkbox" required/> Confirmo los cuatro saldos iniciales conciliados. No se importan ni se deducen de cobros históricos. Para datos reales, sólo después de aprobación del dueño.</label>
        </>:<>
          <label className="min-w-0 text-sm">Importe de deuda o abono<input className={input} type="number" name="amount" required min="0.01" max="99999999" step="0.01" value={pending&&pending.kind!=='opening'?pending.amount:amountText} onChange={e=>setAmountText(e.target.value)}/></label>
          <label className="min-w-0 text-sm">Moneda de la deuda<select className={input} value={selectedCurrency} onChange={e=>{setCurrency(e.target.value as 'NIO'|'USD');setReceivedText('');}}><option>NIO</option><option>USD</option></select></label>
        </>}
        {operation==='payment'&&<>
          <label className="text-sm sm:col-span-2"><input type="checkbox" checked={withCash} disabled={!current?.cashProtocol} onChange={e=>setCashMode(e.target.checked)}/> Calcular vuelto por entrega de efectivo</label>
          {!current?.cashProtocol&&<p className="text-sm text-fog sm:col-span-2">Efectivo recibido y vuelto requieren instalar VUELTO-ABONOS.sql. No inventamos esos datos para abonos anteriores.</p>}
          {withCash&&<>
            <label className="min-w-0 text-sm">Efectivo recibido ({selectedCurrency})<input className={input} name="cashReceived" type="number" min="0.01" max="99999999" step="0.01" required value={pending?.kind==='payment'?pending.cashReceived??'':receivedText} onChange={e=>setReceivedText(e.target.value)}/></label>
            <p aria-live="polite" className="text-sm sm:col-span-2">{change===null?'Escribí el abono y el efectivo recibido; el efectivo debe cubrir el abono.':`Abono aplicado: ${selectedCurrency} ${applied.toFixed(2)} · Efectivo recibido: ${selectedCurrency} ${received.toFixed(2)} · Vuelto a entregar: ${selectedCurrency} ${change.toFixed(2)} · Deuda restante: ${debt!==undefined&&applied<=debt?(debt-applied).toFixed(2):'revisar importe'}. Caja aumenta sólo por el abono aplicado.`}</p>
          </>}

          <label className="min-w-0 text-sm">Método de abono<select className={input} name="method" key={`method:${selectedCurrency}`} required defaultValue={pending?.kind==='payment'?pending.method:''}><option value="">Elegí método</option>{options.data?.methods.filter(m=>selectedCurrency==='NIO'?m.accepts_nio:m.accepts_usd).map(m=><option key={m.id} value={m.id}>{m.name_es}</option>)}</select></label>
          <label className="min-w-0 text-sm">Cuenta que recibe el abono<select className={input} name="account" key={`account:${selectedCurrency}`} required defaultValue={pending?.kind==='payment'?pending.account:''}><option value="">Elegí cuenta</option>{options.data?.accounts.filter(a=>a.currency===selectedCurrency&&(!withCash||current?.cashAccounts?.includes(a.id))).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="min-w-0 text-sm">Tasa NIO por 1 USD<input className={input} name="fx" type="number" required min="0.0001" max="10000" step="0.0001" defaultValue={pending?.kind==='payment'?pending.fx:undefined}/></label>
        </>}
        <label className="min-w-0 text-sm sm:col-span-2">Motivo de deuda, abono o saldo inicial<input className={input} name="concept" required minLength={2} maxLength={200} defaultValue={pending?.concept}/></label>
      </fieldset>
      {options.error&&operation==='payment'&&<p role="alert">Métodos/cuentas: {options.error}</p>}
      <button className="rounded-full bg-brand px-4 py-2 text-onbrand disabled:opacity-50" disabled={blocked||!!pending}>{busy?'Confirmando…':kinds[operation]}</button>
    </form>
    {receipt?.transactionId&&<Link className="block text-brand-300 underline" target="_blank" href={`/${locale}/panel/comprobantes/${receipt.transactionId}`}>Abrir comprobante del abono</Link>}
    <h4 className="font-semibold">Últimas 50 operaciones de deuda</h4>
    {!data.loading&&!data.error&&current&&current.entries.length===0&&<p className="text-sm text-fog">Sin operaciones de deuda registradas.</p>}
    {!data.loading&&!data.error&&current&&<ul className="space-y-2 text-sm">{current.entries.map(e=><li key={e.id} className="space-y-1 rounded-lg border border-line p-3">
      <p>{kinds[e.kind]} · {e.currency&&`${e.currency} ${e.amount?.toFixed(2)}`}</p><p>{e.concept}</p>
      <p>{new Intl.DateTimeFormat('es-NI',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Managua'}).format(new Date(e.occurredAt))} · {e.actorName??'Personal'}</p>
      {e.cashReceived!==undefined&&e.changeGiven!==undefined&&<p>Efectivo recibido: {e.currency} {e.cashReceived.toFixed(2)} · Vuelto entregado: {e.currency} {e.changeGiven.toFixed(2)}</p>}
      {e.before&&<p>Deuda antes: C$ {e.before.debt_nio.toFixed(2)} · US$ {e.before.debt_usd.toFixed(2)}</p>}
      <p>Crédito después: C$ {e.after.credit_nio.toFixed(2)} · US$ {e.after.credit_usd.toFixed(2)}</p>
      <p>Deuda después: C$ {e.after.debt_nio.toFixed(2)} · US$ {e.after.debt_usd.toFixed(2)}</p>
      <p className="break-all text-xs">{e.reference}</p>
      {e.transactionId&&<Link className="text-brand-300 underline" target="_blank" href={`/${locale}/panel/comprobantes/${e.transactionId}`}>Comprobante del abono</Link>}
    </li>)}</ul>}
  </section>;
}
