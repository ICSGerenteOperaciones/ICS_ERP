import { createClient } from '@supabase/supabase-js';

// Conexión a Supabase (proyecto ICS_ERP). La clave "publishable" es pública por diseño: la seguridad
// la imponen la autenticación (Supabase Auth) y las políticas RLS de la base de datos.
// Se puede sobrescribir con VITE_SUPABASE_URL / VITE_SUPABASE_KEY, o desactivar con VITE_BACKEND=local
// para trabajar en modo demostración (datos en el navegador, sin servidor).
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://netxdlquxcjgurbgndpf.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_jmrk9gDNUe_RtFTWutYGPQ_KWR1DSgZ';

export const REMOTE = import.meta.env.VITE_BACKEND !== 'local';

export const supabase = REMOTE
  ? createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ics-erp-auth' },
    })
  : null;
