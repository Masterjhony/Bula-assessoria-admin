/**
 * Classificador de despesa do HastaPro para a DRE da Bula Assessoria.
 *
 * Extraido de gera-dre-hastapro-2026.mjs para ser usado tambem pela DRE
 * fechada — as duas precisam classificar exatamente igual, senao a conferencia
 * entre elas nao vale nada.
 *
 * Uso:
 *   const { classifica, canon, cat, fornecedor, mesDe } = criaClassificador({ CATS, CLI, PRE })
 */
export function criaClassificador({ CATS, CLI, PRE }) {
    const n = v => Number(v || 0)
    const r2 = v => Math.round(n(v) * 100) / 100
    const up = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    const cat = t => CATS[t.FCT_CODIGO] || ''
    const fornecedor = t => CLI[t.TIT_FORNECEDOR] || PRE[t.TIT_FORNECEDOR] || '(sem fornecedor)'
    /** Regime de caixa: o mes e o da baixa; sem baixa, o vencimento (previsto). */
    const dataRef = t => t.MOV_PAGODIA || t.TIT_DT_VENCTO
    const mesDe = t => Number(String(dataRef(t) || '').slice(5, 7)) || 0

    /* Nomes canonicos — a mesma pessoa aparece como cliente e como prestador. */
    const CANON = [
        [/FABIO.*OMENA/, 'Fábio Omena'], [/DOUGLAS.*BISPO/, 'Douglas Bispo'],
        [/LEONARDO.*SERAFIM/, 'Leonardo Serafim'], [/FELIPE.*(VILELA|ANDRADE)/, 'Felipe Andrade'],
        [/PERALTA/, 'Luiz Felipe Peralta'], [/GUSTAVO.*RUSA|RUSA ASSESSORIA/, 'Gustavo Rusa'],
        [/REGIANE|NANE/, 'Nane Neves'], [/VALERIA.*BORGES/, 'Valéria Borges da Silva'],
        [/LAILA/, 'Laila de Sousa'], [/LUCAS.*MARTINS/, 'Lucas Martins'],
        [/MARCELO.*CARNEIRO|FORMULA DO BOI/, 'Marcelo Carneiro'], [/FABRICIO.*HYPPOLITO/, 'Fabrício Hyppolito'],
        [/MATHEUS.*ALVES/, 'Matheus Alves'], [/BRUNO.*REIS/, 'Bruno dos Reis'],
        [/ANA PAULA/, 'Ana Paula Munhoz'], [/FLAVIO.*JACQUES/, 'Flavio Jacques'],
        [/FRANCIELI/, 'Francieli Ferreira'], [/VALDEN/, 'Valdenuza Felix'],
        [/JOAO EDUARDO/, 'João Eduardo'], [/JOAO GABRIEL/, 'João Gabriel'], [/JOAO ANTONIO/, 'João Antônio'],
        [/MATHEUS.*EBERT/, 'Matheus Ebert'], [/RAVENNA/, 'Ravenna Fonseca'],
        [/PEDRO.*PEREIRA/, 'Pedro Pereira'], [/LUANA/, 'Luana'], [/CARRELO/, 'Alexandre Carrelo'],
        [/NATHALIA/, 'Nathalia Bacellar'], [/FATIMA/, 'Fátima Cantini'],
    ]
    const canon = nome => (CANON.find(([re]) => re.test(up(nome)))?.[1]) || String(nome).split(' ').slice(0, 3)
        .map(w => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ')

    /* ------------------------------------------------- classificacao por linha */
    /**
     * Devolve [grupo, subgrupo, detalhe]. A ordem das regras importa: o que e
     * inequivoco pela descricao vem antes da categoria, porque as categorias do
     * HastaPro misturam naturezas.
     */
    function classifica(t) {
        const d = up(t.TIT_DESCRICAO), c = up(cat(t)), f = up(fornecedor(t))
        const pessoa = canon(fornecedor(t))

        if (/^CARTAO$|CARTAO DE CREDITO/.test(c) || /FATURA CARTAO|CARTAO (ABRIL|MASTER|VISA|CRED|SICREDI)|CARTAO CREDITO|CARTAO DE CREDITO/.test(d))
            return ['MEMO', 'Fatura de cartão (liquidação)', fornecedor(t)]
        if (/APORTE SOCIEDADE|PARCERIA FORMULA DO BOI/.test(d))
            return ['MEMO', 'Aporte e parceria de sócio', fornecedor(t)]

        if (/RESCISAO/.test(d) || c === 'RESCISAO') return ['VAR', 'Despesas Trabalhistas', pessoa]

        /* Encargos e beneficios vem antes da comissao: "VALE TRANSP" do Consorcio
           Guaicurus estava caindo em comissao por causa da categoria BONIFICACAO. */
        if (/FGTS|INSS|IRRF|IRPF|DARF FUNCIONARIOS/.test(d) || /FGTS/.test(f))
            return ['FIX', 'Folha de Pagamento', /FGTS/.test(d + f) ? 'FGTS' : 'INSS / IRRF']
        if (/VALE TRANSP/.test(d) || /GUAICURUS/.test(f)) return ['FIX', 'Folha de Pagamento', 'Vale-transporte']

        if (/COMISSAO|COMISAO/.test(d) || /COMISS|BONIFICACAO/.test(c)) return ['COM', pessoa, pessoa]

        if (/ISSQN|^ISS |GUIA ISSQN/.test(d) || /ISSQN/.test(c)) return ['IMP', 'ISS', 'ISS']
        if (/SIMPLES|DASN|^DAS |DARF/.test(d) || /SIMPLES NACIONAL|IMPOSTO/.test(c))
            return ['IMP', 'Simples Nacional', 'Simples Nacional']

        if (/SALARIO|FIXO |PRESTACAO DE SERVICO|SERVICOS (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO)/.test(d)
            || /SALARIO|FOLHA SALARIAL|VETERINARIO/.test(c)) return ['FIX', 'Folha de Pagamento', pessoa]

        if (/UNIDAS|ALUGUEL (DE )?CARRO|LOCACAO|MULTA|REPARO.*(JEEP|CARRO)|FINANC COMPASS|SAFRA FINANCEIRA|LOCALIZA/.test(d)
            || /ALUGUEL CARRO/.test(c) || /UNIDAS|SAFRA FINANCEIRA/.test(f)) {
            const det = /MULTA/.test(d) ? 'Multas' : /FINANC|SAFRA/.test(d + f) ? 'Financiamento'
                : /REPARO/.test(d) ? 'Reparo' : 'Aluguel de carro'
            return ['FIX', 'Carros', det]
        }

        if (/CONTADOR|CONTABIL/.test(d)) return ['FIX', 'Utilitários', 'Contabilidade']
        if (/CLICKWEB|CLICK WEB|HOSPEDAGEM SITE|SITE BULA|DOCUSING|DOCUSIGN|SUPABASE|VERCEL|CLAUDE|CODEX/.test(d) || /DOCUSING/.test(c))
            return ['FIX', 'Utilitários', 'Tecnologia']
        if (/INTERNET|DIGITAL ?NET/.test(d) || c === 'INTERNET') return ['FIX', 'Utilitários', 'Internet']
        if (/ALUGUEL/.test(d)) return ['FIX', 'Utilitários', 'Aluguel']
        if (/SEGURO.*EQUIPE|MONGERAL/.test(d + f)) return ['FIX', 'Utilitários', 'Seguro da equipe']
        if (/ENERGIA|ENERSUL/.test(d)) return ['FIX', 'Utilitários', 'Energia']
        if (/MATERIAL|TOALHA|LAVANDERIA|MANUTENCAO|IMPRESSORA|MAT ESCRIT/.test(d) || /AQUISICAO DE MATERIAIS|MANUTENCAO/.test(c))
            return ['FIX', 'Utilitários', 'Material e manutenção']
        if (/CAFE/.test(d)) return ['FIX', 'Utilitários', 'Café']

        if (/PATROCINADO|TRAFEGO|FACEBOOK|CAMPANHA|COLLAB|ADS|OPEROUTER|META API/.test(d) || /PATROCINADO|MARKETING/.test(c))
            return ['VAR', 'Despesas de Marketing', /PATROCINADO|TRAFEGO/.test(d) ? `Patrocinado ${pessoa}` : 'Mídia e campanhas']
        if (/DIARIA|MOTORISTA|LIMPEZA|FAXINA|CONSULTA.*CADASTRO|CPD/.test(d) || /DIARIAS|LIMPEZA|CPD|SERVICOS GERAIS/.test(c))
            return ['VAR', 'Despesas de Diárias', /LIMPEZA|FAXINA/.test(d) ? 'Limpeza'
                : /CPD/.test(d + c) ? 'CPD e diárias de leilão' : 'Diárias']
        if (/REEMBOLSO/.test(d)) return ['VAR', 'Despesas Operacionais|Reembolsos', pessoa]
        if (/HOTEL|HOSPEDAGEM|CASA (ALUGADA|UBERABA|EXPOZEBU|EXPOGENETICA)|DIARIA HOTEL|ESTADIA/.test(d) || c === 'HOTEL')
            return ['VAR', 'Despesas Operacionais|Hospedagem', fornecedor(t)]
        if (/PASSAGEM|COMBUSTIVEL|GASOLINA|PEDAGIO|UBER|TAXI|TRANSLADO|DESLOCAMENTO|ABASTECIMENTO/.test(d)
            || /PASSAGENS|COMBUSTIVEL|PEDAGIO|UBER|DESLOCAMENTO/.test(c)) {
            const det = /PASSAGEM/.test(d) ? 'Passagens de avião' : /PEDAGIO/.test(d) ? 'Pedágio'
                : /UBER|TAXI/.test(d) ? 'Uber e táxi' : /COMBUSTIVEL|GASOLINA|ABASTEC/.test(d) ? 'Gasolina' : 'Translado'
            return ['VAR', 'Despesas Operacionais|Translado', det]
        }
        if (/ALIMENTACAO|MERCADO|ALMOCO|RESTAURANTE|ACOUGUE|BOLO/.test(d) || /ALIMENTACAO|MERCADO/.test(c))
            return ['VAR', 'Despesas Operacionais|Alimentação', fornecedor(t)]

        return ['VAR', 'Despesas Operacionais|Outros', `${fornecedor(t)} · ${cat(t) || 'sem categoria'}`]
    }

    return { classifica, canon, cat, fornecedor, dataRef, mesDe, up, n, r2 }
}

/**
 * Grava o workbook mesmo com o arquivo aberto no Excel: em EBUSY, salva ao
 * lado com sufixo e devolve o caminho que realmente foi usado.
 */
export async function gravaXLSX(wb, caminho) {
    try {
        await wb.xlsx.writeFile(caminho)
        return caminho
    } catch (e) {
        if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e
        const alt = caminho.replace(/\.xlsx$/i, ` (${new Date().toTimeString().slice(0, 5).replace(':', 'h')}).xlsx`)
        await wb.xlsx.writeFile(alt)
        return alt
    }
}
