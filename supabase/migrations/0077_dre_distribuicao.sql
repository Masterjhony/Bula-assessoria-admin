-- ============================================================
-- 0077_dre_distribuicao.sql — a DRE ganha a linha de DISTRIBUIÇÃO
--
-- O contrato de sociedade (17/07/2026) remunera o Marcelo com 35% do LUCRO,
-- pago trimestralmente. Isso não é despesa da operação: sai depois do lucro,
-- e só existe quando há lucro. Nenhum dos grupos de 0073/0076 servia —
-- 'despesa_fixa' inflaria o custo fixo (e com ele o ponto de equilíbrio, que
-- é a régua do prognóstico), 'financeiro' mentiria o rótulo e 'ignorar'
-- sumiria com um pagamento que é caixa de verdade.
--
-- Grupo novo: 'distribuicao'. Entra na cascata DEPOIS do lucro líquido
-- operacional, como participação no resultado. O check de 0076 é reescrito
-- para aceitá-lo — o vocabulário segue fechado, só ficou um item maior.
-- ============================================================

alter table public.erp_categorias drop constraint if exists erp_categorias_dre_grupo_chk;
alter table public.erp_categorias add constraint erp_categorias_dre_grupo_chk
  check (dre_grupo is null or dre_grupo in
    ('receita','imposto','custo_direto','despesa_variavel','despesa_fixa','financeiro','distribuicao','ignorar'));

comment on column public.erp_categorias.dre_grupo is
  'Grupo da DRE. Valores fechados (ver DreGrupo em src/lib/erp-dashboards.ts); null = ainda não classificada.';

insert into public.erp_categorias (nome, tipo, dre_grupo, cor)
select 'Remuneracao de Socio', 'despesa', 'distribuicao', '#7A5C9E'
where not exists (select 1 from public.erp_categorias where nome = 'Remuneracao de Socio');
