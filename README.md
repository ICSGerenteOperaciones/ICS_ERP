# Insight Cloud Solution · ERP ICS v1.0

ERP de **ICS – Innovation Code Services**, construido en React + Vite y listo para desplegar en Vercel.

## Módulos

| Módulo | Maestro | Detalles (tablas relacionadas) | Workflow |
|---|---|---|---|
| Compras | Orden de compra | Ítems, Entregas | Borrador → Solicitada → Aprobada → Recibida → Cerrada (+ Rechazada / Anulada) |
| Firmas | Documento | Firmantes (firma manuscrita secuencial), Adjuntos | Borrador → En firma → Firmado (+ Rechazado / Vencido) |
| Actividades | Actividad | Tareas, Registro de tiempos | Planeada → En curso → En revisión → Completada (+ Cancelada) |
| Terceros | Tercero | Contactos, Direcciones, Cuentas bancarias | Prospecto → En validación → Activo (+ Inactivo / Bloqueado) |
| Inventario | Movimiento (y catálogo de artículos) | Líneas por artículo | Borrador → Confirmado (+ Anulado) |
| Auditoría | Evento (log) | Cambios campo a campo (anterior → nuevo) | — (solo lectura, inmutable) |
| Empresas | Empresa | — (vista consolidada del grupo) | — |
| Usuarios / Roles | Usuario, Rol | Dashboards por usuario; matriz CRUD + Aprobar por módulo | — |

**El workflow no es un módulo: es la metodología de trabajo de todos los módulos.** Cada módulo de gestión incluye:

- Etapas del flujo en cada registro (con bloqueo de edición según el estado) y botones de transición según permisos.
- Bandeja **Por aprobar** al inicio de la lista del módulo.
- Vistas **Tabla**, **Flujo** (tablero para arrastrar entre estados) y **Proceso** (mapa de estados, transiciones y bitácora).
- Historial de movimientos en cada registro y sección **Flujo de trabajo** en los dashboards.

**Compras ⇄ Inventario.** Los ítems de una orden de compra pueden ligarse a un artículo del inventario. Al ejecutar *Registrar recepción*, el sistema genera automáticamente un movimiento de **Entrada por compra** en borrador con las cantidades y costos de la orden; el almacén lo confirma (ahí se actualizan las existencias y el último costo del artículo). Las salidas no pueden dejar el stock en negativo, y la orden muestra el estado de su ingreso (*Al recibir la orden / Pendiente / Ingresado*).

**Auditoría (logs).** Toda creación, edición, eliminación y cambio de estado, además de inicios y cierres de sesión (incluidos los intentos fallidos), queda registrada automáticamente con usuario, rol, fecha y los valores anterior y nuevo de cada campo. El módulo es de solo lectura, permite filtrar por usuario, módulo, acción y fechas, y exportar a CSV. Las contraseñas nunca se guardan en el log. En el DEMO se conservan los últimos 1.500 eventos.

**Multiempresa.** El sistema administra varias empresas del grupo en una misma instalación:

- Cada empresa tiene sus propios terceros, compras, firmas, actividades, inventario y auditoría, con **numeración independiente** (cada una arranca en OC-0001, TER-0001…). Usuarios, roles y empresas son globales.
- Cada usuario tiene **empresas con acceso** y una **predeterminada** (*Usuarios → Editar*); el administrador accede a todas. Al ingresar entra a su empresa predeterminada y puede cambiar de empresa desde el selector de la barra superior; todos los módulos y dashboards se recargan con los datos de la empresa elegida. Un usuario sin empresas asignadas no puede ingresar.
- El módulo **Empresas** (alta, edición, inactivación, color distintivo) incluye una vista consolidada del grupo con indicadores por empresa. No se puede eliminar una empresa que ya tiene registros: se inactiva.
- El aislamiento lo aplica la capa de datos (`src/data/db.js`): toda lectura se filtra por la empresa activa y todo registro nuevo se sella con ella, de modo que ninguna pantalla puede mezclar datos de empresas distintas ni abrir un registro de otra empresa por URL. En producción se refuerza en la base de datos con *Row Level Security* (ver `db/schema.sql`).
- La auditoría registra los eventos de cada empresa en su propio historial; las sesiones, cambios de empresa y gestión de usuarios/roles son eventos globales del grupo.
- Demo: **ICS Matriz** (con todos los datos), **ICS Cloud** e **ICS Andina**. `admin` y `crojas` acceden a las tres; `lgomez` y `rvargas` a Matriz y Cloud; `amejia` solo a Matriz.

- **Navegación en rueda** a la izquierda: gira con la rueda del ratón, las flechas o el teclado (↑ ↓); en móvil se convierte en una barra inferior.
- **Primera vista = dashboard parametrizado** del usuario (en *Usuarios → Dashboards de inicio*). El rol Administrador ve todos.
- Cada lista tiene vista **Tabla** y vista **Flujo** (Kanban: arrastrar una tarjeta a otra columna ejecuta la transición si el flujo y los permisos lo permiten).
- Tema oscuro y claro; los colores corporativos están en `src/styles/theme.css` y `src/config/brand.js`.

## Base de datos conectada (Supabase)

La aplicación trabaja por defecto contra el proyecto **ICS_ERP** de Supabase (PostgreSQL):

- **Acceso con Supabase Auth** (correo y contraseña). Las contraseñas nunca se guardan en las tablas del ERP.
  El administrador inicial es `desarrollador1@icscode.com.co`; desde el panel de usuario (esquina inferior del menú)
  puede **cambiar su contraseña**. Los demás usuarios se crean desde el módulo *Usuarios* (contraseña mínima de 10 caracteres).
- **Seguridad en la base de datos (RLS).** Aunque alguien se salte la interfaz, PostgreSQL impide leer o escribir datos de
  una empresa a la que el usuario no pertenece y hace cumplir la matriz de permisos CRUD de cada rol. La auditoría es de
  solo inserción: ni siquiera el administrador puede modificarla o borrarla. Pruébelo con `npm run probar:seguridad`.
- **Usuarios por función segura.** Crear usuarios, cambiar contraseñas ajenas y eliminar cuentas requieren privilegios de
  servidor, por lo que corren en la función `admin-usuarios` (`supabase/functions/admin-usuarios`), que verifica quién llama.
- **Numeración consecutiva por empresa en el servidor**: si dos usuarios crean una orden a la vez, la base asigna el siguiente
  código y evita duplicados.
- **Sincronización.** La interfaz mantiene una copia en memoria (rápida) y envía cada cambio al servidor en orden; si el
  servidor lo rechaza (permisos, datos inválidos, sin conexión) se avisa y la pantalla se resincroniza. Un indicador
  *Guardado / Guardando…* en la barra superior muestra el estado, y cada minuto se vuelven a leer los cambios de otros usuarios.
- **Esquema**: `db/migrations/` (se aplica en orden). **Datos de demostración** (3 empresas con terceros, compras, inventario,
  firmas y actividades): `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed:supabase` (se detiene si la base ya tiene empresas).
  La carga no incluye usuarios ni auditoría.
- Variables opcionales (ver `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (la clave *publishable* es pública por diseño).

**Modo demostración sin base de datos:** `VITE_BACKEND=local npm run dev` guarda todo en el navegador y usa los usuarios
de abajo (el botón ↺ restaura los datos de ejemplo).

## Usuarios del modo demostración

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `Ics2026*` | Administrador (acceso total, todos los dashboards) |
| `lgomez` | `Demo2026*` | Analista de compras |
| `crojas` | `Demo2026*` | Aprobador |
| `amejia` | `Demo2026*` | Líder de proyectos |
| `rvargas` | `Demo2026*` | Auditor interno |


## Ejecutar en local

```bash
npm install
npm run dev
```

## Desplegar en Vercel

1. Suba el proyecto a un repositorio Git (GitHub, GitLab o Bitbucket).
2. En Vercel: **Add New → Project**, importe el repositorio. Vercel detecta Vite automáticamente
   (build `npm run build`, salida `dist`). `vercel.json` ya incluye la reescritura para rutas SPA.
3. O desde la terminal: `npx vercel` (vista previa) y `npx vercel --prod`.

## Arquitectura

```
src/
  config/        brand.js (marca), modules.js (módulos, acciones CRUD, dashboards)
  data/          schema.js (relaciones maestro→detalle), db.js (repositorio CRUD), seed.js (datos DEMO)
  workflow/      definitions.js (estados y transiciones), engine.js (guardas, efectos, bitácora) — usado por todos los módulos
  auth/          AuthContext.jsx (sesión, can(modulo, accion), dashboards del usuario)
  components/    ModuleWheel, MasterDetailPage (motor genérico maestro-detalle), WorkflowPanels, DataTable, SignaturePad, ui
  modules/       compras, firmas, actividades, terceros, seguridad, dashboard
db/migrations/  Esquema PostgreSQL (Supabase): tablas, RLS, funciones y triggers
  supabase/       Función segura admin-usuarios (Edge Function)
  scripts/        seed-supabase (datos demo) y probar-seguridad (pruebas de RLS)
```

Cada módulo de gestión es una **configuración** (campos del maestro, tablas detalle, columnas, KPIs)
que interpreta `MasterDetailPage`; añadir un módulo nuevo consiste en declarar su configuración y su workflow.

## Pendientes recomendados para producción

- Activar en Supabase la **protección contra contraseñas filtradas** (Authentication → Policies) y, si lo desea, MFA para administradores.
- La auditoría se registra desde la aplicación (inmutable y atada al usuario autenticado). Para una trazabilidad que no dependa
  del cliente, se pueden añadir *triggers* de PostgreSQL que escriban en `auditoria_logs`.
- Con mucho volumen de datos, cargar por empresa en lugar de todas las accesibles, y paginar el listado de auditoría.
- Copias de seguridad y entornos: usar una rama/proyecto de pruebas distinto del de producción.
