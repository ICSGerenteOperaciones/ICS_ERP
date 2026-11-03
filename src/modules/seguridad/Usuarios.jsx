import { useMemo, useState } from 'react';
import { UserCog, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { db, useDb } from '../../data/db';
import { useAuth } from '../../auth/AuthContext';
import { DASHBOARDS } from '../../config/modules';
import DataTable from '../../components/DataTable';
import { Button, Card, FormModal, IconButton, Tag, useUi } from '../../components/ui';

export default function Usuarios() {
  const { can, user: me, remote } = useAuth();
  const { toast, confirm } = useUi();
  const usuarios = useDb((d) => d.list('usuarios'));
  const roles = useDb((d) => d.list('roles'));
  const empresas = useDb((d) => d.listAll('empresas'));
  const [form, setForm] = useState(null); // { row }
  const [q, setQ] = useState('');

  const roleName = (id) => roles.find((r) => r.id === id)?.nombre || '—';

  const fields = useMemo(
    () => [
      { key: 'nombre', label: 'Nombre completo', required: true, span: 2 },
      { key: 'usuario', label: remote ? 'Nombre de usuario (alias)' : 'Usuario', required: true },
      { key: 'email', label: remote ? 'Correo (es su acceso al sistema)' : 'Correo', type: 'email', required: true, span: 2, readOnly: remote && !!form?.row },
      { key: 'cargo', label: 'Cargo' },
      { key: 'rol_id', label: 'Rol', type: 'select', options: roles.map((r) => ({ value: r.id, label: r.nombre })), required: true },
      { key: 'clave', label: remote ? (form?.row ? 'Nueva contraseña (opcional, mín. 10)' : 'Contraseña (mín. 10 caracteres)') : 'Contraseña', type: 'password', required: !form?.row, span: 1 },
      {
        key: 'empresas_ids',
        label: 'Empresas con acceso (el administrador accede a todas)',
        type: 'multicheck',
        span: 3,
        options: empresas.map((e) => ({ value: e.id, label: e.alias || e.nombre })),
        default: [],
      },
      {
        key: 'empresa_id',
        label: 'Empresa predeterminada',
        type: 'select',
        options: empresas.map((e) => ({ value: e.id, label: e.alias || e.nombre })),
        span: 2,
      },
      { key: 'activo', label: 'Estado', type: 'checkbox', checkLabel: 'Usuario activo', default: true },
      {
        key: 'dashboards',
        label: 'Dashboards de inicio (parametrización)',
        type: 'multicheck',
        span: 3,
        options: DASHBOARDS.map((d) => ({ value: d.key, label: d.label })),
        default: ['resumen'],
      },
    ],
    [roles, empresas, form, remote],
  );

  const rows = usuarios.filter((u) => `${u.nombre} ${u.usuario} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const save = (data) => {
    const dup = usuarios.find((u) => u.usuario.toLowerCase() === data.usuario.toLowerCase() && u.id !== form.row?.id);
    if (dup) return toast('El nombre de usuario ya existe.', 'critical');
    const payload = { ...data };
    // Multiempresa: la predeterminada siempre debe estar entre las permitidas.
    const ids = payload.empresas_ids || [];
    if (payload.rol_id !== 'rol-admin' && !ids.length) return toast('Seleccione al menos una empresa con acceso.', 'critical');
    if (ids.length && !ids.includes(payload.empresa_id)) payload.empresa_id = ids[0];
    if (!ids.length && !payload.empresa_id) payload.empresa_id = empresas[0]?.id || '';
    if (form.row && !payload.clave) delete payload.clave; // conservar contraseña actual
    if (remote && payload.clave && payload.clave.length < 10) return toast('La contraseña debe tener al menos 10 caracteres.', 'critical');
    if (remote && form.row) delete payload.email; // el correo es el acceso: no se cambia desde aquí
    const cambioClave = !!payload.clave;
    if (form.row) db.update('usuarios', form.row.id, payload);
    else db.insert('usuarios', payload);
    if (remote && form.row && cambioClave) db.logEvent('EDITAR', `Cambió la contraseña de ${data.nombre}`, { modulo: 'usuarios' });
    toast(form.row ? 'Usuario actualizado' : remote ? 'Creando usuario…' : 'Usuario creado');
    setForm(null);
  };

  const remove = async (u) => {
    if (u.id === me.id) return toast('No puede eliminar su propio usuario.', 'critical');
    if (await confirm(`¿Eliminar el usuario ${u.usuario}?`, { title: 'Eliminar usuario', danger: true })) {
      db.remove('usuarios', u.id);
      toast('Usuario eliminado');
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <span className="page-icon">
            <UserCog size={22} />
          </span>
          <div>
            <h1>Usuarios</h1>
            <p className="muted">Gestión de usuarios, rol asignado y dashboards de inicio</p>
          </div>
        </div>
        <div className="page-actions">
          {can('usuarios', 'crear') && (
            <Button icon={Plus} onClick={() => setForm({ row: null })}>
              Nuevo usuario
            </Button>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          <Search size={16} aria-hidden />
          <input placeholder="Buscar usuarios…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <span className="muted small">{rows.length} usuarios</span>
      </div>

      <Card className="flush">
        <DataTable
          columns={[
            { key: 'codigo', label: 'Código', render: (u) => <span className="code">{u.codigo}</span> },
            { key: 'nombre', label: 'Nombre' },
            { key: 'usuario', label: 'Usuario' },
            { key: 'email', label: 'Correo' },
            { key: 'rol_id', label: 'Rol', render: (u) => <Tag tone="accent">{roleName(u.rol_id)}</Tag>, sortValue: (u) => roleName(u.rol_id) },
            {
              key: 'empresas_ids', label: 'Empresas',
              render: (u) =>
                u.rol_id === 'rol-admin'
                  ? 'Todas'
                  : (u.empresas_ids || []).map((id) => empresas.find((e) => e.id === id)?.alias).filter(Boolean).join(', ') || '—',
            },
            { key: 'dashboards', label: 'Dashboards', render: (u) => (u.rol_id === 'rol-admin' ? 'Todos' : (u.dashboards || []).length) },
            { key: 'activo', label: 'Estado', render: (u) => (u.activo ? <Tag tone="good">Activo</Tag> : <Tag tone="muted">Inactivo</Tag>) },
          ]}
          rows={rows}
          actions={(u) => (
            <>
              {can('usuarios', 'editar') && <IconButton icon={Pencil} label="Editar" onClick={() => setForm({ row: u })} />}
              {can('usuarios', 'eliminar') && <IconButton icon={Trash2} label="Eliminar" className="danger" onClick={() => remove(u)} />}
            </>
          )}
        />
      </Card>

      {form && (
        <FormModal
          title={form.row ? `Editar ${form.row.usuario}` : 'Nuevo usuario'}
          fields={fields}
          initial={form.row ? { ...form.row, clave: '' } : {}}
          onSubmit={save}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
