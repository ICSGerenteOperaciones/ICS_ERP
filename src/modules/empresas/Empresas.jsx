import { useMemo, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, LogIn, Users } from 'lucide-react';
import { db, useDb } from '../../data/db';
import { useAuth } from '../../auth/AuthContext';
import { Button, Card, Empty, FormModal, IconButton, Tag, fmtCompact, useUi } from '../../components/ui';
import { EmpresaChip } from '../../components/EmpresaSwitcher';

const COLORES = [
  { value: '#22C8F0', label: 'Cian' },
  { value: '#8B7CFF', label: 'Violeta' },
  { value: '#2FCF9B', label: 'Verde' },
  { value: '#F5B94A', label: 'Ámbar' },
  { value: '#FF7AA8', label: 'Rosa' },
  { value: '#FF9F5A', label: 'Naranja' },
];

const FIELDS = [
  { key: 'nombre', label: 'Razón social', required: true, span: 2 },
  { key: 'alias', label: 'Nombre corto', required: true },
  { key: 'nit', label: 'NIT', required: true },
  { key: 'ciudad', label: 'Ciudad', required: true },
  { key: 'moneda', label: 'Moneda base', type: 'select', options: ['COP', 'USD'], required: true },
  { key: 'color', label: 'Color distintivo', type: 'select', options: COLORES, required: true },
  { key: 'activo', label: 'Estado', type: 'checkbox', checkLabel: 'Empresa activa', default: true },
];

/** Conteo de registros de una empresa (lectura sin filtro: es la vista consolidada del grupo). */
function resumenEmpresa(e) {
  const mios = (table) => db.listAll(table).filter((r) => r.empresa_id === e.id);
  const compras = mios('compras').filter((c) => c.estado !== 'ANULADA');
  const ids = new Set(compras.map((c) => c.id));
  const total = db
    .listAll('compras_items')
    .filter((i) => ids.has(i.compra_id))
    .reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0) * (1 + (Number(i.iva) || 0) / 100), 0);
  const usuarios = db.listAll('usuarios').filter((u) => u.rol_id === 'rol-admin' || (u.empresas_ids || []).includes(e.id));
  return {
    compras: compras.length,
    valor: total,
    terceros: mios('terceros').length,
    articulos: mios('articulos').length,
    documentos: mios('firmas').length,
    actividades: mios('actividades').length,
    eventos: mios('auditoria_logs').length,
    usuarios,
    registros: ['terceros', 'compras', 'firmas', 'actividades', 'articulos', 'inventario'].reduce((s, t) => s + mios(t).length, 0),
  };
}

export default function Empresas() {
  const { can, empresa: activa, empresas: accesibles, cambiarEmpresa } = useAuth();
  const { toast, confirm } = useUi();
  const empresas = useDb((d) => d.listAll('empresas'));
  // Se recalcula ante cualquier cambio en los datos.
  const resumenes = useDb((d) => Object.fromEntries(d.listAll('empresas').map((e) => [e.id, resumenEmpresa(e)])));
  const [form, setForm] = useState(null);

  const totales = useMemo(
    () => ({
      activas: empresas.filter((e) => e.activo !== false).length,
      valor: Object.values(resumenes).reduce((s, r) => s + r.valor, 0),
      registros: Object.values(resumenes).reduce((s, r) => s + r.registros, 0),
    }),
    [empresas, resumenes],
  );

  const save = (data) => {
    if (form.row) db.update('empresas', form.row.id, data);
    else db.insert('empresas', data);
    toast(form.row ? 'Empresa actualizada' : 'Empresa creada');
    setForm(null);
  };

  const remove = async (e) => {
    const r = resumenes[e.id];
    if (e.id === activa?.id) return toast('Cambie a otra empresa antes de eliminar la empresa activa.', 'critical');
    if (empresas.length <= 1) return toast('Debe existir al menos una empresa.', 'critical');
    if (r.registros) return toast(`${e.alias || e.nombre} tiene ${r.registros} registros; inactívela en lugar de eliminarla.`, 'critical');
    if (await confirm(`¿Eliminar la empresa ${e.nombre}?`, { title: 'Eliminar empresa', danger: true })) {
      db.listAll('usuarios')
        .filter((u) => (u.empresas_ids || []).includes(e.id))
        .forEach((u) => {
          const ids = u.empresas_ids.filter((x) => x !== e.id);
          db.update('usuarios', u.id, { empresas_ids: ids, empresa_id: u.empresa_id === e.id ? ids[0] || '' : u.empresa_id });
        });
      db.remove('empresas', e.id);
      toast('Empresa eliminada');
    }
  };

  const irA = (e) => {
    if (cambiarEmpresa(e.id)) toast(`Trabajando en ${e.alias || e.nombre}`, 'info');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <span className="page-icon">
            <Building2 size={22} aria-hidden />
          </span>
          <div>
            <h1>Empresas</h1>
            <p className="muted">Gestión multiempresa · cada empresa tiene sus propios datos, numeración y auditoría</p>
          </div>
        </div>
        <div className="page-actions">
          {can('empresas', 'crear') && (
            <Button icon={Plus} onClick={() => setForm({ row: null })}>
              Nueva empresa
            </Button>
          )}
        </div>
      </header>

      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Empresas del grupo</span>
          <strong className="kpi-value">{empresas.length}</strong>
          <span className="kpi-hint">{totales.activas} activas</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Compras consolidadas</span>
          <strong className="kpi-value">${fmtCompact(totales.valor)}</strong>
          <span className="kpi-hint">COP con IVA, sin anuladas</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Registros de negocio</span>
          <strong className="kpi-value">{totales.registros}</strong>
          <span className="kpi-hint">en todas las empresas</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Empresa activa</span>
          <strong className="kpi-value">{activa?.alias || '—'}</strong>
          <span className="kpi-hint">los módulos muestran solo sus datos</span>
        </div>
      </div>

      {empresas.length === 0 && (
        <Card className="empresa-vacia">
          <Empty icon={Building2} title="Bienvenido: cree su primera empresa para comenzar">
            Todos los datos del sistema (terceros, compras, inventario, firmas y actividades) pertenecen a una empresa.
          </Empty>
          {can('empresas', 'crear') && (
            <div className="center">
              <Button icon={Plus} onClick={() => setForm({ row: null })}>
                Crear mi primera empresa
              </Button>
            </div>
          )}
        </Card>
      )}

      <div className="empresa-grid">
        {empresas.map((e) => {
          const r = resumenes[e.id];
          const esActiva = e.id === activa?.id;
          const puedeEntrar = accesibles.some((x) => x.id === e.id);
          return (
            <Card key={e.id} className={`empresa-card ${esActiva ? 'activa' : ''}`} style={{ '--c': e.color }}>
              <div className="empresa-card-head">
                <EmpresaChip empresa={e} size={44} />
                <div className="grow">
                  <strong>{e.alias || e.nombre}</strong>
                  <span className="muted small">{e.nombre}</span>
                </div>
                {esActiva && <Tag tone="info">Activa</Tag>}
                {e.activo === false && <Tag tone="muted">Inactiva</Tag>}
              </div>
              <div className="empresa-meta">
                <span>
                  <span className="code">{e.codigo}</span>
                </span>
                <span>NIT {e.nit}</span>
                <span>{e.ciudad}</span>
                <span>{e.moneda}</span>
              </div>
              <div className="empresa-stats">
                <div>
                  <b>{r.compras}</b>
                  <span>Compras</span>
                </div>
                <div>
                  <b>${fmtCompact(r.valor)}</b>
                  <span>Valor comprado</span>
                </div>
                <div>
                  <b>{r.terceros}</b>
                  <span>Terceros</span>
                </div>
                <div>
                  <b>{r.articulos}</b>
                  <span>Artículos</span>
                </div>
                <div>
                  <b>{r.documentos}</b>
                  <span>Documentos</span>
                </div>
                <div>
                  <b>{r.actividades}</b>
                  <span>Actividades</span>
                </div>
              </div>
              <p className="muted small">
                <Users size={13} className="inline-icon" aria-hidden /> {r.usuarios.length} usuarios con acceso: {r.usuarios.map((u) => u.nombre.split(' ')[0]).join(', ')}
              </p>
              <div className="empresa-actions">
                {!esActiva && puedeEntrar && (
                  <Button variant="ghost" icon={LogIn} onClick={() => irA(e)}>
                    Trabajar en esta empresa
                  </Button>
                )}
                <span className="grow" />
                {can('empresas', 'editar') && <IconButton icon={Pencil} label="Editar" onClick={() => setForm({ row: e })} />}
                {can('empresas', 'eliminar') && <IconButton icon={Trash2} label="Eliminar" className="danger" onClick={() => remove(e)} />}
              </div>
            </Card>
          );
        })}
      </div>

      {form && (
        <FormModal
          title={form.row ? `Editar ${form.row.alias || form.row.nombre}` : 'Nueva empresa'}
          fields={FIELDS}
          initial={form.row || { moneda: 'COP', color: COLORES[empresas.length % COLORES.length].value }}
          onSubmit={save}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
