-- Título, banco e contabilidade são gravados juntos ou não são gravados.
CREATE UNIQUE INDEX IF NOT EXISTS erp_cp_recorrencia_apurada_unica ON public.erp_contas_pagar ((apuracao->>'recorrencia_de')) WHERE apuracao ? 'recorrencia_de';
CREATE OR REPLACE FUNCTION public.erp_registrar_pagamento_apurado(p_id uuid,p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE t erp_contas_pagar%ROWTYPE; m erp_movimentos_bancarios%ROWTYPE;
  v_banco uuid; v numeric; total numeric; novo numeric; j numeric; mu numeric; de numeric;
  dia date; situacao text; debito uuid; credito uuid; lanc uuid; intervalo interval; prox date;
BEGIN
  SELECT * INTO STRICT t FROM erp_contas_pagar WHERE id=p_id FOR UPDATE;
  IF t.status NOT IN ('aberto','parcial','vencido') OR t.substituido_por IS NOT NULL THEN RAISE EXCEPTION 'Título não está disponível para pagamento'; END IF;
  IF t.apuracao->>'pagamento_situacao'='informado' THEN RAISE EXCEPTION 'Quitação já informada: concilie o movimento do extrato antes de registrar outra saída'; END IF;
  IF coalesce(t.apuracao->>'natureza', CASE WHEN t.origem='estimativa' OR coalesce(t.tags,'[]'::jsonb) ? 'orcamento' THEN 'projecao' ELSE 'obrigacao' END)='projecao' THEN
    RAISE EXCEPTION 'Confirme a obrigação e o valor antes de pagar uma projeção';
  END IF;
  v_banco:=coalesce(nullif(p_dados->>'conta_bancaria_id','')::uuid,t.conta_bancaria_id);
  PERFORM 1 FROM erp_contas_bancarias conta WHERE conta.id=v_banco AND conta.ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta bancária ativa obrigatória'; END IF;
  dia:=coalesce(nullif(p_dados->>'data_pagamento','')::date,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
  j:=coalesce((p_dados->>'juros')::numeric,t.juros,0); mu:=coalesce((p_dados->>'multa')::numeric,t.multa,0); de:=coalesce((p_dados->>'desconto')::numeric,t.desconto,0);
  IF least(j,mu,de)<0 OR j<>round(j,2) OR mu<>round(mu,2) OR de<>round(de,2) THEN RAISE EXCEPTION 'Ajustes inválidos'; END IF;
  total:=t.valor-de+j+mu; v:=coalesce((p_dados->>'valor')::numeric,total-coalesce(t.valor_pago,0));
  IF v<=0 OR v<>round(v,2) OR v>total-coalesce(t.valor_pago,0) THEN RAISE EXCEPTION 'Pagamento deve ser positivo e não superar o saldo do título'; END IF;
  novo:=coalesce(t.valor_pago,0)+v; situacao:=CASE WHEN novo=total THEN 'pago' ELSE 'parcial' END;
  UPDATE erp_contas_pagar SET valor_pago=novo,status=situacao,juros=j,multa=mu,desconto=de,conta_bancaria_id=v_banco,data_pagamento=dia,
    forma_pagamento=coalesce(p_dados->>'forma_pagamento',t.forma_pagamento),apuracao=apuracao-'pagamento_situacao' WHERE id=p_id;
  INSERT INTO erp_movimentos_bancarios(conta_bancaria_id,data,tipo,descricao,valor,categoria_id,centro_custo_id,plano_conta_id,pessoa_id,conta_pagar_id,origem,documento,observacoes)
    VALUES(v_banco,dia,'saida','Pagto: '||t.descricao,v,t.categoria_id,t.centro_custo_id,t.plano_conta_id,t.fornecedor_id,p_id,'pagamento',coalesce(t.numero_documento,''),coalesce(p_dados->>'observacoes','')) RETURNING * INTO m;
  SELECT id INTO credito FROM erp_plano_contas WHERE codigo='1.1.02'; debito:=t.plano_conta_id;
  IF debito IS NULL THEN SELECT id INTO debito FROM erp_plano_contas WHERE codigo='2.1.01'; END IF;
  IF debito IS NOT NULL AND credito IS NOT NULL THEN
    INSERT INTO erp_lancamentos(data,historico,valor_total,origem,documento,conta_pagar_id,movimento_id)
      VALUES(dia,'Pagamento '||t.descricao,v,'pagamento',coalesce(t.numero_documento,''),p_id,m.id) RETURNING id INTO lanc;
    INSERT INTO erp_lancamento_partidas(lancamento_id,plano_conta_id,centro_custo_id,natureza,valor,ordem)
      VALUES(lanc,debito,t.centro_custo_id,'debito',v,1),(lanc,credito,NULL,'credito',v,2);
  END IF;
  IF situacao='pago' AND t.recorrencia IS NOT NULL AND t.recorrencia<>'nenhuma' THEN
    intervalo:=CASE t.recorrencia WHEN 'semanal' THEN interval '7 days' WHEN 'mensal' THEN interval '1 month' WHEN 'bimestral' THEN interval '2 months' WHEN 'trimestral' THEN interval '3 months' WHEN 'semestral' THEN interval '6 months' WHEN 'anual' THEN interval '1 year' END;
    IF intervalo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_contas_pagar WHERE apuracao->>'recorrencia_de'=p_id::text) THEN
      prox:=CASE WHEN t.vencimento IS NOT NULL THEN (t.vencimento+intervalo)::date ELSE NULL END;
      INSERT INTO erp_contas_pagar(descricao,fornecedor_id,categoria_id,centro_custo_id,plano_conta_id,conta_bancaria_id,valor,emissao,vencimento,recorrencia,origem,apuracao,observacoes)
      VALUES(t.descricao||' — próximo ciclo a apurar',t.fornecedor_id,t.categoria_id,t.centro_custo_id,t.plano_conta_id,v_banco,t.valor,dia,prox,t.recorrencia,'estimativa',
        jsonb_build_object('natureza','projecao','valor_situacao','a_apurar','recorrencia_de',p_id::text,'pendencias',jsonb_build_array('Conferir fato gerador, valor e prazo do novo ciclo; não reutilizar a confirmação anterior.')),
        'Projeção gerada após a quitação do título '||p_id::text);
    END IF;
  END IF;
  SELECT * INTO t FROM erp_contas_pagar WHERE id=p_id;
  RETURN jsonb_build_object('titulo',to_jsonb(t),'movimento',to_jsonb(m));
END $$;
REVOKE ALL ON FUNCTION public.erp_registrar_pagamento_apurado(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_registrar_pagamento_apurado(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.erp_estornar_pagamento_apurado(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE t erp_contas_pagar%ROWTYPE;
BEGIN
  SELECT * INTO STRICT t FROM erp_contas_pagar WHERE id=p_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM erp_contas_pagar WHERE apuracao->>'recorrencia_de'=p_id::text AND coalesce(valor_pago,0)>0) THEN
    RAISE EXCEPTION 'O ciclo seguinte já possui pagamento; revise a cadeia de recorrência antes do estorno';
  END IF;
  DELETE FROM erp_movimentos_bancarios WHERE conta_pagar_id=p_id;
  UPDATE erp_lancamentos SET status='estornado' WHERE conta_pagar_id=p_id;
  UPDATE erp_contas_pagar SET valor_pago=0,status='aberto',data_pagamento=NULL WHERE id=p_id RETURNING * INTO t;
  RETURN to_jsonb(t);
END $$;
REVOKE ALL ON FUNCTION public.erp_estornar_pagamento_apurado(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_estornar_pagamento_apurado(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
