import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttributes, profitOf, dataUrlBytes, productSchema, actionSchema, productFailureMessage, saleCatalogSchema, MAX_IMAGE_CHARS } from '../src/lib/products/rules.ts';

test('atributos: una línea por dato, ignora líneas sin clave o valor', () => {
  assert.deepEqual(parseAttributes('Sabor: chocolate\n\n: sin clave\nTamaño: 2 lb\nvacío:   \n'), { Sabor: 'chocolate', 'Tamaño': '2 lb' });
});

test('ganancia = precio − costo con dos decimales', () => {
  assert.equal(profitOf(35, 20), 15);
  assert.equal(profitOf(35.1, 20.05), 15.05);
});

test('tamaño de la imagen en bytes binarios', () => {
  // "hola" en base64 = "aG9sYQ==" → 4 bytes
  assert.equal(dataUrlBytes('data:image/jpeg;base64,aG9sYQ=='), 4);
  assert.equal(dataUrlBytes('aG9sYQ=='), 4);
});

const base = { id: null, name: 'Proteína', category: 'Suplementos', subcategory: null, attributes: {}, status: 'activo', cost: 20, price: 35, stock_min: 2, image: null };

test('producto válido y precio con más de dos decimales rechazado', () => {
  assert.ok(productSchema.safeParse(base).success);
  assert.equal(productSchema.safeParse({ ...base, price: 35.123 }).success, false);
  assert.equal(productSchema.safeParse({ ...base, price: -1 }).success, false);
});

test('la imagen debe ser JPEG en base64 y no pasar el límite', () => {
  assert.equal(productSchema.safeParse({ ...base, image: 'data:image/png;base64,AAAA' }).success, false);
  assert.equal(productSchema.safeParse({ ...base, image: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_IMAGE_CHARS) }).success, false);
  assert.ok(productSchema.safeParse({ ...base, image: 'data:image/jpeg;base64,AAAA' }).success);
});

test('acciones: compra exige costo mayor que cero y referencia', () => {
  const req = '11111111-1111-4111-8111-111111111111';
  const pid = '22222222-2222-4222-8222-222222222222';
  assert.equal(actionSchema.safeParse({ action: 'purchase', purchase: { request: req, product: pid, qty: 2, unit_cost: 0, method: 'm', account: 'a', note: null } }).success, false);
  assert.ok(actionSchema.safeParse({ action: 'purchase', purchase: { request: req, product: pid, qty: 2, unit_cost: 10, method: 'm', account: 'a', note: null } }).success);
  assert.equal(actionSchema.safeParse({ action: 'adjust', adjust: { product: pid, qty: 0, note: 'conteo' } }).success, false);
});

test('catálogo de venta: solo precio y stock vendibles, sin costo ni ganancia', () => {
  const pid = '22222222-2222-4222-8222-222222222222';
  const parsed = saleCatalogSchema.parse({
    products: [{
      id: pid,
      name: 'Agua mineral',
      category: 'Bebidas',
      subcategory: null,
      attributes: { Tamaño: '600 ml' },
      price: 25,
      stock: 4,
      low_stock: false,
      image_data: null,
      cost: 10,
      profit: 15,
    }],
  });
  assert.deepEqual(Object.keys(parsed.products[0]).sort(), [
    'attributes', 'category', 'id', 'image_data', 'low_stock', 'name', 'price', 'stock', 'subcategory',
  ]);
  // Un catálogo anterior a la 00060 (sin la clave) sigue siendo válido.
  const legacy = { ...parsed.products[0] };
  delete legacy.image_data;
  assert.equal(saleCatalogSchema.safeParse({ products: [legacy] }).success, true);
  assert.equal(saleCatalogSchema.safeParse({ products: [{ ...parsed.products[0], price: 0 }] }).success, false);
  assert.equal(saleCatalogSchema.safeParse({ products: [{ ...parsed.products[0], stock: 0 }] }).success, false);
});

test('mensajes: códigos conocidos en español, desconocidos sin detalle técnico', () => {
  assert.match(productFailureMessage('SIN_STOCK'), /stock/);
  assert.match(productFailureMessage('ALGO_RARO'), /No se pudo confirmar/);
  assert.doesNotMatch(productFailureMessage(undefined), /null|undefined|error/i);
});
