-- Títulos cancelados não podem inflar a visão de recebimento por fechamento.
-- Recria a view filtrando cr.status <> 'cancelado' na condição do JOIN
-- (fechamentos sem título continuam aparecendo).
create or replace view bula_leilao_recebimento as
 select f.id as fechamento_id,
    f.nome,
    f.data,
    count(cr.id) as titulos,
    coalesce(sum(cr.valor), 0::numeric) as receita_titulos,
    coalesce(sum(cr.valor_recebido), 0::numeric) as recebido,
    coalesce(sum(case when cr.status = 'recebido' then cr.valor else 0::numeric end), 0::numeric) as valor_recebido_status,
    bool_or(cr.status = 'recebido') as algum_recebido,
    bool_and(cr.status = 'recebido') as todos_recebidos,
    max(cr.data_recebimento) as ultima_data_recebimento,
    bool_or(m.id is not null) as tem_extrato_vinculado,
    string_agg(distinct nullif(cr.numero_documento, ''), ', ') as documentos
   from bula_leilao_fechamento f
     left join erp_contas_receber cr on cr.fechamento_id = f.id and cr.status <> 'cancelado'
     left join erp_movimentos_bancarios m on m.conta_receber_id = cr.id
  group by f.id, f.nome, f.data;
