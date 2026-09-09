-- Obrigações existentes não desaparecem por dependerem de apuração ou de recebimento.
-- Dados privados e decisões por lançamento são aplicados em transação auditada separada.
ALTER TABLE public.erp_contas_pagar ADD COLUMN IF NOT EXISTS apuracao jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.erp_contas_pagar ALTER COLUMN vencimento DROP NOT NULL;
ALTER TABLE public.erp_contas_pagar ALTER COLUMN vencimento DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.erp_validar_apuracao_pagamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a jsonb; ref text; recebido numeric; total numeric; st text; substituto uuid; vinculado numeric;
BEGIN
  a := NEW.apuracao;
  IF jsonb_typeof(a) <> 'object'
     OR (a ? 'natureza' AND coalesce(a->>'natureza','') NOT IN ('obrigacao','projecao','em_verificacao'))
     OR (a ? 'valor_situacao' AND coalesce(a->>'valor_situacao','') NOT IN ('confirmado','a_apurar','em_disputa'))
     OR (a ? 'pagamento_situacao' AND coalesce(a->>'pagamento_situacao','') NOT IN ('pendente','informado')) THEN
    RAISE EXCEPTION 'Classificação da apuração inválida';
  END IF;
  IF (a ? 'fontes' AND jsonb_typeof(a->'fontes') IS DISTINCT FROM 'array')
    OR (a ? 'pendencias' AND jsonb_typeof(a->'pendencias') IS DISTINCT FROM 'array')
    OR (a ? 'previsao_mes' AND coalesce(a->>'previsao_mes','') !~ '^\d{4}-(0[1-9]|1[0-2])-01$') THEN
    RAISE EXCEPTION 'Fontes, pendências ou mês de previsão inválidos';
  END IF;
  IF a->>'sem_valor'='true' AND (NEW.valor<>0 OR coalesce(a->>'valor_situacao','') NOT IN ('a_apurar','em_disputa')) THEN
    RAISE EXCEPTION 'Valor ainda não apurado deve permanecer identificado como tal';
  END IF;
  IF a ? 'condicao' THEN
    IF a->'condicao'->>'tipo' IS DISTINCT FROM 'recebimento'
       OR jsonb_typeof(a->'condicao'->'titulos_ids') IS DISTINCT FROM 'array'
       OR jsonb_array_length(a->'condicao'->'titulos_ids') = 0 THEN
      RAISE EXCEPTION 'Condição exige os títulos a receber vinculados';
    END IF;
    FOR ref IN SELECT jsonb_array_elements_text(a->'condicao'->'titulos_ids') LOOP
      IF NOT EXISTS (SELECT 1 FROM erp_contas_receber WHERE id = ref::uuid) THEN
        RAISE EXCEPTION 'Título da condição não encontrado: %', ref;
      END IF;
    END LOOP;
  END IF;
  -- Impede baixa por qualquer escritor, não apenas pelo botão da interface.
  IF (TG_OP = 'INSERT' AND (coalesce(NEW.valor_pago,0)>0 OR NEW.status='pago'))
     OR (TG_OP = 'UPDATE' AND (coalesce(NEW.valor_pago,0)>coalesce(OLD.valor_pago,0) OR (NEW.status='pago' AND OLD.status IS DISTINCT FROM 'pago'))) THEN
    IF a->>'natureza' IN ('projecao','em_verificacao')
       OR a->>'valor_situacao' IN ('a_apurar','em_disputa') THEN
      RAISE EXCEPTION 'Conclua a apuração do valor e da obrigação antes de registrar o pagamento';
    END IF;
    IF a ? 'condicao' THEN
      FOR ref IN SELECT jsonb_array_elements_text(a->'condicao'->'titulos_ids') LOOP
        SELECT valor_recebido, valor-coalesce(desconto,0)+coalesce(juros,0)+coalesce(multa,0), status, substituido_por
          INTO recebido,total,st,substituto FROM erp_contas_receber WHERE id=ref::uuid FOR SHARE;
        IF st='cancelado' OR substituto IS NOT NULL OR coalesce(recebido,0)<total OR st IS DISTINCT FROM 'recebido' THEN
          RAISE EXCEPTION 'Pagamento condicionado: o recebimento % ainda não foi integralmente confirmado',ref;
        END IF;
        SELECT coalesce(sum(x.valor),0) INTO vinculado FROM (
          SELECT m.valor FROM erp_movimentos_bancarios m WHERE m.conta_receber_id=ref::uuid AND m.tipo='entrada'
            AND NOT EXISTS(SELECT 1 FROM erp_movimento_rateios r WHERE r.movimento_id=m.id)
          UNION ALL
          SELECT r.valor FROM erp_movimento_rateios r JOIN erp_movimentos_bancarios m ON m.id=r.movimento_id
            WHERE r.conta_receber_id=ref::uuid AND m.tipo='entrada'
        ) x;
        IF vinculado<total THEN RAISE EXCEPTION 'Pagamento condicionado: falta vincular o crédito bancário integral do recebimento %',ref; END IF;
      END LOOP;
    END IF;
  END IF;
  IF NEW.status='pago' AND coalesce(NEW.valor_pago,0)<NEW.valor-coalesce(NEW.desconto,0)+coalesce(NEW.juros,0)+coalesce(NEW.multa,0) THEN
    IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago OR NEW.valor IS DISTINCT FROM OLD.valor THEN
      RAISE EXCEPTION 'Título pago exige liquidação integral do valor líquido';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS erp_cp_validar_apuracao ON public.erp_contas_pagar;
CREATE TRIGGER erp_cp_validar_apuracao BEFORE INSERT OR UPDATE ON public.erp_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.erp_validar_apuracao_pagamento();
COMMENT ON COLUMN public.erp_contas_pagar.apuracao IS 'Evidências comerciais, classificação e condição do pagamento. Não substitui prova de liquidação bancária.';
NOTIFY pgrst, 'reload schema';
