import { db } from './db';

export const terceroOptions = (tipo) => () =>
  db
    .list('terceros', (t) => (!tipo || t.tipo === tipo) && t.estado !== 'BLOQUEADO')
    .map((t) => ({ value: t.id, label: t.razon_social }));

export const terceroName = (id) => db.get('terceros', id)?.razon_social || '—';

export const usuarioOptions = () => db.list('usuarios', (u) => u.activo).map((u) => ({ value: u.nombre, label: u.nombre }));

export const itemSubtotal = (i) => (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0);
export const itemTotal = (i) => itemSubtotal(i) * (1 + (Number(i.iva) || 0) / 100);

/** Totales de una orden de compra a partir de su detalle de ítems. */
export function compraTotales(compraId) {
  const items = db.details('compras', compraId, 'compras_items');
  const subtotal = items.reduce((s, i) => s + itemSubtotal(i), 0);
  const total = items.reduce((s, i) => s + itemTotal(i), 0);
  return { items: items.length, subtotal, iva: total - subtotal, total };
}

/** Avance de una actividad = % de tareas completadas. */
export function avanceActividad(actId) {
  const t = db.details('actividades', actId, 'actividades_tareas');
  return t.length ? (t.filter((x) => x.completada).length / t.length) * 100 : 0;
}

/** Mes (0–11) de una fecha pura "AAAA-MM-DD" o ISO, sin depender de la zona horaria. */
export const monthOf = (v) => parseInt(String(v).slice(5, 7), 10) - 1;

// ---------- Inventario ----------
/** Efecto de una línea sobre el stock: entradas suman, salidas restan, ajustes llevan su propio signo. */
export const signedQty = (tipo, cantidad) => (tipo === 'Salida' ? -1 : 1) * (Number(cantidad) || 0);

/** Existencias por artículo: solo cuentan los movimientos CONFIRMADOS. */
export function stockMap() {
  const confirmados = new Map(db.list('inventario', (m) => m.estado === 'CONFIRMADO').map((m) => [m.id, m.tipo]));
  const stock = {};
  db.list('inventario_lineas').forEach((l) => {
    const tipo = confirmados.get(l.movimiento_id);
    if (tipo) stock[l.articulo_id] = (stock[l.articulo_id] || 0) + signedQty(tipo, l.cantidad);
  });
  return stock;
}

export const articuloOptions = () =>
  db.list('articulos', (a) => a.activo !== false).map((a) => ({ value: a.id, label: `${a.codigo} · ${a.nombre}` }));

export const articuloName = (id) => db.get('articulos', id)?.nombre || '—';

export const compraLabel = (id) => {
  const c = db.get('compras', id);
  return c ? `${c.codigo} · ${terceroName(c.proveedor_id)}` : '—';
};

/** Valor del movimiento = suma de cantidad × costo de sus líneas. */
export const movimientoValor = (movId) =>
  db
    .details('inventario', movId, 'inventario_lineas')
    .reduce((s, l) => s + Math.abs(Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0), 0);
