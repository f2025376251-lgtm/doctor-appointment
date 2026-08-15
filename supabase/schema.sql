-- Run this in the Supabase SQL editor once.

create table if not exists public.appointments (
  id uuid primary key,
  confirmation_id text unique not null,
  doctor_name text,
  specialty text,
  appointment_date date not null,
  appointment_time text not null,
  patient_name text not null,
  dob date,
  age integer,
  gender text,
  phone text not null,
  email text not null,
  address text,
  reason text,
  insurance text,
  status text default 'booked',
  created_at timestamptz default now()
);

alter table public.appointments enable row level security;

create policy "Allow service role full access"
  on public.appointments
  for all
  using (true)
  with check (true);
