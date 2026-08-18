-- Grupo contábil de cada categoria para a DRE em cascata (pedido do chefe, 18/08/2026):
-- RECEITA BRUTA -> (-) IMPOSTOS -> (=) RECEITA LÍQUIDA -> (-) CUSTO DIRETO ->
-- (=) LUCRO BRUTO -> (-) DESP. VARIÁVEIS -> (-) DESP. FIXAS -> (=) EBITDA ->
-- (+/-) RESULTADO FINANCEIRO -> (=) LUCRO LÍQUIDO.
-- 'ignorar' = fora do P&L (transferências internas, resgates de aplicação).
alter table erp_categorias add column if not exists dre_grupo text;

update erp_categorias set dre_grupo = case
  when nome in ('Transferencias Internas - Entrada','Transferencias Internas - Saida','Resgate Aplicacao Financeira') then 'ignorar'
  when nome in ('Recebimento Cliente','Comissoes Recebidas','Comissao Leilao','Vendas','Servicos Prestados','Outras Receitas') then 'receita'
  when nome in ('Impostos e Taxas','Imposto sobre Receita (18%)') then 'imposto'
  when nome in ('Comissão Funcionário','Repasse Assessorias/Parceiros','Despesa Operacional Leilão','Viagem/Passagens') then 'custo_direto'
  when nome in ('Marketing e Publicidade','Transporte (Apps)','Combustivel','Alimentacao/Refeicoes','Supermercado/Alimentos',
                'REEMBOLSO','Compras Diversas','Cartão de Crédito','Outras Despesas','Veiculos/Manutencao','Informatica/Eletronicos') then 'despesa_variavel'
  when nome in ('Folha de Pagamento','SALÁRIOS','Encargos Sociais','Aluguel','Energia/Agua/Telefone','Software/Assinaturas',
                'Servicos de Terceiros','Seguros','Manutencao','Material de Escritorio') then 'despesa_fixa'
  when nome in ('Tarifas Bancarias','Juros e Multas','Integralizacao Capital Cooperativa','Aplicacao Financeira',
                'Receita Financeira','Estornos e Devolucoes','Estorno Cartao','Seguro Cartao','Anuidade Cartao',
                'Pagamento Fatura','Outras Despesas Cartao','Encargos Cartao') then 'financeiro'
  else dre_grupo
end
where dre_grupo is null;
