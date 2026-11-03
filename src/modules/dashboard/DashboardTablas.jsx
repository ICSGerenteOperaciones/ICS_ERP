import { useDb } from '../../data/db';
import DataTable from '../../components/DataTable';
import { Card, Progress, StatusBadge, Tag, fmtDate, fmtDateTime, fmtMoney } from '../../components/ui';
import { WORKFLOWS } from '../../workflow/definitions';
import { avanceActividad, compraTotales, movimientoValor, stockMap, terceroName, monthOf } from '../../data/lookups';

// Vista "Tabla" del dashboard: los mismos indicadores que los gráficos, en tablas ordenables.
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const money = (key) => ({ key, label: '', align: 'right', render: (r) => fmtMoney(r[key]), sortValue: (r) => r[key] });
const col = (key, label, extra = {}) => ({ key, label, ...extra });

const countBy = (rows, fn) => {
  const m = {};
  rows.forEach((r) => {
    const k = fn(r);
    m[k] = (m[k] || 0) + 1;
  });
  return m;
};

const BUILDERS = {
  resumen: (d) => {
    const stock = stockMap();
    const vivas = d.list('compras', (c) => c.estado !== 'ANULADA');
    const rows = [
      ['Compras comprometidas 2026', fmtMoney(vivas.reduce((s, c) => s + compraTotales(c.id).total, 0)), 'Compras'],
      ['Órdenes por aprobar', d.list('compras', (c) => c.estado === 'SOLICITADA').length, 'Compras'],
      ['Documentos en firma', d.list('firmas', (f) => f.estado === 'EN_FIRMA').length, 'Firmas'],
      ['Actividades abiertas', d.list('actividades', (a) => ['PLANEADA', 'EN_CURSO', 'EN_REVISION'].includes(a.estado)).length, 'Actividades'],
      ['Terceros activos', d.list('terceros', (t) => t.estado === 'ACTIVO').length, 'Terceros'],
      ['Artículos bajo mínimo', d.list('articulos', (a) => a.activo !== false && (stock[a.id] || 0) < a.stock_minimo).length, 'Inventario'],
    ].map(([indicador, valor, modulo], i) => ({ id: i, indicador, valor, modulo }));
    return [{ title: 'Indicadores clave', columns: [col('indicador', 'Indicador'), col('modulo', 'Módulo'), col('valor', 'Valor', { align: 'right' })], rows }];
  },

  compras: (d) => {
    const vivas = d.list('compras', (c) => c.estado !== 'ANULADA');
    const meses = MESES.slice(0, 10).map((mes, i) => ({ id: mes, mes, ordenes: 0, valor: 0, i }));
    const prov = {};
    vivas.forEach((c) => {
      const t = compraTotales(c.id).total;
      const mi = monthOf(c.fecha);
      if (meses[mi]) {
        meses[mi].ordenes += 1;
        meses[mi].valor += t;
      }
      prov[c.proveedor_id] ??= { id: c.proveedor_id, nombre: terceroName(c.proveedor_id), ordenes: 0, valor: 0 };
      prov[c.proveedor_id].ordenes += 1;
      prov[c.proveedor_id].valor += t;
    });
    const estados = Object.entries(WORKFLOWS.compras.states).map(([k, s]) => ({ id: k, estado: s.label, cantidad: d.list('compras', (c) => c.estado === k).length }));
    return [
      { title: 'Valor comprado por mes', columns: [col('mes', 'Mes', { sortValue: (r) => r.i }), col('ordenes', 'Órdenes', { align: 'right' }), { ...money('valor'), label: 'Valor (COP con IVA)' }], rows: meses },
      { title: 'Órdenes por estado', columns: [col('estado', 'Estado'), col('cantidad', 'Órdenes', { align: 'right' })], rows: estados },
      { title: 'Proveedores', columns: [col('nombre', 'Proveedor'), col('ordenes', 'Órdenes', { align: 'right' }), { ...money('valor'), label: 'Valor comprometido' }], rows: Object.values(prov).sort((a, b) => b.valor - a.valor) },
    ];
  },

  firmas: (d) => {
    const estados = Object.entries(WORKFLOWS.firmas.states).map(([k, s]) => ({ id: k, estado: s.label, cantidad: d.list('firmas', (f) => f.estado === k).length }));
    const enFirma = d.list('firmas', (f) => f.estado === 'EN_FIRMA').map((f) => {
      const fs = d.details('firmas', f.id, 'firmas_firmantes');
      return { ...f, firmas: `${fs.filter((x) => x.estado === 'FIRMADO').length}/${fs.length}` };
    });
    return [
      { title: 'Documentos por estado', columns: [col('estado', 'Estado'), col('cantidad', 'Documentos', { align: 'right' })], rows: estados },
      {
        title: 'Documentos en firma',
        columns: [col('codigo', 'Código', { render: (r) => <span className="code">{r.codigo}</span> }), col('titulo', 'Documento'), col('tipo', 'Tipo'), col('firmas', 'Firmas'), col('fecha_limite', 'Vence', { render: (r) => fmtDate(r.fecha_limite) })],
        rows: enFirma.sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite)),
      },
    ];
  },

  actividades: (d) => {
    const abiertas = d.list('actividades', (a) => !['COMPLETADA', 'CANCELADA'].includes(a.estado)).map((a) => ({ ...a, pct: avanceActividad(a.id) }));
    const carga = countBy(d.list('actividades_tareas', (t) => !t.completada), (t) => t.responsable);
    return [
      {
        title: 'Actividades abiertas',
        columns: [
          col('codigo', 'Código', { render: (r) => <span className="code">{r.codigo}</span> }),
          col('titulo', 'Actividad'),
          col('responsable', 'Responsable'),
          col('estado', 'Estado', { render: (r) => <StatusBadge module="actividades" estado={r.estado} />, sortValue: (r) => r.estado }),
          col('pct', 'Avance', { render: (r) => <Progress value={r.pct} />, sortValue: (r) => r.pct }),
        ],
        rows: abiertas.sort((a, b) => b.pct - a.pct),
      },
      { title: 'Tareas pendientes por responsable', columns: [col('nombre', 'Responsable'), col('n', 'Tareas', { align: 'right' })], rows: Object.entries(carga).map(([nombre, n]) => ({ id: nombre, nombre, n })).sort((a, b) => b.n - a.n) },
    ];
  },

  terceros: (d) => {
    const ts = d.list('terceros');
    const tipos = countBy(ts, (t) => t.tipo);
    const ciudades = countBy(ts, (t) => t.ciudad);
    const toRows = (o) => Object.entries(o).map(([nombre, n]) => ({ id: nombre, nombre, n })).sort((a, b) => b.n - a.n);
    return [
      { title: 'Terceros por tipo', columns: [col('nombre', 'Tipo'), col('n', 'Terceros', { align: 'right' })], rows: toRows(tipos) },
      { title: 'Terceros por ciudad', columns: [col('nombre', 'Ciudad'), col('n', 'Terceros', { align: 'right' })], rows: toRows(ciudades) },
    ];
  },

  inventario: (d) => {
    const stock = stockMap();
    const arts = d.list('articulos').map((a) => ({ ...a, stock: stock[a.id] || 0, valor: (stock[a.id] || 0) * a.ultimo_costo }));
    const cat = {};
    arts.forEach((a) => {
      cat[a.categoria] ??= { id: a.categoria, categoria: a.categoria, articulos: 0, valor: 0 };
      cat[a.categoria].articulos += 1;
      cat[a.categoria].valor += a.valor;
    });
    const meses = MESES.slice(0, 10).map((mes, i) => ({ id: mes, mes, entradas: 0, salidas: 0, i }));
    d.list('inventario', (m) => m.estado === 'CONFIRMADO').forEach((m) => {
      const x = meses[monthOf(m.fecha)];
      if (!x) return;
      if (m.tipo === 'Salida') x.salidas += movimientoValor(m.id);
      else if (m.tipo !== 'Ajuste') x.entradas += movimientoValor(m.id);
    });
    return [
      {
        title: 'Artículos y existencias',
        columns: [
          col('codigo', 'Código', { render: (r) => <span className="code">{r.codigo}</span> }),
          col('nombre', 'Artículo'),
          col('stock', 'Existencias', { align: 'right', render: (r) => `${r.stock} ${r.unidad}` }),
          col('stock_minimo', 'Mínimo', { align: 'right' }),
          { ...money('valor'), label: 'Valor' },
          col('estado', 'Stock', { render: (r) => (r.stock <= 0 ? <Tag tone="critical">Sin stock</Tag> : r.stock < r.stock_minimo ? <Tag tone="warning">Bajo mínimo</Tag> : <Tag tone="good">Disponible</Tag>), sortValue: (r) => r.stock / (r.stock_minimo || 1) }),
        ],
        rows: arts,
      },
      { title: 'Valor por categoría', columns: [col('categoria', 'Categoría'), col('articulos', 'Artículos', { align: 'right' }), { ...money('valor'), label: 'Valor' }], rows: Object.values(cat).sort((a, b) => b.valor - a.valor) },
      { title: 'Entradas y salidas por mes', columns: [col('mes', 'Mes', { sortValue: (r) => r.i }), { ...money('entradas'), label: 'Entradas' }, { ...money('salidas'), label: 'Salidas' }], rows: meses },
    ];
  },

  auditorias: (d) => {
    const logs = d.list('auditoria_logs');
    const meses = MESES.slice(0, 10).map((mes, i) => ({ id: mes, mes, eventos: 0, i }));
    logs.forEach((l) => {
      const x = meses[new Date(l.fecha).getMonth()];
      if (x) x.eventos += 1;
    });
    const acc = countBy(logs, (l) => l.accion);
    const criticos = logs.filter((l) => l.nivel === 'critical').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
    return [
      { title: 'Eventos por mes', columns: [col('mes', 'Mes', { sortValue: (r) => r.i }), col('eventos', 'Eventos', { align: 'right' })], rows: meses },
      { title: 'Eventos por acción', columns: [col('nombre', 'Acción'), col('n', 'Eventos', { align: 'right' })], rows: Object.entries(acc).map(([nombre, n]) => ({ id: nombre, nombre, n })).sort((a, b) => b.n - a.n) },
      {
        title: 'Eventos críticos recientes',
        columns: [col('fecha', 'Fecha', { render: (r) => fmtDateTime(r.fecha), sortValue: (r) => r.fecha }), col('usuario', 'Usuario'), col('accion', 'Acción'), col('descripcion', 'Descripción')],
        rows: criticos,
      },
    ];
  },
};

export default function DashboardTablas({ view }) {
  const tablas = useDb((d) => BUILDERS[view]?.(d) || [], [view]);
  return (
    <section className="dash-section">
      <div className="dash-tables">
        {tablas.map((t) => (
          <Card key={t.title} title={t.title} subtitle={`${t.rows.length} registros`} className="flush">
            <DataTable dense columns={t.columns} rows={t.rows} empty="Sin datos" />
          </Card>
        ))}
      </div>
    </section>
  );
}
