-- =====================================================================
-- Sistema de Portaria de Galpao - Schema Supabase (Postgres)
-- Execute este script INTEIRO no SQL Editor do seu projeto Supabase
-- (Project > SQL Editor > New query > colar tudo > Run).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES (perfis dos usuarios do sistema)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text not null,
  cargo text not null default 'porteiro' check (cargo in ('admin','porteiro')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfis dos usuarios (estende auth.users)';

-- Funcao auxiliar: verifica se o usuario logado e admin.
-- security definer evita recursao de RLS ao consultar a propria tabela profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and cargo = 'admin'
  );
$$;

-- Cria automaticamente um profile quando um novo usuario se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, cargo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    'porteiro'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede que um usuario comum altere o proprio cargo para admin
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cargo is distinct from old.cargo and not public.is_admin() then
    new.cargo := old.cargo;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Permite que o proprio usuario crie seu perfil caso o trigger
-- on_auth_user_created nao tenha rodado (auto-recuperacao no login).
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);


-- ---------------------------------------------------------------------
-- 2. TRANSPORTADORAS
-- ---------------------------------------------------------------------
create table public.transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

alter table public.transportadoras enable row level security;

create policy "transportadoras_select_authenticated"
  on public.transportadoras for select to authenticated using (true);

create policy "transportadoras_write_admin"
  on public.transportadoras for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 3. FUNCIONARIOS (para bate-ponto interno)
-- ---------------------------------------------------------------------
create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.funcionarios enable row level security;

create policy "funcionarios_select_authenticated"
  on public.funcionarios for select to authenticated using (true);

create policy "funcionarios_write_admin"
  on public.funcionarios for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 4. ENTREGAS (entregas/coletas esperadas)
-- ---------------------------------------------------------------------
create table public.entregas (
  id uuid primary key default gen_random_uuid(),
  data_prevista date not null,
  hora_prevista time,
  tipo text not null default 'entrega' check (tipo in ('entrega','coleta')),
  transportadora text,
  placa_prevista text,
  documento text,
  fornecedor_cliente text,
  status text not null default 'pendente'
    check (status in ('pendente','em_andamento','concluida','atrasada','cancelada')),
  observacoes text,
  visita_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_entregas_data_prevista on public.entregas (data_prevista);
create index idx_entregas_status on public.entregas (status);

alter table public.entregas enable row level security;

create policy "entregas_all_authenticated"
  on public.entregas for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 5. VISITAS (entrada/saida de caminhoes)
-- ---------------------------------------------------------------------
create table public.visitas (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  motorista_nome text,
  motorista_documento text,
  transportadora text,
  tipo_operacao text not null default 'entrega'
    check (tipo_operacao in ('entrega','coleta','devolucao','outro')),
  documento text,
  doca text,
  entrada_at timestamptz not null default now(),
  saida_at timestamptz,
  status text not null default 'no_patio' check (status in ('no_patio','finalizado')),
  observacoes text,
  entrega_id uuid references public.entregas(id),
  registrado_por uuid references public.profiles(id),
  finalizado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.entregas
  add constraint fk_entregas_visita foreign key (visita_id)
  references public.visitas(id);

create index idx_visitas_status on public.visitas (status);
create index idx_visitas_entrada_at on public.visitas (entrada_at);
create index idx_visitas_placa on public.visitas (placa);

alter table public.visitas enable row level security;

create policy "visitas_all_authenticated"
  on public.visitas for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 6. OCORRENCIAS
-- ---------------------------------------------------------------------
create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  data_hora timestamptz not null default now(),
  tipo text not null default 'outro'
    check (tipo in ('avaria','atraso','divergencia','seguranca','acidente','outro')),
  gravidade text not null default 'media' check (gravidade in ('baixa','media','alta')),
  descricao text not null,
  placa text,
  foto_url text,
  visita_id uuid references public.visitas(id),
  status text not null default 'aberta' check (status in ('aberta','resolvida')),
  resolucao text,
  registrado_por uuid references public.profiles(id),
  resolvido_por uuid references public.profiles(id),
  resolvido_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_ocorrencias_status on public.ocorrencias (status);
create index idx_ocorrencias_data_hora on public.ocorrencias (data_hora);

alter table public.ocorrencias enable row level security;

create policy "ocorrencias_all_authenticated"
  on public.ocorrencias for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 7. PONTO_REGISTROS (bate-ponto: funcionarios e motoristas)
-- ---------------------------------------------------------------------
create table public.ponto_registros (
  id uuid primary key default gen_random_uuid(),
  pessoa_tipo text not null check (pessoa_tipo in ('funcionario','motorista')),
  funcionario_id uuid references public.funcionarios(id),
  motorista_nome text,
  motorista_documento text,
  visita_id uuid references public.visitas(id),
  tipo text not null check (tipo in ('entrada','saida','pausa_inicio','pausa_fim')),
  data_hora timestamptz not null default now(),
  observacoes text,
  registrado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_ponto_data_hora on public.ponto_registros (data_hora);
create index idx_ponto_funcionario on public.ponto_registros (funcionario_id);

alter table public.ponto_registros enable row level security;

create policy "ponto_all_authenticated"
  on public.ponto_registros for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 8. STORAGE: bucket para fotos de ocorrencias
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ocorrencias', 'ocorrencias', true)
on conflict (id) do nothing;

-- Leitura publica (necessario para exibir <img src="..."> sem autenticacao)
create policy "ocorrencias_fotos_select"
  on storage.objects for select
  using (bucket_id = 'ocorrencias');

-- Upload restrito a usuarios autenticados
create policy "ocorrencias_fotos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ocorrencias');

-- Remocao restrita a usuarios autenticados
create policy "ocorrencias_fotos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ocorrencias');


-- =====================================================================
-- FIM DO SCHEMA. Proximos passos (veja README.md para detalhes):
-- 1. Em Authentication > Providers, confirme que "Email" esta habilitado.
-- 2. Crie seu primeiro usuario pelo login.html (opcao "Criar conta").
-- 3. Promova esse usuario a admin rodando no SQL Editor:
--    update public.profiles set cargo = 'admin' where email = 'SEU_EMAIL';
-- =====================================================================
