import { fullPermissions, emptyPermissions, DASHBOARDS } from '../config/modules';
import { WORKFLOWS } from '../workflow/definitions';

// Generador pseudoaleatorio determinístico: el DEMO siempre arranca igual.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

let counter = 0;
const id = (p) => `${p}-${(++counter).toString(36).padStart(5, '0')}`;
const iso = (y, m, d) => new Date(Date.UTC(y, m, d, 14)).toISOString();

// ---------- Empresas del grupo (multiempresa) ----------
const E = { ics: 'emp-ics', cloud: 'emp-cloud', andina: 'emp-andina' };
export const EMPRESA_PRINCIPAL = E.ics;
const EMPRESAS = [
  { id: E.ics, codigo: 'EMP-0001', nombre: 'Innovation Code Services S.A.S.', alias: 'ICS Matriz', nit: '901.234.567-1', ciudad: 'Bogotá', moneda: 'COP', color: '#22C8F0', activo: true, creado: iso(2026, 0, 2) },
  { id: E.cloud, codigo: 'EMP-0002', nombre: 'ICS Soluciones Cloud S.A.S.', alias: 'ICS Cloud', nit: '901.345.678-2', ciudad: 'Medellín', moneda: 'COP', color: '#8B7CFF', activo: true, creado: iso(2026, 0, 3) },
  { id: E.andina, codigo: 'EMP-0003', nombre: 'ICS Andina S.A.S.', alias: 'ICS Andina', nit: '901.456.789-3', ciudad: 'Cali', moneda: 'COP', color: '#2FCF9B', activo: true, creado: iso(2026, 0, 4) },
];
const NOMBRES_CLOUD = [
  ['CloudNet Colombia S.A.S.', 'Proveedor'], ['Servidores y Redes Ltda.', 'Proveedor'], ['Hardware Total S.A.S.', 'Proveedor'],
  ['Fintech Aurora', 'Cliente'], ['Retail Central S.A.', 'Cliente'], ['Aliados Digitales', 'Aliado'], ['Universidad Tech del Valle', 'Cliente'],
];
const NOMBRES_ANDINA = [
  ['Distribuidora Andes', 'Proveedor'], ['Suministros del Pacífico', 'Proveedor'], ['Tecnología del Sur', 'Proveedor'],
  ['Minera Cordillera', 'Cliente'], ['Agroindustrial del Valle', 'Cliente'], ['Alianza Regional', 'Aliado'],
];
// La primera empresa conserva exactamente los datos de siempre; las otras son más pequeñas.
const OPCIONES = [
  { seed: 20261019, nCompras: 34, nDocs: 10, nActs: 8, primary: true },
  { seed: 20262027, nCompras: 14, nDocs: 5, nActs: 4, nombres: NOMBRES_CLOUD },
  { seed: 20263035, nCompras: 10, nDocs: 4, nActs: 3, nombres: NOMBRES_ANDINA },
];

/** Datos de demostración de TODO el grupo: usuarios/roles globales + datos por empresa. */
export function buildSeed() {
  counter = 0;
  const parts = EMPRESAS.map((e, i) => buildEmpresa(e, OPCIONES[i]));
  const out = { empresas: EMPRESAS.map((e) => ({ ...e })) };
  Object.keys(parts[0]).forEach((k) => {
    out[k] = k === 'roles' || k === 'usuarios' ? parts[0][k] : parts.flatMap((p) => p[k]);
  });
  return out;
}

function buildEmpresa(empresa, opts) {
  const r = rng(opts.seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (a, b) => Math.floor(a + r() * (b - a + 1));

  // ---------- Roles ----------
  const perms = (map) => {
    const p = emptyPermissions();
    Object.entries(map).forEach(([mod, acts]) => acts.split(',').forEach((a) => (p[mod][a] = true)));
    return p;
  };
  const roles = [
    { id: 'rol-admin', codigo: 'ROL-0001', nombre: 'Administrador', descripcion: 'Acceso total al sistema', permisos: fullPermissions(), sistema: true },
    {
      id: 'rol-compras', codigo: 'ROL-0002', nombre: 'Analista de compras', descripcion: 'Gestiona órdenes de compra y proveedores',
      permisos: perms({ dashboard: 'ver', compras: 'ver,crear,editar', inventario: 'ver,crear,editar', terceros: 'ver,crear,editar', firmas: 'ver' }),
    },
    {
      id: 'rol-aprob', codigo: 'ROL-0003', nombre: 'Aprobador', descripcion: 'Aprueba compras, firma documentos y valida terceros',
      permisos: perms({ dashboard: 'ver', compras: 'ver,aprobar', firmas: 'ver,aprobar', terceros: 'ver,aprobar', actividades: 'ver,aprobar', inventario: 'ver,aprobar', auditorias: 'ver' }),
    },
    {
      id: 'rol-proy', codigo: 'ROL-0004', nombre: 'Líder de proyectos', descripcion: 'Planea y ejecuta actividades',
      permisos: perms({ dashboard: 'ver', actividades: 'ver,crear,editar,eliminar', terceros: 'ver' }),
    },
    {
      id: 'rol-auditor', codigo: 'ROL-0005', nombre: 'Auditor interno', descripcion: 'Consulta el registro de auditoría (logs) del sistema',
      permisos: perms({ dashboard: 'ver', auditorias: 'ver', compras: 'ver', inventario: 'ver', firmas: 'ver', actividades: 'ver', terceros: 'ver' }),
    },
    // Perfiles del módulo Operaciones (ver, crear = registrar horas / enviar a revisión, editar = gestionar, aprobar = revisar)
    { id: 'rol-ops-consulta', codigo: 'ROL-OPS-01', nombre: 'Operaciones · Consulta', descripcion: 'Visualiza sistemas, etapas y horas', permisos: perms({ dashboard: 'ver', operaciones: 'ver' }) },
    { id: 'rol-ops-dev', codigo: 'ROL-OPS-02', nombre: 'Operaciones · Desarrollador', descripcion: 'Consulta sus sistemas, registra horas y envía a revisión', permisos: perms({ dashboard: 'ver', operaciones: 'ver,crear' }) },
    { id: 'rol-ops-qa', codigo: 'ROL-OPS-03', nombre: 'Operaciones · QA', descripcion: 'Consulta sistemas enviados a revisión y aprueba o rechaza', permisos: perms({ dashboard: 'ver', operaciones: 'ver,aprobar' }) },
    { id: 'rol-ops-lider', codigo: 'ROL-OPS-04', nombre: 'Operaciones · Líder', descripcion: 'Revisa sistemas, aprueba o devuelve', permisos: perms({ dashboard: 'ver', operaciones: 'ver,crear,aprobar' }) },
  ];

  // ---------- Usuarios ----------
  const allDash = DASHBOARDS.map((d) => d.key);
  const usuarios = [
    {
      id: 'usr-admin', codigo: 'USR-0001', usuario: 'admin', clave: 'Ics2026*', nombre: 'Administrador ICS',
      email: 'admin@ics.demo', cargo: 'Administrador del sistema', rol_id: 'rol-admin', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud, E.andina],
      dashboards: allDash,
    },
    {
      id: 'usr-compras', codigo: 'USR-0002', usuario: 'lgomez', clave: 'Demo2026*', nombre: 'Laura Gómez',
      email: 'lgomez@ics.demo', cargo: 'Analista de compras', rol_id: 'rol-compras', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud],
      dashboards: ['compras', 'inventario', 'terceros'],
    },
    {
      id: 'usr-aprob', codigo: 'USR-0003', usuario: 'crojas', clave: 'Demo2026*', nombre: 'Carlos Rojas',
      email: 'crojas@ics.demo', cargo: 'Gerente financiero', rol_id: 'rol-aprob', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud, E.andina],
      dashboards: ['resumen', 'compras', 'inventario', 'firmas'],
    },
    {
      id: 'usr-proy', codigo: 'USR-0004', usuario: 'amejia', clave: 'Demo2026*', nombre: 'Andrea Mejía',
      email: 'amejia@ics.demo', cargo: 'Líder de proyectos', rol_id: 'rol-proy', activo: true, empresa_id: E.ics, empresas_ids: [E.ics],
      dashboards: ['actividades'],
    },
    {
      id: 'usr-auditor', codigo: 'USR-0005', usuario: 'rvargas', clave: 'Demo2026*', nombre: 'Rafael Vargas',
      email: 'rvargas@ics.demo', cargo: 'Auditor interno', rol_id: 'rol-auditor', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud],
      dashboards: ['auditorias', 'resumen'],
    },
    { id: 'usr-ops-dev', codigo: 'USR-0006', usuario: 'dortiz', clave: 'Demo2026*', nombre: 'Daniel Ortiz', email: 'dortiz@ics.demo', cargo: 'Desarrollador', rol_id: 'rol-ops-dev', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud], dashboards: [] },
    { id: 'usr-ops-dev2', codigo: 'USR-0007', usuario: 'vpardo', clave: 'Demo2026*', nombre: 'Valentina Pardo', email: 'vpardo@ics.demo', cargo: 'Desarrolladora', rol_id: 'rol-ops-dev', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud], dashboards: [] },
    { id: 'usr-ops-qa', codigo: 'USR-0008', usuario: 'snavarro', clave: 'Demo2026*', nombre: 'Sofía Navarro', email: 'snavarro@ics.demo', cargo: 'Analista QA', rol_id: 'rol-ops-qa', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud], dashboards: [] },
    { id: 'usr-ops-lider', codigo: 'USR-0009', usuario: 'mrios', clave: 'Demo2026*', nombre: 'Mateo Ríos', email: 'mrios@ics.demo', cargo: 'Líder de Innovación', rol_id: 'rol-ops-lider', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud], dashboards: [] },
    { id: 'usr-ops-cons', codigo: 'USR-0010', usuario: 'jbermudez', clave: 'Demo2026*', nombre: 'Julián Bermúdez', email: 'jbermudez@ics.demo', cargo: 'Gerencia (consulta)', rol_id: 'rol-ops-consulta', activo: true, empresa_id: E.ics, empresas_ids: [E.ics, E.cloud], dashboards: [] },
  ];

  // ---------- Terceros (maestro) + contactos / direcciones / cuentas (detalle) ----------
  const nombres = [
    ['Nubetec S.A.S.', 'Proveedor'], ['DataCore Andina', 'Proveedor'], ['Ofimática del Norte', 'Proveedor'],
    ['Seguridad Digital Ltda.', 'Proveedor'], ['Logística Express', 'Proveedor'], ['Grupo Altavista', 'Cliente'],
    ['Banco Horizonte', 'Cliente'], ['Clínica Santa Fe', 'Cliente'], ['Constructora Prisma', 'Cliente'],
    ['Consultores Quantum', 'Aliado'], ['Energía Verde S.A.', 'Cliente'], ['Mobiliario Moderno', 'Proveedor'],
  ];
  const ciudades = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'];
  const estadosTer = ['ACTIVO', 'ACTIVO', 'ACTIVO', 'ACTIVO', 'EN_VALIDACION', 'PROSPECTO', 'INACTIVO'];
  const terceros = [];
  const terceros_contactos = [];
  const terceros_direcciones = [];
  const terceros_cuentas = [];
  (opts.nombres || nombres).forEach(([razon, tipo], i) => {
    const t = {
      id: id('ter'), codigo: `TER-${String(i + 1).padStart(4, '0')}`, razon_social: razon, tipo,
      tipo_documento: 'NIT', documento: `${int(800, 901)}.${int(100, 999)}.${int(100, 999)}-${int(0, 9)}`,
      ciudad: pick(ciudades), email: `contacto@${razon.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}.co`,
      telefono: `+57 60${int(1, 8)} ${int(200, 899)} ${int(1000, 9999)}`,
      estado: i < 9 ? 'ACTIVO' : pick(estadosTer), creado: iso(2026, int(0, 5), int(1, 27)),
    };
    terceros.push(t);
    const nC = int(1, 3);
    for (let k = 0; k < nC; k++) {
      terceros_contactos.push({
        id: id('tc'), tercero_id: t.id,
        nombre: pick(['Juan Pérez', 'María López', 'Diego Torres', 'Paula Ríos', 'Sergio Díaz', 'Natalia Cruz']),
        cargo: pick(['Gerente comercial', 'Coordinador de cuentas', 'Director financiero', 'Asistente administrativo']),
        email: `c${k + 1}@${t.email.split('@')[1]}`, telefono: `+57 3${int(0, 2)}${int(0, 9)} ${int(100, 999)} ${int(1000, 9999)}`,
      });
    }
    terceros_direcciones.push({
      id: id('td'), tercero_id: t.id, tipo: 'Principal',
      direccion: `Cra ${int(5, 80)} # ${int(10, 120)}-${int(10, 99)}`, ciudad: t.ciudad,
    });
    if (tipo === 'Proveedor') {
      terceros_cuentas.push({
        id: id('tb'), tercero_id: t.id, banco: pick(['Bancolombia', 'Davivienda', 'BBVA', 'Banco de Bogotá']),
        tipo_cuenta: pick(['Ahorros', 'Corriente']), numero: `${int(100, 999)}-${int(100000, 999999)}-${int(10, 99)}`,
      });
    }
  });
  const proveedores = terceros.filter((t) => t.tipo === 'Proveedor');

  // ---------- Compras (maestro) + ítems / entregas (detalle) ----------
  const catalogo = [
    ['Licencia software analítica (anual)', 'UND', 4_800_000], ['Portátil desarrollo 32GB', 'UND', 6_900_000],
    ['Servidor cloud – horas cómputo', 'HRS', 18_000], ['Monitor 27" 4K', 'UND', 1_650_000],
    ['Silla ergonómica', 'UND', 890_000], ['Servicio soporte TI mensual', 'MES', 3_200_000],
    ['Certificado SSL wildcard', 'UND', 1_100_000], ['Resma papel carta', 'PAQ', 21_000],
    ['Firewall perimetral', 'UND', 12_500_000], ['Transporte equipos', 'SRV', 450_000],
  ];
  const estadosOC = ['CERRADA', 'CERRADA', 'RECIBIDA', 'APROBADA', 'APROBADA', 'SOLICITADA', 'SOLICITADA', 'BORRADOR', 'RECHAZADA'];
  const compras = [];
  const compras_items = [];
  const compras_entregas = [];
  for (let i = 0; i < opts.nCompras; i++) {
    const month = Math.min(9, Math.floor(i / (opts.nCompras / 10)));
    const estado = month < 6 ? pick(['CERRADA', 'CERRADA', 'RECIBIDA', 'ANULADA', 'CERRADA']) : pick(estadosOC);
    const c = {
      id: id('oc'), codigo: `OC-${String(i + 1).padStart(4, '0')}`, fecha: iso(2026, month, int(1, 27)),
      proveedor_id: pick(proveedores).id, solicitante: pick(['Laura Gómez', 'Andrea Mejía', 'Administrador ICS']),
      centro_costo: pick(['TI', 'Administración', 'Proyectos', 'Comercial']), forma_pago: pick(['Contado', 'Crédito 30 días', 'Crédito 60 días']),
      moneda: 'COP', observaciones: '', estado,
    };
    compras.push(c);
    const nI = int(1, 4);
    for (let k = 0; k < nI; k++) {
      const [desc, und, precio] = pick(catalogo);
      compras_items.push({
        id: id('oci'), compra_id: c.id, descripcion: desc, unidad: und,
        cantidad: und === 'HRS' ? int(100, 600) : int(1, 8), precio_unitario: precio, iva: pick([19, 19, 0]),
      });
    }
    if (['RECIBIDA', 'CERRADA'].includes(estado)) {
      compras_entregas.push({
        id: id('oce'), compra_id: c.id, fecha: c.fecha, remision: `REM-${int(10000, 99999)}`,
        recibido_por: pick(['Almacén central', 'Mesa de ayuda TI']), observacion: 'Recibido a satisfacción',
      });
    }
  }

  // ---------- Firmas (maestro) + firmantes / adjuntos (detalle) ----------
  const docs = [
    ['Contrato de licenciamiento cloud', 'Contrato'], ['Acuerdo de confidencialidad Quantum', 'Acuerdo'],
    ['Acta de entrega proyecto Prisma', 'Acta'], ['Política de seguridad de la información', 'Política'],
    ['Otrosí contrato soporte TI', 'Contrato'], ['Orden de servicio consultoría', 'Orden'],
    ['Acta comité de compras septiembre', 'Acta'], ['Contrato marco Banco Horizonte', 'Contrato'],
    ['Acuerdo de nivel de servicio (SLA)', 'Acuerdo'], ['Política de teletrabajo', 'Política'],
  ];
  const estDoc = ['FIRMADO', 'FIRMADO', 'FIRMADO', 'EN_FIRMA', 'EN_FIRMA', 'EN_FIRMA', 'BORRADOR', 'FIRMADO', 'RECHAZADO', 'EN_FIRMA'];
  const firmas = [];
  const firmas_firmantes = [];
  const firmas_adjuntos = [];
  docs.slice(0, opts.nDocs).forEach(([titulo, tipo], i) => {
    const f = {
      id: id('doc'), codigo: `DOC-${String(i + 1).padStart(4, '0')}`, titulo, tipo, tercero_id: pick(terceros).id,
      fecha_limite: iso(2026, int(8, 11), int(1, 27)), descripcion: '', estado: estDoc[i], creado: iso(2026, int(3, 9), int(1, 27)),
    };
    firmas.push(f);
    const firmantes = [
      ['Carlos Rojas', 'Gerente financiero', 'crojas@ics.demo'],
      ['Administrador ICS', 'Representante legal', 'admin@ics.demo'],
      ['Juan Pérez', 'Representante tercero', 'juan.perez@tercero.co'],
    ].slice(0, int(2, 3));
    firmantes.forEach(([nombre, cargo, email], k) => {
      const firmado = f.estado === 'FIRMADO' || (f.estado === 'EN_FIRMA' && k === 0 && r() > 0.4);
      firmas_firmantes.push({
        id: id('ff'), documento_id: f.id, orden: k + 1, nombre, cargo, email,
        estado: f.estado === 'RECHAZADO' && k === 0 ? 'RECHAZADO' : firmado ? 'FIRMADO' : 'PENDIENTE',
        fecha_firma: firmado ? f.creado : '', firma: '',
      });
    });
    firmas_adjuntos.push({ id: id('fa'), documento_id: f.id, nombre: `${titulo}.pdf`, tipo: 'PDF', tamano_kb: int(120, 2400) });
  });

  // ---------- Actividades (maestro) + tareas / tiempos (detalle) ----------
  const acts = [
    ['Implementación módulo de compras', 'Proyectos'], ['Migración a nube híbrida', 'TI'],
    ['Auditoría de seguridad Q4', 'TI'], ['Onboarding cliente Energía Verde', 'Comercial'],
    ['Capacitación usuarios ERP', 'Administración'], ['Rediseño portal de clientes', 'Proyectos'],
    ['Cierre contable septiembre', 'Administración'], ['Plan comercial 2027', 'Comercial'],
  ];
  const estAct = ['EN_CURSO', 'EN_CURSO', 'PLANEADA', 'EN_REVISION', 'COMPLETADA', 'EN_CURSO', 'COMPLETADA', 'PLANEADA'];
  const responsables = ['Andrea Mejía', 'Laura Gómez', 'Carlos Rojas', 'Administrador ICS'];
  const actividades = [];
  const actividades_tareas = [];
  const actividades_tiempos = [];
  acts.slice(0, opts.nActs).forEach(([titulo, area], i) => {
    const m = int(6, 10);
    const a = {
      id: id('act'), codigo: `ACT-${String(i + 1).padStart(4, '0')}`, titulo, area, responsable: pick(responsables),
      prioridad: pick(['Alta', 'Media', 'Media', 'Baja']), fecha_inicio: iso(2026, m - 1, int(1, 15)),
      fecha_fin: iso(2026, m + 1, int(1, 27)), descripcion: '', estado: estAct[i],
    };
    actividades.push(a);
    const nT = int(3, 6);
    for (let k = 0; k < nT; k++) {
      const done = a.estado === 'COMPLETADA' || (a.estado !== 'PLANEADA' && r() > 0.45);
      actividades_tareas.push({
        id: id('at'), actividad_id: a.id, titulo: pick(['Levantamiento de requisitos', 'Diseño de solución', 'Desarrollo', 'Pruebas', 'Documentación', 'Despliegue', 'Reunión de seguimiento']),
        responsable: pick(responsables), fecha: a.fecha_fin, horas_estimadas: int(4, 24), completada: done,
      });
    }
    if (a.estado !== 'PLANEADA') {
      for (let k = 0; k < int(1, 4); k++) {
        actividades_tiempos.push({ id: id('ah'), actividad_id: a.id, fecha: iso(2026, m - 1, int(1, 27)), usuario: a.responsable, horas: int(2, 8), nota: 'Avance registrado' });
      }
    }
  });

  // ---------- Inventario: artículos + movimientos (maestro) → líneas (detalle), ligado a Compras ----------
  const artDefs = [
    ['Portátil desarrollo 32GB', 'Equipos de cómputo', 'UND', 6_900_000, 3],
    ['Monitor 27" 4K', 'Periféricos', 'UND', 1_650_000, 4],
    ['Silla ergonómica', 'Mobiliario', 'UND', 890_000, 3],
    ['Resma papel carta', 'Papelería', 'PAQ', 21_000, 20],
    ['Firewall perimetral', 'Redes', 'UND', 12_500_000, 1],
    ['Teclado mecánico', 'Periféricos', 'UND', 280_000, 5],
    ['Mouse inalámbrico', 'Periféricos', 'UND', 95_000, 6],
    ['Cable de red Cat6 (metro)', 'Redes', 'MTS', 3_200, 150],
    ['Disco SSD 1TB', 'Componentes', 'UND', 420_000, 4],
    ['Memoria RAM 16GB', 'Componentes', 'UND', 330_000, 6],
  ];
  const articulos = artDefs.map(([nombre, categoria, unidad, costo, minimo], i) => ({
    id: id('art'), codigo: `ART-${String(i + 1).padStart(4, '0')}`, nombre, categoria, unidad,
    stock_minimo: minimo, ultimo_costo: costo, activo: true, creado: iso(2026, 0, 5),
  }));
  // Los ítems de compra de bienes quedan ligados a su artículo de inventario.
  compras_items.forEach((it) => {
    const a = articulos.find((x) => x.nombre === it.descripcion);
    if (a) it.articulo_id = a.id;
  });

  const inventario = [];
  const inventario_lineas = [];
  const stock = {};
  const inicial = {};
  const usado = {};
  let movN = 0;
  const addMov = (tipo, fecha, estado, obs, lineas, extra = {}) => {
    const m = {
      id: id('mov'), codigo: `MOV-${String(++movN).padStart(4, '0')}`, tipo, fecha, bodega: 'Bodega principal',
      observaciones: obs, estado, compra_id: '', referencia: '', ...extra, creado: fecha,
    };
    inventario.push(m);
    lineas.forEach(([art, cant, costo]) => {
      inventario_lineas.push({ id: id('ml'), movimiento_id: m.id, articulo_id: art.id, cantidad: cant, costo_unitario: costo });
      if (estado === 'CONFIRMADO') stock[art.id] = (stock[art.id] || 0) + (tipo === 'Salida' ? -cant : cant);
    });
    return m;
  };
  // 1) Inventario inicial
  addMov('Entrada', iso(2026, 0, 10), 'CONFIRMADO', 'Inventario inicial', articulos.map((a) => {
    inicial[a.id] = Math.ceil(a.stock_minimo * 1.5) + int(0, 3);
    return [a, inicial[a.id], a.ultimo_costo];
  }));
  // 2) Ingresos por compras recibidas: el flujo Compras → Inventario
  compras
    .filter((c) => ['RECIBIDA', 'CERRADA'].includes(c.estado))
    .forEach((c) => {
      const items = compras_items.filter((i) => i.compra_id === c.id && i.articulo_id);
      if (!items.length) return;
      const pendiente = c.estado === 'RECIBIDA' && new Date(c.fecha).getUTCMonth() >= 8;
      addMov(
        'Entrada por compra', c.fecha, pendiente ? 'BORRADOR' : 'CONFIRMADO', 'Ingreso por recepción de la orden de compra',
        items.map((i) => [articulos.find((a) => a.id === i.articulo_id), i.cantidad, i.precio_unitario]),
        { compra_id: c.id, referencia: c.codigo },
      );
    });
  // 3) Salidas (entregas a las áreas)
  const destinos = ['Entrega a Andrea Mejía (Proyectos)', 'Entrega a Laura Gómez (Compras)', 'Dotación nuevo ingreso', 'Reposición área de TI', 'Entrega a Carlos Rojas'];
  for (let k = 0; k < 6; k++) {
    const picks = new Set();
    const nPicks = int(1, 3);
    while (picks.size < nPicks) picks.add(int(0, articulos.length - 1));
    const lineas = [...picks]
      .map((ix) => {
        const a = articulos[ix];
        const limite = Math.min(Math.floor((stock[a.id] || 0) * 0.3), Math.floor(inicial[a.id] * 0.75) - (usado[a.id] || 0));
        if (limite < 1) return null;
        const cant = Math.max(1, Math.min(limite, int(1, a.unidad === 'UND' ? 3 : 15)));
        usado[a.id] = (usado[a.id] || 0) + cant;
        return [a, cant, a.ultimo_costo];
      })
      .filter(Boolean);
    if (lineas.length) addMov('Salida', iso(2026, int(2, 9), int(1, 27)), 'CONFIRMADO', pick(destinos), lineas);
  }
  // 4) Ajuste por conteo físico y una salida pendiente de confirmar
  addMov('Ajuste', iso(2026, 9, 5), 'CONFIRMADO', 'Conteo físico: faltante', [[articulos[6], -1, articulos[6].ultimo_costo]]);
  addMov('Salida', iso(2026, 9, 18), 'BORRADOR', 'Solicitud de entrega pendiente de confirmar', [[articulos[1], 1, articulos[1].ultimo_costo]]);
  // 5) Dos artículos quedan por debajo del mínimo para mostrar las alertas
  [3, 7].forEach((ix) => {
    const a = articulos[ix];
    const retirar = (stock[a.id] || 0) - Math.floor(a.stock_minimo * 0.6);
    if (retirar > 0) addMov('Salida', iso(2026, 9, 12), 'CONFIRMADO', 'Consumo mensual de oficinas', [[a, retirar, a.ultimo_costo]]);
  });

  // ---------- Historial de workflow ----------
  const workflow_historial = [];
  const hist = (modulo, rec, hacia, accion, fecha, usuario = 'Carlos Rojas') =>
    workflow_historial.push({ id: id('wf'), modulo, registro_id: rec.id, registro_codigo: rec.codigo, desde: '', hacia, accion, usuario, usuario_id: '', comentario: '', fecha });
  compras.forEach((c) => {
    if (c.estado !== 'BORRADOR') hist('compras', c, 'SOLICITADA', 'Enviar a aprobación', c.fecha, c.solicitante);
    if (['APROBADA', 'RECIBIDA', 'CERRADA'].includes(c.estado)) hist('compras', c, 'APROBADA', 'Aprobar', c.fecha);
  });
  firmas.forEach((f) => f.estado !== 'BORRADOR' && hist('firmas', f, 'EN_FIRMA', 'Enviar a firma', f.creado, 'Administrador ICS'));
  inventario.forEach((m) => {
    hist('inventario', m, 'BORRADOR', m.compra_id ? `Creado automáticamente desde ${m.referencia}` : 'Creación', m.creado, m.compra_id ? 'Sistema' : 'Laura Gómez');
    if (m.estado === 'CONFIRMADO') hist('inventario', m, 'CONFIRMADO', 'Confirmar movimiento', m.fecha, 'Carlos Rojas');
  });

  // ---------- Auditoría: historial de actividad del sistema (logs) ----------
  const SISTEMA = { id: 'sistema', nombre: 'Sistema', usuario: 'sistema', rol_id: null };
  const rolName = (rid) => roles.find((x) => x.id === rid)?.nombre || '—';
  const byName = (nombre) => (nombre === 'Sistema' ? SISTEMA : usuarios.find((u) => u.nombre === nombre) || usuarios[0]);
  const auditoria_logs = [];
  const auditoria_logs_cambios = [];
  const pushLog = (fecha, u, accion, modulo, tabla, rec, descripcion, cambios = [], nivel = 'info') => {
    const l = {
      id: id('lg'), fecha: new Date(Math.min(new Date(fecha).getTime(), Date.now() - 3_600_000 - (auditoria_logs.length % 300) * 60_000)).toISOString(), usuario_id: u.id, usuario: u.nombre, usuario_login: u.usuario,
      rol: rolName(u.rol_id), accion, modulo, tabla, registro_id: rec?.id || '', registro_codigo: rec?.codigo || '', descripcion, nivel,
    };
    auditoria_logs.push(l);
    cambios.forEach(([campo, anterior, nuevo]) => auditoria_logs_cambios.push({ id: id('lc'), log_id: l.id, campo, anterior: String(anterior), nuevo: String(nuevo) }));
  };
  const admin = usuarios[0];
  const nombreTercero = (tid) => terceros.find((t) => t.id === tid)?.razon_social || '';

  articulos.forEach((a) => pushLog(a.creado, admin, 'CREAR', 'inventario', 'articulos', a, `Creó artículo ${a.codigo}`, [['nombre', '', a.nombre], ['categoria', '', a.categoria], ['stock_minimo', '', a.stock_minimo]]));
  terceros.forEach((t) => pushLog(t.creado, byName('Laura Gómez'), 'CREAR', 'terceros', 'terceros', t, `Creó tercero ${t.codigo}`, [['razon_social', '', t.razon_social], ['tipo', '', t.tipo], ['ciudad', '', t.ciudad]]));
  compras.forEach((c) => {
    pushLog(c.fecha, byName(c.solicitante), 'CREAR', 'compras', 'compras', c, `Creó orden de compra ${c.codigo}`, [['proveedor_id', '', nombreTercero(c.proveedor_id)], ['centro_costo', '', c.centro_costo], ['forma_pago', '', c.forma_pago]]);
    compras_items
      .filter((i) => i.compra_id === c.id)
      .forEach((i) => pushLog(c.fecha, byName(c.solicitante), 'CREAR', 'compras', 'compras_items', { id: i.id, codigo: `${c.codigo} › ${i.descripcion.slice(0, 40)}` }, `Creó ítem de compra ${c.codigo} › ${i.descripcion.slice(0, 40)}`, [['descripcion', '', i.descripcion], ['cantidad', '', i.cantidad], ['precio_unitario', '', i.precio_unitario]]));
  });
  firmas.forEach((f) => pushLog(f.creado, admin, 'CREAR', 'firmas', 'firmas', f, `Creó documento ${f.codigo}`, [['titulo', '', f.titulo], ['tipo', '', f.tipo]]));
  actividades.forEach((a) => pushLog(a.fecha_inicio, byName(a.responsable), 'CREAR', 'actividades', 'actividades', a, `Creó actividad ${a.codigo}`, [['titulo', '', a.titulo], ['responsable', '', a.responsable], ['prioridad', '', a.prioridad]]));
  inventario.forEach((m) => pushLog(m.creado, m.compra_id ? SISTEMA : byName('Laura Gómez'), 'CREAR', 'inventario', 'inventario', m, `Creó movimiento de inventario ${m.codigo}`, [['tipo', '', m.tipo], ['referencia', '', m.referencia || m.observaciones]]));
  workflow_historial.forEach((h) => {
    const label = WORKFLOWS[h.modulo]?.states[h.hacia]?.label || h.hacia;
    pushLog(h.fecha, byName(h.usuario), 'WORKFLOW', h.modulo, h.modulo, { id: h.registro_id, codigo: h.registro_codigo }, `Cambió el estado de ${h.registro_codigo}: ${label}`, [['estado', '', label]]);
  });

  // Sesiones
  (opts.primary ? usuarios : []).forEach((u) => {
    for (let k = 0; k < 9; k++) {
      const d = new Date(Date.UTC(2026, int(1, 9), int(1, 27), int(12, 15), int(0, 59)));
      pushLog(d, u, 'LOGIN', 'sesion', '', null, 'Inició sesión');
      pushLog(new Date(d.getTime() + int(2, 8) * 3_600_000), u, 'LOGOUT', 'sesion', '', null, 'Cerró sesión');
    }
  });
  (opts.primary ? [['jperez', 3], ['administrador', 5], ['admin', 8]] : []).forEach(([typed, mes]) =>
    pushLog(Date.UTC(2026, mes, int(1, 27), int(13, 22), int(0, 59)), { id: '', nombre: '(desconocido)', usuario: typed, rol_id: null }, 'LOGIN_FALLIDO', 'sesion', '', null, `Intento de ingreso fallido con el usuario "${typed}"`, [], 'critical'),
  );

  // Ediciones y eliminaciones
  const rolCompras = roles[1];
  if (opts.primary) pushLog(Date.UTC(2026, 2, 12, 15, 10), admin, 'EDITAR', 'roles', 'roles', rolCompras, `Editó rol ${rolCompras.codigo}`, [['permisos', 'compras: ver', 'compras: ver, crear, editar']]);
  if (opts.primary) pushLog(Date.UTC(2026, 4, 20, 14, 5), admin, 'EDITAR', 'usuarios', 'usuarios', usuarios[2], `Editó usuario ${usuarios[2].codigo}`, [['cargo', 'Analista financiero', usuarios[2].cargo], ['clave', '••••••', '••••••']]);
  pushLog(Date.UTC(2026, 5, 3, 16, 40), byName('Laura Gómez'), 'EDITAR', 'terceros', 'terceros', terceros[3], `Editó tercero ${terceros[3].codigo}`, [['telefono', '+57 601 000 0000', terceros[3].telefono]]);
  pushLog(Date.UTC(2026, 6, 15, 13, 30), byName('Andrea Mejía'), 'EDITAR', 'actividades', 'actividades', actividades[1], `Editó actividad ${actividades[1].codigo}`, [['prioridad', 'Media', actividades[1].prioridad]]);
  pushLog(Date.UTC(2026, 6, 28, 17, 2), admin, 'ELIMINAR', 'compras', 'compras_items', { id: '', codigo: `${compras[6].codigo} › Resma papel carta` }, `Eliminó ítem de compra ${compras[6].codigo} › Resma papel carta`, [['descripcion', 'Resma papel carta', ''], ['cantidad', '5', '']], 'critical');
  pushLog(Date.UTC(2026, 7, 9, 15, 45), admin, 'ELIMINAR', 'actividades', 'actividades_tareas', { id: '', codigo: `${actividades[1].codigo} › Pruebas` }, `Eliminó tarea ${actividades[1].codigo} › Pruebas`, [['titulo', 'Pruebas', ''], ['horas_estimadas', '8', '']], 'critical');
  pushLog(Date.UTC(2026, 8, 2, 18, 20), admin, 'ELIMINAR', 'terceros', 'terceros_contactos', { id: '', codigo: `${terceros[3].codigo} › Diego Torres` }, `Eliminó contacto ${terceros[3].codigo} › Diego Torres`, [['nombre', 'Diego Torres', ''], ['cargo', 'Coordinador de cuentas', '']], 'critical');

  auditoria_logs.sort((a, b) => a.fecha.localeCompare(b.fecha));
  auditoria_logs.forEach((l, i) => (l.codigo = `LOG-${String(i + 1).padStart(4, '0')}`));

  // ---------- Operaciones (solo empresa principal): sistemas → horas / revisiones ----------
  const ops_sistemas = [];
  const ops_horas = [];
  const ops_revisiones = [];
  if (opts.primary) {
    const U = { dev: usuarios[5], dev2: usuarios[6], qa: usuarios[7], lider: usuarios[8] };
    const defs = [
      ['Portal de clientes', 'Portal web para consulta de estados de cuenta y solicitudes.', 'dev', 'DESARROLLO', 'ACTIVO', 'Alta', [3, 18, 4, 2]],
      ['App de inspecciones', 'Aplicación móvil para inspecciones en campo con firma digital.', 'dev2', 'QA', 'ACTIVO', 'Alta', [6, 40, 12, 0]],
      ['Tablero de indicadores', 'Tablero gerencial de indicadores operativos.', 'dev', 'ANALISIS', 'ACTIVO', 'Media', [10, 0, 0, 0]],
      ['Integración contable', 'Conector entre el ERP y el software contable.', 'dev2', 'DESARROLLO', 'PAUSADO', 'Media', [8, 22, 0, 0]],
      ['Gestor documental', 'Archivo digital con control de versiones.', 'dev', 'DESPLEGADO', 'CERRADO', 'Baja', [12, 56, 16, 6]],
    ];
    defs.forEach(([nombre, descripcion, dev, etapa, estado, prioridad, horas], i) => {
      const s = {
        id: id('sis'), codigo: `SIS-${String(i + 1).padStart(4, '0')}`, nombre, descripcion,
        desarrollador_id: U[dev].id, coordinador_id: U.lider.id, qa_id: U.qa.id,
        fecha_inicio: iso(2026, 5 + (i % 3), 2 + i).slice(0, 10), fecha_entrega: iso(2026, 10 + (i % 2), 10 + i * 3).slice(0, 10),
        prioridad, etapa, estado, observaciones: estado === 'PAUSADO' ? 'En espera de credenciales del proveedor contable.' : '', creado: iso(2026, 5, 1 + i),
      };
      ops_sistemas.push(s);
      ['ANALISIS', 'DESARROLLO', 'QA', 'DESPLEGADO'].forEach((et, k) => {
        let rest = horas[k];
        for (let n = 0; rest > 0; n++) {
          const h = Math.min(rest, int(2, 8));
          rest -= h;
          ops_horas.push({
            id: id('oh'), sistema_id: s.id, etapa: et, usuario_id: U[dev].id, usuario: U[dev].nombre,
            fecha: iso(2026, 6 + k, 1 + ((n * 3 + i) % 27)).slice(0, 10), horas: h,
            descripcion: ['Levantamiento de requerimientos', 'Construcción de módulos', 'Pruebas funcionales y correcciones', 'Despliegue y entrega'][k], creado: iso(2026, 6 + k, 1 + ((n * 3 + i) % 27)),
          });
        }
      });
    });
    ops_revisiones.push({
      id: id('or'), sistema_id: ops_sistemas[1].id, tipo: 'QA', enviado_por: U.dev2.id, enviado_por_nombre: U.dev2.nombre,
      fecha_envio: iso(2026, 9, 28), comentario: 'Listo para pruebas de regresión.', destinatario_id: U.qa.id, estado: 'PENDIENTE',
      resuelto_por: '', fecha_resolucion: '', motivo: '', creado: iso(2026, 9, 28),
    });
  }

  const tables = {
    roles, usuarios, terceros, terceros_contactos, terceros_direcciones, terceros_cuentas,
    compras, compras_items, compras_entregas, firmas, firmas_firmantes, firmas_adjuntos,
    actividades, actividades_tareas, actividades_tiempos,
    ops_sistemas, ops_horas, ops_revisiones,
    articulos, inventario, inventario_lineas, auditoria_logs, auditoria_logs_cambios, workflow_historial,
  };
  // Cada registro de negocio pertenece a la empresa; los eventos de sesión/roles/usuarios son globales.
  Object.entries(tables).forEach(([name, rows]) => {
    if (name === 'roles' || name === 'usuarios') return;
    rows.forEach((row) => {
      row.empresa_id = name === 'auditoria_logs' && (row.modulo === 'sesion' || ['roles', 'usuarios'].includes(row.tabla)) ? '' : empresa.id;
    });
  });
  return tables;
}
