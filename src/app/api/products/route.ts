import { NextResponse } from "next/server";
import { z } from "zod";
import { isFinanceRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { financeOptionsSchema } from "@/lib/finance/movements";
import {
  actionSchema,
  productFailureMessage,
  profitOf,
  saleCatalogSchema,
  type ProductAction,
} from "@/lib/products/rules";
import { sameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const nioOnly = (opts: z.infer<typeof financeOptionsSchema>) => ({
  accounts: opts.accounts.filter((a) => a.currency === "NIO"),
  methods: opts.methods.filter((m) => m.accepts_nio),
  writes_enabled: opts.writes_enabled,
});

async function context() {
  if (!isSupabaseConfigured)
    return {
      response: reply(
        { error: "Conectá Supabase; no se guardan productos de demostración." },
        503,
      ),
      db: null,
    };
  const user = await getCurrentUser();
  if (!user || !isFinanceRole(user.role))
    return {
      response: reply({ error: productFailureMessage("AUTH") }, 403),
      db: null,
    };
  const db = await getSupabaseServerClient();
  return db
    ? { db, response: null }
    : {
        db: null,
        response: reply({ error: "No se pudo confirmar la conexión." }, 503),
      };
}

/** Lectura: gestión completa o, con catalog=sale, solo productos vendibles. */
export async function GET(request: Request) {
  try {
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    if (new URL(request.url).searchParams.get("catalog") === "sale") {
      const { data, error } = await ctx.db
        .rpc("product_sale_catalog")
        .abortSignal(AbortSignal.timeout(15000));
      if (error)
        return reply({ error: productFailureMessage(undefined) }, 503);
      const parsed = saleCatalogSchema.safeParse(data);
      return parsed.success
        ? reply(parsed.data)
        : reply({ error: productFailureMessage(undefined) }, 503);
    }
    const [products, options, clients] = await Promise.all([
      ctx.db.rpc("product_list").abortSignal(AbortSignal.timeout(15000)),
      ctx.db.rpc("finance_options").abortSignal(AbortSignal.timeout(15000)),
      ctx.db
        .from("gym_clients")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name")
        .limit(500)
        .abortSignal(AbortSignal.timeout(15000)),
    ]);
    if (products.error || options.error || clients.error)
      return reply(
        { error: productFailureMessage(undefined) },
        503,
      );
    const parsed = financeOptionsSchema.safeParse(options.data);
    const list = z.array(z.any()).safeParse(products.data);
    if (!parsed.success || !list.success)
      return reply({ error: productFailureMessage(undefined) }, 503);
    return reply({
      products: list.data,
      options: nioOnly(parsed.data),
      clients: clients.data ?? [],
    });
  } catch {
    return reply({ error: productFailureMessage(undefined) }, 503);
  }
}

async function run(db: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, body: ProductAction) {
  switch (body.action) {
    case "save": {
      const p = body.product;
      return db.rpc("product_save", {
        p_id: p.id,
        p_name: p.name,
        p_category: p.category,
        p_subcategory: p.subcategory || null,
        p_attributes: p.attributes,
        p_status: p.status,
        p_cost: p.cost,
        p_price: p.price,
        p_stock_min: p.stock_min,
        p_image: p.image,
      });
    }
    case "purchase": {
      const x = body.purchase;
      return db.rpc("product_purchase", {
        p_request: x.request,
        p_product: x.product,
        p_qty: x.qty,
        p_unit_cost: x.unit_cost,
        p_method: x.method,
        p_account: x.account,
        p_category: "exp_inventario",
        p_note: x.note,
      });
    }
    case "sell": {
      const x = body.sale;
      return db.rpc("product_sell", {
        p_request: x.request,
        p_product: x.product,
        p_qty: x.qty,
        p_client: x.client,
        p_method: x.method,
        p_account: x.account,
      });
    }
    case "adjust": {
      const x = body.adjust;
      return db.rpc("product_stock_adjust", {
        p_product: x.product,
        p_qty: x.qty,
        p_note: x.note,
      });
    }
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Origen no permitido." }, 403);
  try {
    const ctx = await context();
    if (!ctx.db) return ctx.response;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return reply(
        { error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario." },
        422,
      );
    const body = parsed.data;
    const { data, error } = await run(ctx.db, body);
    if (error) {
      const code = /^[A-Z_]{4,40}$/.test(error.message ?? "") ? error.message : undefined;
      const status = code === "AUTH" ? 403 : code === "NOT_FOUND" ? 404 : 422;
      return reply(
        { error: productFailureMessage(code), code: code ?? "UNKNOWN" },
        status,
      );
    }
    return reply({ ok: true, result: data, profit: body.action === "save" ? profitOf(body.product.price, body.product.cost) : null });
  } catch {
    return reply({ error: productFailureMessage(undefined) }, 503);
  }
}
