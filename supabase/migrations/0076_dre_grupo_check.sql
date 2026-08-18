-- O vocabulário do grupo de DRE passa a ser garantido pelo banco.
--
-- A tela do ERP é um HTML estático, fora do TypeScript, e o select de categoria
-- oferecia um conjunto próprio de valores ('receita_bruta', 'deducao',
-- 'despesa_op', 'desp_fin', 'rec_fin', 'outros') que NENHUM cálculo reconhecia.
-- Como a coluna era text livre, salvar uma categoria pela tela gravava um grupo
-- inválido sem erro; a DRE então jogava a linha no grupo padrão (receita para
-- entrada, despesa variável para saída) e passava a somar errado em silêncio.
--
-- O select foi alinhado a DreGrupo (src/lib/erp-dashboards.ts). O check abaixo
-- fecha a porta para qualquer outro caminho — script, API ou tela nova.

update public.erp_categorias set dre_grupo = null
 where dre_grupo is not null
   and dre_grupo not in ('receita','imposto','custo_direto','despesa_variavel','despesa_fixa','financeiro','ignorar');

do $$ begin
  alter table public.erp_categorias add constraint erp_categorias_dre_grupo_chk
    check (dre_grupo is null or dre_grupo in
      ('receita','imposto','custo_direto','despesa_variavel','despesa_fixa','financeiro','ignorar'));
exception when duplicate_object then null; end $$;

comment on column public.erp_categorias.dre_grupo is
  'Grupo da DRE. Valores fechados (ver DreGrupo em src/lib/erp-dashboards.ts); null = ainda não classificada.';
