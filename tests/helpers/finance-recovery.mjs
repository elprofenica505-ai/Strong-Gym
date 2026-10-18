import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createLoader } from "./react-loader.mjs";

/** Integración local: componente y API reales; el adaptador sustituye únicamente
 * el transporte Supabase por consultas a las funciones SQL instaladas en PostgreSQL.
 * No prueba Next HTTP, cookies, PostgREST, navegador real ni Supabase remoto. */
export async function testFinanceRecovery({ control, connect, actor, client, check }) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://strong.test/es/panel/gastos",
  });
  const saved = new Map();
  function replace(name, value) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  for (const name of ["window", "document", "navigator", "HTMLElement", "Node", "FormData", "sessionStorage"])
    replace(name, dom.window[name]);
  replace("self", dom.window);
  replace("IS_REACT_ACT_ENVIRONMENT", true);
  const originalFetch = globalThis.fetch;
  let cleanup;
  const stats = { rpc: 0, posts: [], committed: [] };
  const rpcSql = {
    finance_debt_detail: p => ["select finance_debt_detail($1) as value", [p.p_client]],
    finance_debt_record: p => ["select finance_debt_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value", [p.p_request,p.p_kind,p.p_client,p.p_amount,p.p_currency,p.p_concept,p.p_method,p.p_account,p.p_fx,p.p_open]],
    finance_options: () => ["select finance_options() as value", []],
    finance_receipt: p => ["select finance_receipt($1) as value", [p.p_id]],
    finance_recent_receipts: p => ["select finance_recent_receipts($1,$2) as value", [p.p_kind, p.p_client]],
    finance_record_movement: p => ["select finance_record_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value", [p.p_request,p.p_kind,p.p_client,p.p_amount,p.p_currency,p.p_method,p.p_account,p.p_concept,p.p_fx,p.p_category]],
  };
  let identity = actor;
  replace("__financeRecovery", {
    async user() {
      if (!identity) return null;
      return (await control.query("select id,role from profiles where id=$1", [identity])).rows[0] ?? null;
    },
    db: {
      rpc(name, params = {}) {
        assert.ok(Object.hasOwn(rpcSql, name), `RPC inesperado: ${name}`);
        return {
          async abortSignal(signal) {
            assert.ok(signal instanceof AbortSignal);
            stats.rpc++;
            const db = await connect();
            try {
              await db.query("begin");
              await db.query("select set_config('request.jwt.claim.sub',$1,true)", [identity ?? ""]);
              await db.query(`set local role ${identity ? "authenticated" : "anon"}`);
              const [query, args] = rpcSql[name](params);
              const data = (await db.query(query, args)).rows[0].value;
              await db.query("commit");
              return { data, error: null };
            } catch (error) {
              await db.query("rollback");
              return { data: null, error: { code: error.code, message: error.message } };
            } finally {
              await db.end();
            }
          },
        };
      },
    },
  });
  try {
    const testing = await import("@testing-library/react/pure.js");
    const { render, screen, fireEvent, waitFor, act } = testing;
    cleanup = testing.cleanup;
    const load = createLoader({
      "@/lib/data/queries": "export const getCurrentUser=()=>globalThis.__financeRecovery.user();",
      "@/lib/supabase/env": "export const isSupabaseConfigured=true;",
      "@/lib/supabase/server": "export const getSupabaseServerClient=async()=>globalThis.__financeRecovery.db;",
      "next/navigation": "export const useRouter=()=>({refresh(){}});",
    });
    const { GET, POST } = await load("app/api/admin/finance/route.ts");
    const { GET: GETDebt, POST: POSTDebt } = await load("app/api/admin/debts/route.ts");
    const { DebtForm } = await load("components/crm/debt-form.tsx");
    const { MovementForm } = await load("components/admin/movement-form.tsx");
    await control.query("update profiles set role='staff' where id=$1", [actor]);
    await control.query(`
      insert into bank_accounts(id,name,account_type,currency,balance) values
        ('recovery-nio','EJEMPLO recuperación NIO','caja_fuerte','NIO',10),
        ('recovery-usd','EJEMPLO recuperación USD','caja_fuerte','USD',0);
      insert into payment_methods(id,name,currency) values
        ('recovery-nio','EJEMPLO NIO','NIO'),('recovery-usd','EJEMPLO USD','USD');
      insert into expense_categories(id,name) values('recovery','EJEMPLO recuperación');
    `);
    const state = async () => (await control.query(`select
      (select balance::text from bank_accounts where id='recovery-nio') as nio,
      (select balance::text from bank_accounts where id='recovery-usd') as usd,
      (select count(*)::int from transactions where account_id like 'recovery-%') as transactions,
      (select count(*)::int from finance_entries where receipt->>'accountId' like 'recovery-%') as receipts,
      (select count(*)::int from client_events e join transactions t on t.id=(e.details->>'transaction_id')::uuid where t.account_id like 'recovery-%' and e.action='payment') as events
    `)).rows[0];
    let loseResponse = false;
    const inFlight = new Set();
    const transport = async (path, init = {}) => {
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const url = new URL(path, "https://strong.test");
      const isPost = init.method === "POST";
      const request = new Request(url, {
        method: isPost ? "POST" : "GET",
        headers: isPost ? { "content-type": "application/json", origin: url.origin, host: url.host } : {},
        body: isPost ? init.body : undefined,
      });
      if (!isPost) return url.pathname.endsWith("/debts") ? GETDebt(request) : GET(request);
      stats.posts.push(JSON.parse(init.body));
      const response = await (url.pathname.endsWith("/debts") ? POSTDebt(request) : POST(request));
      assert.equal(response.status, 200);
      const body = await response.clone().json();
      stats.committed.push(body.id);
      if (loseResponse) {
        loseResponse = false;
        // COMMIT ya terminó en otra conexión. Sólo se pierde la respuesta.
        throw new TypeError("Respuesta perdida DESPUÉS del COMMIT real");
      }
      return response;
    };
    globalThis.fetch = (...args) => {
      const task = transport(...args);
      inFlight.add(task);
      void task.then(() => inFlight.delete(task), () => inFlight.delete(task));
      return task;
    };
    async function ui(action) {
      let result;
      const drain = async () => {
        const deadline = Date.now() + 10000;
        do {
          assert.ok(Date.now() < deadline, "La UI no termina sus consultas");
          await Promise.allSettled([...inFlight]);
          await new Promise(resolve => setImmediate(resolve));
        } while (inFlight.size);
      };
      await act(async () => { result = action(); await drain(); });
      // Los efectos causados por la respuesta se ejecutan al finalizar act.
      await act(drain);
      return result;
    }
    window.confirm = () => true;
    const cases = [
      { kind: "expense", currency: "NIO", amount: 4, account: "recovery-nio", label: "Confirmar gasto", concept: "EJEMPLO gasto con respuesta perdida" },
      { kind: "service_income", currency: "USD", amount: 1, account: "recovery-usd", label: "Confirmar cobro por servicio", concept: "EJEMPLO cobro USD con respuesta perdida" },
    ];
    for (const [index, item] of cases.entries()) {
      const props = { kind: item.kind, locale: "es", ...(item.kind === "service_income" ? { clientId: client } : {}) };
      const key = `strong-gym:finance-v1:${item.kind}:${item.kind === "expense" ? "general" : client}`;
      const first = await ui(() => render(React.createElement(MovementForm, props)));
      await waitFor(() => assert.equal(screen.getByRole("button", { name: item.label }).disabled, false));
      await ui(() => fireEvent.change(screen.getByLabelText("Moneda"), { target: { value: item.currency } }));
      for (const [label, value] of [
        ["Monto", String(item.amount)], ["Cuenta", item.account], ["Método", item.account],
        ["Tasa NIO por 1 USD", "40"], ["Concepto", item.concept],
        ...(item.kind === "expense" ? [["Categoría", "recovery"]] : []),
      ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
      loseResponse = true;
      await ui(() => fireEvent.click(screen.getByRole("button", { name: item.label })));
      await screen.findByText(/Conservá esta referencia/);
      const intent = JSON.parse(sessionStorage.getItem(key));
      assert.deepEqual(stats.posts.at(-1), intent);
      assert.equal(screen.queryByRole("link", { name: /Abrir comprobante interno/ }), null);
      assert.equal(screen.queryByText(/Movimiento confirmado/), null);
      const persisted = await state();
      assert.equal(Number(persisted.nio), 6);
      assert.equal(Number(persisted.usd), index);
      assert.equal(persisted.transactions, index + 1);
      assert.equal(persisted.receipts, index + 1);
      assert.equal(persisted.events, index);
      const id = stats.committed.at(-1);
      check(`${item.kind}: COMMIT real con respuesta perdida conserva referencia sin éxito falso`, true);
      await ui(() => first.unmount());
      // Remontaje representa reabrir el formulario en la misma pestaña, no reiniciar navegador.
      const second = await ui(() => render(React.createElement(MovementForm, props)));
      const historyLink = await screen.findByRole("link", { name: `${item.currency} ${item.amount.toFixed(2)} · ${item.concept}` });
      assert.equal(historyLink.getAttribute("href"), `/es/panel/comprobantes/${id}`);
      const retry = await screen.findByRole("button", { name: "Reintentar exactamente el mismo movimiento" });
      await ui(() => fireEvent.click(retry));
      const recovered = await screen.findByRole("link", { name: /Abrir comprobante interno/ });
      assert.equal(recovered.getAttribute("href"), `/es/panel/comprobantes/${id}`);
      assert.deepEqual(stats.posts.at(-1), intent);
      assert.equal(stats.committed.at(-1), id);
      assert.equal(sessionStorage.getItem(key), null);
      assert.deepEqual(await state(), persisted);
      check(`${item.kind}: remontaje, historial y reintento recuperan mismo recibo sin segundo movimiento`, true);
      const read = await GET(new Request(`https://strong.test/api/admin/finance?receipt=${id}`));
      assert.equal(read.status, 200);
      const receipt = await read.json();
      assert.equal(receipt.requestId, intent.requestId);
      assert.equal(receipt.accountBefore, item.kind === "expense" ? 10 : 0);
      assert.equal(receipt.accountAfter, item.kind === "expense" ? 6 : 1);
      assert.equal(receipt.amountNio, item.kind === "expense" ? 4 : 40);
      assert.equal(receipt.amountUsd, item.kind === "expense" ? 0.1 : 1);
      check(`${item.kind}: API recupera snapshot y equivalentes correctos tras reintento`, true);
      await ui(() => second.unmount());
    }
    const debtBefore=Number((await control.query('select debt_nio from member_balances where member_id=$1',[actor])).rows[0].debt_nio);
    const cashBefore=await state();
    const props={clientId:client,locale:'es'};
    const debtUi=await ui(()=>render(React.createElement(DebtForm,props)));
    await ui(()=>fireEvent.change(screen.getByLabelText('Operación'),{target:{value:'payment'}}));
    for(const [label,value] of [['Importe de deuda o abono','2'],['Método de abono','recovery-nio'],['Cuenta que recibe el abono','recovery-nio'],['Tasa NIO por 1 USD','40'],['Motivo de deuda, abono o saldo inicial','EJEMPLO abono con respuesta perdida']])
      fireEvent.change(screen.getByLabelText(label),{target:{value}});
    loseResponse=true;
    await ui(()=>fireEvent.click(screen.getByRole('button',{name:'Registrar abono de deuda'})));
    const debtKey=`strong-gym:debt-v1:${client}`;
    const debtIntent=JSON.parse(sessionStorage.getItem(debtKey));
    assert.equal(debtIntent.kind,'payment');
    const storedDebt=(await control.query('select receipt from client_debt_entries where request_id=$1',[debtIntent.requestId])).rows[0].receipt;
    const debtAfter=Number((await control.query('select debt_nio from member_balances where member_id=$1',[actor])).rows[0].debt_nio);
    assert.equal(debtAfter,debtBefore-2);assert.equal(Number((await state()).nio),Number(cashBefore.nio)+2);
    assert.equal(screen.queryByText(/Operación confirmada/),null);
    check('abono: COMMIT real disminuye deuda y aumenta Caja aunque se pierda respuesta',true);
    await ui(()=>debtUi.unmount());
    const recoveredUi=await ui(()=>render(React.createElement(DebtForm,props)));
    const committedState=await state();
    await ui(()=>fireEvent.click(screen.getByRole('button',{name:'Reintentar la misma operación'})));
    await screen.findByText(`Operación confirmada. Referencia: ${storedDebt.reference}`);
    assert.equal(sessionStorage.getItem(debtKey),null);assert.deepEqual(await state(),committedState);
    assert.equal(Number((await control.query('select debt_nio from member_balances where member_id=$1',[actor])).rows[0].debt_nio),debtAfter);
    check('abono: remontaje y mismo UUID recuperan sin segundo cobro ni segunda reducción',true);
    const debtReceiptResponse=await GET(new Request(`https://strong.test/api/admin/finance?receipt=${storedDebt.transactionId}`));
    assert.equal(debtReceiptResponse.status,200);
    const debtCashReceipt=await debtReceiptResponse.json();assert.equal(debtCashReceipt.kind,'debt_payment');
    assert.equal(debtCashReceipt.debtBefore,debtBefore);assert.equal(debtCashReceipt.debtAfter,debtAfter);
    check('abono: comprobante API conserva estado de deuda anterior y posterior',true);
    await ui(()=>recoveredUi.unmount());
    // Autorización de API conectada a profiles real, no un rol fijo del mock.
    await control.query("update profiles set role='member' where id=$1", [actor]);
    const before = await state();
    const rpcBefore = stats.rpc;
    const denied = await POST(new Request("https://strong.test/api/admin/finance", {
      method: "POST", headers: { origin: "https://strong.test", "content-type": "application/json" },
      body: JSON.stringify(stats.posts.at(-1)),
    }));
    assert.equal(denied.status, 403);
    assert.equal(stats.rpc, rpcBefore);
    assert.deepEqual(await state(), before);
    check("API con rol retirado en profiles real rechaza escritura antes del RPC", true);
    identity = null;
    assert.equal((await GET(new Request("https://strong.test/api/admin/finance"))).status, 403);
  } finally {
    cleanup?.();
    globalThis.fetch = originalFetch;
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
