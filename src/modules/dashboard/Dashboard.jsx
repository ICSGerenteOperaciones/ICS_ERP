import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardTablas from './DashboardTablas';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, AreaChart, Area, LabelList,
} from 'recharts';
import { LayoutDashboard, ShoppingCart, PenTool, ListChecks, Users2, Workflow, TrendingUp, Filter, ChevronDown, Warehouse, ScrollText, BarChart3, Table2 } from 'lucide-react';
import { useDb } from '../../data/db';
import { useAuth } from '../../auth/AuthContext';
import { DASHBOARDS } from '../../config/modules';
import { compraTotales, avanceActividad, terceroName, stockMap, movimientoValor, monthOf } from '../../data/lookups';
import { WORKFLOWS } from '../../workflow/definitions';
import { Card, Empty, fmtCompact, fmtDate, fmtDateTime, fmtMoney, Progress, StatusBadge, Tag } from '../../components/ui';
import { PendingList } from '../../components/WorkflowPanels';
import { pendingFor } from '../../workflow/engine';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const AXIS = { fill: 'var(--muted)', fontSize: 11 };
const GRID = { stroke: 'var(--grid)', strokeDasharray: '0', vertical: false };

// ---------- piezas de gráfico ----------
function ChartTooltip({ active, payload, label, format = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label != null && <strong>{label}</strong>}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="chart-tip-row">
          <i style={{ background: p.payload?.color || p.color || p.fill }} aria-hidden />
          <span>{p.name}</span>
          <b>{format(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint, onClick }) {
  return (
    <button className="stat" onClick={onClick}>
      <span className="stat-icon">
        <Icon size={18} aria-hidden />
      </span>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </button>
  );
}

function Legend({ items }) {
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.name}>
          <i style={{ background: it.color }} aria-hidden />
          <span>{it.name}</span>
          <b>{it.value}</b>
        </li>
      ))}
    </ul>
  );
}

// ---------- widgets ----------
function ResumenWidget() {
  const navigate = useNavigate();
  const data = useDb((d) => {
    const year = d.list('compras', (c) => c.estado !== 'ANULADA');
    return {
      gasto: year.reduce((s, c) => s + compraTotales(c.id).total, 0),
      porAprobar: d.list('compras', (c) => c.estado === 'SOLICITADA').length,
      enFirma: d.list('firmas', (f) => f.estado === 'EN_FIRMA').length,
      actAbiertas: d.list('actividades', (a) => ['PLANEADA', 'EN_CURSO', 'EN_REVISION'].includes(a.estado)).length,
      tercerosActivos: d.list('terceros', (t) => t.estado === 'ACTIVO').length,
      bajoMinimo: (() => {
        const st = stockMap();
        return d.list('articulos', (a) => a.activo !== false && (st[a.id] || 0) < a.stock_minimo).length;
      })(),
    };
  });
  return (
    <section className="dash-section">
      <SectionTitle icon={LayoutDashboard} title="Resumen ejecutivo" />
      <div className="stat-row">
        <StatTile icon={TrendingUp} label="Compras comprometidas 2026" value={`$${fmtCompact(data.gasto)}`} hint="COP con IVA, sin anuladas" onClick={() => navigate('/compras')} />
        <StatTile icon={ShoppingCart} label="Órdenes por aprobar" value={data.porAprobar} hint="estado Solicitada" onClick={() => navigate('/compras')} />
        <StatTile icon={PenTool} label="Documentos en firma" value={data.enFirma} hint="esperando firmantes" onClick={() => navigate('/firmas')} />
        <StatTile icon={ListChecks} label="Actividades abiertas" value={data.actAbiertas} hint="planeadas, en curso o revisión" onClick={() => navigate('/actividades')} />
        <StatTile icon={Users2} label="Terceros activos" value={data.tercerosActivos} onClick={() => navigate('/terceros')} />
        <StatTile icon={Warehouse} label="Artículos bajo mínimo" value={data.bajoMinimo} hint="reposición de inventario" onClick={() => navigate('/inventario')} />
      </div>
    </section>
  );
}

function ComprasWidget() {
  const { mensual, top, estados } = useDb((d) => {
    const vivas = d.list('compras', (c) => c.estado !== 'ANULADA');
    const mensual = MESES.slice(0, 10).map((m) => ({ mes: m, valor: 0 }));
    const porProv = {};
    vivas.forEach((c) => {
      const t = compraTotales(c.id).total;
      const mi = monthOf(c.fecha);
      if (mensual[mi]) mensual[mi].valor += t;
      porProv[c.proveedor_id] = (porProv[c.proveedor_id] || 0) + t;
    });
    const top = Object.entries(porProv)
      .map(([id, valor]) => ({ nombre: terceroName(id), valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
    const estados = Object.entries(WORKFLOWS.compras.states).map(([k, s]) => ({
      estado: s.label, cantidad: d.list('compras', (c) => c.estado === k).length,
    }));
    return { mensual, top, estados };
  });
  return (
    <section className="dash-section">
      <SectionTitle icon={ShoppingCart} title="Compras" />
      <div className="dash-grid">
        <Card title="Valor comprado por mes" subtitle="COP con IVA · 2026" className="span-2">
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={mensual} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="mes" tick={AXIS} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={48} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip format={(v) => fmtMoney(v)} />} />
                <Bar dataKey="valor" name="Valor" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Órdenes por estado" subtitle="Cantidad de órdenes">
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={estados} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="estado" tick={AXIS} axisLine={false} tickLine={false} width={80} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip />} />
                <Bar dataKey="cantidad" name="Órdenes" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={14}>
                  <LabelList dataKey="cantidad" position="right" fill="var(--text-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top 5 proveedores" subtitle="Valor comprometido" className="span-3">
          <ul className="rank">
            {top.map((p, i) => (
              <li key={p.nombre}>
                <span className="rank-n">{i + 1}</span>
                <span className="rank-name">{p.nombre}</span>
                <span className="rank-bar">
                  <i style={{ width: `${(p.valor / top[0].valor) * 100}%` }} />
                </span>
                <b>${fmtCompact(p.valor)}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}

function FirmasWidget() {
  const { estados, proximos } = useDb((d) => {
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
    const estados = Object.entries(WORKFLOWS.firmas.states)
      .map(([k, s], i) => ({ name: s.label, value: d.list('firmas', (f) => f.estado === k).length, color: colors[i] }))
      .filter((e) => e.value > 0);
    const proximos = d
      .list('firmas', (f) => f.estado === 'EN_FIRMA')
      .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
      .slice(0, 5);
    return { estados, proximos };
  });
  const total = estados.reduce((s, e) => s + e.value, 0);
  return (
    <section className="dash-section">
      <SectionTitle icon={PenTool} title="Firmas" />
      <div className="dash-grid">
        <Card title="Documentos por estado" subtitle={`${total} documentos`}>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={estados} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                  {estados.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{total}</strong>
              <span>docs</span>
            </div>
          </div>
          <Legend items={estados} />
        </Card>
        <Card title="Próximos vencimientos" subtitle="Documentos en firma" className="span-2">
          {proximos.length ? (
            <ul className="list">
              {proximos.map((f) => (
                <li key={f.id}>
                  <span className="code">{f.codigo}</span>
                  <span className="grow">{f.titulo}</span>
                  <span className="muted small">vence {fmtDate(f.fecha_limite)}</span>
                  <StatusBadge module="firmas" estado={f.estado} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Sin documentos en firma" />
          )}
        </Card>
      </div>
    </section>
  );
}

function ActividadesWidget() {
  const { avance, carga } = useDb((d) => {
    const abiertas = d.list('actividades', (a) => !['COMPLETADA', 'CANCELADA'].includes(a.estado));
    const avance = abiertas.map((a) => ({ ...a, pct: avanceActividad(a.id) })).sort((a, b) => b.pct - a.pct);
    const carga = {};
    d.list('actividades_tareas', (t) => !t.completada).forEach((t) => (carga[t.responsable] = (carga[t.responsable] || 0) + 1));
    return { avance, carga: Object.entries(carga).map(([nombre, tareas]) => ({ nombre: nombre.split(' ')[0], tareas })) };
  });
  return (
    <section className="dash-section">
      <SectionTitle icon={ListChecks} title="Actividades" />
      <div className="dash-grid">
        <Card title="Avance de actividades abiertas" subtitle="% de tareas completadas" className="span-2">
          <ul className="list">
            {avance.map((a) => (
              <li key={a.id}>
                <span className="grow">{a.titulo}</span>
                <StatusBadge module="actividades" estado={a.estado} />
                <span className="w-160">
                  <Progress value={a.pct} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Tareas pendientes por responsable">
          <div className="chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={carga} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="nombre" tick={AXIS} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip />} />
                <Bar dataKey="tareas" name="Tareas" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={34}>
                  <LabelList dataKey="tareas" position="top" fill="var(--text-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </section>
  );
}

function TercerosWidget() {
  const { tipos, ciudades } = useDb((d) => {
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
    const ts = d.list('terceros');
    const tipos = ['Proveedor', 'Cliente', 'Aliado', 'Empleado']
      .map((t, i) => ({ name: t, value: ts.filter((x) => x.tipo === t).length, color: colors[i] }))
      .filter((t) => t.value);
    const c = {};
    ts.forEach((t) => (c[t.ciudad] = (c[t.ciudad] || 0) + 1));
    return { tipos, ciudades: Object.entries(c).map(([ciudad, n]) => ({ ciudad, n })).sort((a, b) => b.n - a.n) };
  });
  const total = tipos.reduce((s, t) => s + t.value, 0);
  return (
    <section className="dash-section">
      <SectionTitle icon={Users2} title="Terceros" />
      <div className="dash-grid">
        <Card title="Terceros por tipo" subtitle={`${total} registrados`}>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tipos} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                  {tipos.map((t) => (
                    <Cell key={t.name} fill={t.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{total}</strong>
              <span>terceros</span>
            </div>
          </div>
          <Legend items={tipos} />
        </Card>
        <Card title="Distribución por ciudad" className="span-2">
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ciudades} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="ciudad" tick={AXIS} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip />} />
                <Bar dataKey="n" name="Terceros" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <LabelList dataKey="n" position="top" fill="var(--text-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </section>
  );
}

function InventarioWidget() {
  const { valor, bajos, porMes, porCategoria, totales } = useDb((d) => {
    const stock = stockMap();
    const arts = d.list('articulos');
    const valor = arts.reduce((s, a) => s + (stock[a.id] || 0) * a.ultimo_costo, 0);
    const bajos = arts
      .map((a) => ({ ...a, stock: stock[a.id] || 0 }))
      .filter((a) => a.stock < a.stock_minimo)
      .sort((x, y) => x.stock / x.stock_minimo - y.stock / y.stock);
    const porMes = MESES.slice(0, 10).map((mes) => ({ mes, entradas: 0, salidas: 0 }));
    const totales = { entradas: 0, salidas: 0 };
    d.list('inventario', (m) => m.estado === 'CONFIRMADO').forEach((m) => {
      const i = monthOf(m.fecha);
      const v = movimientoValor(m.id);
      if (m.tipo === 'Salida') {
        if (porMes[i]) porMes[i].salidas += v;
        totales.salidas += v;
      } else if (m.tipo !== 'Ajuste') {
        if (porMes[i]) porMes[i].entradas += v;
        totales.entradas += v;
      }
    });
    const cat = {};
    arts.forEach((a) => (cat[a.categoria] = (cat[a.categoria] || 0) + (stock[a.id] || 0) * a.ultimo_costo));
    const porCategoria = Object.entries(cat)
      .map(([nombre, v]) => ({ nombre, valor: v }))
      .sort((a, b) => b.valor - a.valor);
    return { valor, bajos, porMes, porCategoria, totales };
  });
  return (
    <section className="dash-section">
      <SectionTitle icon={Warehouse} title="Inventario" />
      <div className="dash-grid">
        <Card title="Entradas y salidas por mes" subtitle={`Valor movido · inventario valorizado en $${fmtCompact(valor)}`} className="span-2">
          <Legend
            items={[
              { name: 'Entradas', color: 'var(--series-1)', value: `$${fmtCompact(totales.entradas)}` },
              { name: 'Salidas', color: 'var(--series-2)', value: `$${fmtCompact(totales.salidas)}` },
            ]}
          />
          <div className="chart">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="mes" tick={AXIS} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={48} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip format={(v) => fmtMoney(v)} />} />
                <Bar dataKey="entradas" name="Entradas" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar dataKey="salidas" name="Salidas" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Artículos bajo el mínimo" subtitle={`${bajos.length} requieren reposición`}>
          {bajos.length ? (
            <ul className="list">
              {bajos.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span className="grow">{a.nombre}</span>
                  <span className="muted small">
                    {a.stock} / {a.stock_minimo} {a.unidad}
                  </span>
                  <Tag tone={a.stock <= 0 ? 'critical' : 'warning'}>{a.stock <= 0 ? 'Sin stock' : 'Bajo mínimo'}</Tag>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Stock en niveles normales" />
          )}
        </Card>
        <Card title="Valor del inventario por categoría" subtitle="Existencias × último costo" className="span-3">
          <ul className="rank">
            {porCategoria.map((c, i) => (
              <li key={c.nombre}>
                <span className="rank-n">{i + 1}</span>
                <span className="rank-name">{c.nombre}</span>
                <span className="rank-bar">
                  <i style={{ width: `${porCategoria[0].valor ? (c.valor / porCategoria[0].valor) * 100 : 0}%` }} />
                </span>
                <b>${fmtCompact(c.valor)}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}


function AuditoriaWidget() {
  const { porMes, acciones, topUsuarios, criticos, total } = useDb((d) => {
    const logs = d.list('auditoria_logs');
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
    const porMes = MESES.slice(0, 10).map((mes) => ({ mes, eventos: 0 }));
    logs.forEach((l) => {
      const i = new Date(l.fecha).getMonth();
      if (porMes[i]) porMes[i].eventos += 1;
    });
    const grupos = [
      ['Creación', ['CREAR']],
      ['Edición', ['EDITAR']],
      ['Flujo', ['WORKFLOW']],
      ['Eliminación', ['ELIMINAR']],
      ['Sesión', ['LOGIN', 'LOGOUT', 'LOGIN_FALLIDO']],
    ];
    const acciones = grupos
      .map(([name, keys], i) => ({ name, value: logs.filter((l) => keys.includes(l.accion)).length, color: colors[i] }))
      .filter((a) => a.value);
    const u = {};
    logs.filter((l) => l.usuario_id && l.usuario_id !== 'sistema' && !['LOGIN', 'LOGOUT'].includes(l.accion)).forEach((l) => (u[l.usuario] = (u[l.usuario] || 0) + 1));
    const topUsuarios = Object.entries(u)
      .map(([nombre, n]) => ({ nombre, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
    const criticos = logs.filter((l) => l.nivel === 'critical').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
    return { porMes, acciones, topUsuarios, criticos, total: logs.length };
  });
  return (
    <section className="dash-section">
      <SectionTitle icon={ScrollText} title="Auditoría" />
      <div className="dash-grid">
        <Card title="Eventos por mes" subtitle={`${total} eventos registrados · 2026`} className="span-2">
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="mes" tick={AXIS} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip />} />
                <Bar dataKey="eventos" name="Eventos" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Eventos por tipo de acción" subtitle={`${total} en total`}>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={acciones} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                  {acciones.map((a) => (
                    <Cell key={a.name} fill={a.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{total}</strong>
              <span>eventos</span>
            </div>
          </div>
          <Legend items={acciones} />
        </Card>
        <Card title="Usuarios con más cambios" subtitle="Creaciones, ediciones, flujo y eliminaciones">
          <ul className="rank">
            {topUsuarios.map((u, i) => (
              <li key={u.nombre}>
                <span className="rank-n">{i + 1}</span>
                <span className="rank-name">{u.nombre}</span>
                <span className="rank-bar">
                  <i style={{ width: `${(u.n / topUsuarios[0].n) * 100}%` }} />
                </span>
                <b>{u.n}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Eventos críticos recientes" subtitle="Eliminaciones e ingresos fallidos" className="span-2">
          {criticos.length ? (
            <ul className="list">
              {criticos.map((l) => (
                <li key={l.id}>
                  <Tag tone="critical">{l.accion === 'ELIMINAR' ? 'Eliminación' : 'Ingreso fallido'}</Tag>
                  <span className="grow">{l.descripcion}</span>
                  <span className="muted small">{l.usuario}</span>
                  <span className="muted small">{fmtDateTime(l.fecha)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Sin eventos críticos" />
          )}
        </Card>
      </div>
    </section>
  );
}

/** Flujo de trabajo del dashboard: bandeja de aprobación (y actividad de flujo en el resumen). */
function FlujoSection({ module }) {
  const { can } = useAuth();
  const pendientes = useDb(() => pendingFor(can).filter((p) => !module || p.module === module).length, [can, module]);
  const serie = useDb((d) => {
    const m = MESES.slice(0, 10).map((mes) => ({ mes, movimientos: 0 }));
    d.list('workflow_historial', (h) => !module || h.modulo === module).forEach((h) => {
      const i = new Date(h.fecha).getMonth();
      if (m[i]) m[i].movimientos += 1;
    });
    return m;
  }, [module]);
  if (module && pendientes === 0) return null;
  return (
    <section className="dash-section">
      <SectionTitle icon={Workflow} title="Flujo de trabajo" />
      <div className="dash-grid">
        <Card title="Pendientes de mi aprobación" subtitle={`${pendientes} por atender`} className={module ? 'span-3' : 'span-2'}>
          <PendingList module={module} limit={6} />
        </Card>
        {!module && (
          <Card title="Movimientos de flujo por mes" subtitle="Transiciones registradas · 2026">
            <div className="chart">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wf-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--series-1)" stopOpacity={0.35} />
                      <stop offset="1" stopColor="var(--series-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="mes" tick={AXIS} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip cursor={{ stroke: 'var(--axis)' }} content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="movimientos" name="Movimientos" stroke="var(--series-1)" strokeWidth={2} fill="url(#wf-area)" activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <h2 className="section-title">
      <Icon size={16} aria-hidden /> {title}
    </h2>
  );
}

const WIDGETS = {
  resumen: ResumenWidget,
  compras: ComprasWidget,
  firmas: FirmasWidget,
  actividades: ActividadesWidget,
  terceros: TercerosWidget,
  inventario: InventarioWidget,
  auditorias: AuditoriaWidget,
};

const viewKey = (userId) => `ics-dashboard-${userId}`;
const modeKey = (userId) => `ics-dashboard-modo-${userId}`;

/** Doble vista: "graficos" o "tabla". Se recuerda por usuario y también viaja en la URL (?modo=). */
function useDashboardMode(userId) {
  const [params, setParams] = useSearchParams();
  let stored = null;
  try {
    stored = localStorage.getItem(modeKey(userId));
  } catch {
    /* sin almacenamiento */
  }
  const modo = [params.get('modo'), stored].find((m) => m === 'graficos' || m === 'tabla') || 'graficos';
  const setModo = (m) => {
    try {
      localStorage.setItem(modeKey(userId), m);
    } catch {
      /* noop */
    }
    const next = new URLSearchParams(params);
    next.set('modo', m);
    setParams(next, { replace: true });
  };
  return [modo, setModo];
}

/** Vista seleccionada: ?vista= en la URL, luego la última elegida, luego la primera asignada. */
function useSelectedDashboard(userId, available) {
  const [params, setParams] = useSearchParams();
  let stored = null;
  try {
    stored = localStorage.getItem(viewKey(userId));
  } catch {
    /* sin almacenamiento */
  }
  const keys = available.map((d) => d.key);
  const fromUrl = params.get('vista');
  const selected = [fromUrl, stored].find((k) => keys.includes(k)) || keys[0];
  const select = (key) => {
    try {
      localStorage.setItem(viewKey(userId), key);
    } catch {
      /* noop */
    }
    const next = new URLSearchParams(params);
    next.set('vista', key);
    setParams(next, { replace: true });
  };
  return [selected, select];
}

export default function Dashboard() {
  const { user, dashboards, isAdmin, empresa } = useAuth();
  const hour = new Date().getHours();
  const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const ordered = DASHBOARDS.filter((d) => dashboards.includes(d.key));
  const [selected, select] = useSelectedDashboard(user.id, ordered);
  const Widget = WIDGETS[selected];
  const [modo, setModo] = useDashboardMode(user.id);

  return (
    <div className="page">
      <header className="page-head hero">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {empresa && ` · ${empresa.nombre}`}
          </p>
          <h1>
            {saludo}, <span className="grad-text">{user.nombre.split(' ')[0]}</span>
          </h1>
          <p className="muted">
            {isAdmin ? 'Perfil administrador: tiene acceso a todos los dashboards.' : `Dashboards disponibles para su usuario: ${ordered.length}.`}
          </p>
        </div>
        {ordered.length > 0 && (
          <div className="dash-tools">
            <div className="seg" role="group" aria-label="Tipo de vista">
              <button className={modo === 'graficos' ? 'active' : ''} onClick={() => setModo('graficos')} title="Vista de gráficos">
                <BarChart3 size={16} /> Gráficos
              </button>
              <button className={modo === 'tabla' ? 'active' : ''} onClick={() => setModo('tabla')} title="Vista de tablas">
                <Table2 size={16} /> Tabla
              </button>
            </div>
          <label className="dash-filter">
            <Filter size={16} aria-hidden />
            <span className="dash-filter-label">Dashboard</span>
            <select value={selected} onChange={(e) => select(e.target.value)} aria-label="Seleccionar dashboard">
              {ordered.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden className="dash-filter-caret" />
          </label>
          </div>
        )}
      </header>
      {ordered.length === 0 ? (
        <Empty title="Sin dashboards asignados">Solicite al administrador la parametrización de sus dashboards.</Empty>
      ) : (
        <>
          {modo === 'tabla' ? <DashboardTablas key={`t-${selected}`} view={selected} /> : <Widget key={selected} />}
          <FlujoSection key={`flujo-${selected}`} module={selected === 'resumen' ? undefined : selected} />
        </>
      )}
    </div>
  );
}
