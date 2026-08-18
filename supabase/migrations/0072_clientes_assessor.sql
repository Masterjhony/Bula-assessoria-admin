-- Vínculo cliente -> assessor (pedido do chefe, 18/08/2026).
-- Preenchido pelo sync com o HastaPro (LOT_PISTEIRO dos lotes comprados) e
-- editável na ficha do cliente.
alter table clientes add column if not exists assessor text;
comment on column clientes.assessor is 'Assessor responsável (derivado do pisteiro dos lotes no HastaPro; editável).';
