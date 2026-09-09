-- Evidência do fato bancário e rateio de baixas existentes são dimensões distintas.
-- Estas tabelas não dão baixa, não criam movimentos e não alteram saldos.
CREATE TABLE public.erp_movimento_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimento_id uuid NOT NULL UNIQUE REFERENCES public.erp_movimentos_bancarios(id) ON DELETE RESTRICT,
  conta_bancaria_id uuid NOT NULL REFERENCES public.erp_contas_bancarias(id),
  data_bancaria date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  valor numeric(18,2) NOT NULL CHECK (valor > 0),
  alcance text NOT NULL CHECK (alcance IN ('individual','grupo')),
  documento text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  criterio text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.erp_movimento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimento_id uuid NOT NULL REFERENCES public.erp_movimentos_bancarios(id) ON DELETE RESTRICT,
  conta_pagar_id uuid REFERENCES public.erp_contas_pagar(id) ON DELETE RESTRICT,
  conta_receber_id uuid REFERENCES public.erp_contas_receber(id) ON DELETE RESTRICT,
  valor numeric(18,2) NOT NULL CHECK (valor > 0),
  fundamento text NOT NULL CHECK (fundamento IN ('documentado','cadastrado','divergente')),
  evidencia jsonb NOT NULL CHECK (jsonb_typeof(evidencia)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(conta_pagar_id,conta_receber_id)=1)
);
CREATE UNIQUE INDEX erp_rateio_cp_unico ON public.erp_movimento_rateios(movimento_id,conta_pagar_id) WHERE conta_pagar_id IS NOT NULL;
CREATE UNIQUE INDEX erp_rateio_cr_unico ON public.erp_movimento_rateios(movimento_id,conta_receber_id) WHERE conta_receber_id IS NOT NULL;
CREATE INDEX erp_rateio_cp ON public.erp_movimento_rateios(conta_pagar_id);
CREATE INDEX erp_rateio_cr ON public.erp_movimento_rateios(conta_receber_id);
ALTER TABLE public.erp_movimento_evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_movimento_rateios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_movimento_evidencias, public.erp_movimento_rateios FROM anon, authenticated;
GRANT ALL ON public.erp_movimento_evidencias, public.erp_movimento_rateios TO service_role;

CREATE FUNCTION public.erp_validar_rateio() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE m public.erp_movimentos_bancarios; liquidado numeric; alocado numeric; cancelado boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.movimento_id IS DISTINCT FROM OLD.movimento_id OR NEW.conta_pagar_id IS DISTINCT FROM OLD.conta_pagar_id OR NEW.conta_receber_id IS DISTINCT FROM OLD.conta_receber_id) THEN
    RAISE EXCEPTION 'Para mudar o destino de um rateio, remova-o e registre o novo destino na mesma transação';
  END IF;
  SELECT * INTO m FROM erp_movimentos_bancarios WHERE id=NEW.movimento_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Movimento não encontrado'; END IF;
  IF (NEW.conta_pagar_id IS NOT NULL AND m.tipo<>'saida') OR (NEW.conta_receber_id IS NOT NULL AND m.tipo<>'entrada') THEN RAISE EXCEPTION 'Sentido bancário incompatível com o título'; END IF;
  SELECT coalesce(sum(valor),0) INTO alocado FROM erp_movimento_rateios WHERE movimento_id=m.id AND id<>NEW.id;
  IF alocado+NEW.valor>m.valor THEN RAISE EXCEPTION 'Rateio ultrapassa o valor do movimento'; END IF;
  IF NEW.conta_pagar_id IS NOT NULL THEN
    SELECT valor_pago, status='cancelado' OR substituido_por IS NOT NULL INTO liquidado,cancelado FROM erp_contas_pagar WHERE id=NEW.conta_pagar_id FOR UPDATE;
    SELECT coalesce(sum(valor),0) INTO alocado FROM erp_movimento_rateios WHERE conta_pagar_id=NEW.conta_pagar_id AND id<>NEW.id;
  ELSE
    SELECT valor_recebido, status='cancelado' OR substituido_por IS NOT NULL INTO liquidado,cancelado FROM erp_contas_receber WHERE id=NEW.conta_receber_id FOR UPDATE;
    SELECT coalesce(sum(valor),0) INTO alocado FROM erp_movimento_rateios WHERE conta_receber_id=NEW.conta_receber_id AND id<>NEW.id;
  END IF;
  IF liquidado IS NULL OR cancelado THEN RAISE EXCEPTION 'Título inexistente, cancelado ou substituído'; END IF;
  IF alocado+NEW.valor>liquidado THEN RAISE EXCEPTION 'Rateio ultrapassa a baixa já registrada; ratear não efetua nova baixa'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER erp_validar_rateio BEFORE INSERT OR UPDATE ON public.erp_movimento_rateios FOR EACH ROW EXECUTE FUNCTION public.erp_validar_rateio();

CREATE FUNCTION public.erp_preservar_rateio_movimento() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM erp_movimento_rateios WHERE movimento_id=NEW.id) AND (
    NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.valor<(SELECT sum(valor) FROM erp_movimento_rateios WHERE movimento_id=NEW.id)
  ) THEN RAISE EXCEPTION 'Revise os rateios antes de alterar o sentido ou reduzir o movimento'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER erp_preservar_rateio_movimento BEFORE UPDATE OF valor,tipo ON public.erp_movimentos_bancarios FOR EACH ROW EXECUTE FUNCTION public.erp_preservar_rateio_movimento();

CREATE FUNCTION public.erp_preservar_rateio_titulo() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE alocado numeric; liquidado numeric;
BEGIN
  IF TG_TABLE_NAME='erp_contas_pagar' THEN
    SELECT coalesce(sum(valor),0) INTO alocado FROM erp_movimento_rateios WHERE conta_pagar_id=NEW.id;
    liquidado=NEW.valor_pago;
  ELSE
    SELECT coalesce(sum(valor),0) INTO alocado FROM erp_movimento_rateios WHERE conta_receber_id=NEW.id;
    liquidado=NEW.valor_recebido;
  END IF;
  IF alocado>0 AND (liquidado<alocado OR NEW.status='cancelado' OR NEW.substituido_por IS NOT NULL) THEN RAISE EXCEPTION 'Revise os rateios antes de reduzir a baixa, cancelar ou substituir o título'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER erp_preservar_rateio_cp BEFORE UPDATE OF valor_pago,status,substituido_por ON public.erp_contas_pagar FOR EACH ROW EXECUTE FUNCTION public.erp_preservar_rateio_titulo();
CREATE TRIGGER erp_preservar_rateio_cr BEFORE UPDATE OF valor_recebido,status,substituido_por ON public.erp_contas_receber FOR EACH ROW EXECUTE FUNCTION public.erp_preservar_rateio_titulo();
