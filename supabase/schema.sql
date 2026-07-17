-- Pega y ejecuta todo este archivo en Supabase → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

-- ─── Postulaciones de candidatos ─────────────────────────────────────
create table if not exists candidatos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  edad text,
  cedula text,
  correo text not null,
  anios text,
  area text,
  descripcion text,
  archivo_nombre text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  foto_cedula_url text,
  creado_en timestamptz not null default now()
);

alter table candidatos enable row level security;

create policy "Cualquiera puede leer candidatos"
  on candidatos for select using (true);

create policy "Cualquiera puede registrar un candidato"
  on candidatos for insert with check (true);

create policy "Cualquiera puede actualizar el estado de un candidato"
  on candidatos for update using (true);

-- ─── Vacantes de empleo ───────────────────────────────────────────────
create table if not exists vacantes (
  id uuid primary key default gen_random_uuid(),
  autor_correo text not null,
  autor_nombre text not null,
  puesto text not null,
  empresa text not null,
  ubicacion text not null,
  area text not null,
  tipo_contrato text not null,
  salario text,
  descripcion text not null,
  foto_url text,
  creado_en timestamptz not null default now()
);

alter table vacantes enable row level security;

create policy "Cualquiera puede leer vacantes"
  on vacantes for select using (true);

create policy "Cualquiera puede publicar una vacante"
  on vacantes for insert with check (true);

create policy "Cualquiera puede borrar vacantes"
  on vacantes for delete using (true);
