/**
 * Quem está do outro lado do lançamento bancário.
 *
 * A tela de Conciliação mostra "— definir —" quando o movimento não tem
 * `pessoa_id`: o extrato diz "PIX EMITIDO OUTRA IF - 17.895.646 0001-87", e
 * ninguém traduziu isso para "UBER DO BRASIL". Este módulo faz a tradução com
 * as regras que o histórico do próprio ERP já usava à mão:
 *
 *   1. CNPJ/CPF escrito no histórico  -> pessoa cadastrada com esse documento
 *   2. CPF mascarado (***.919.892-**) -> pessoa cujos 6 dígitos do meio batem
 *   3. lançamento do próprio banco ou de tributo (tarifa, seguro, DAS, ISSQN,
 *      varredura da aplicação, transferência entre as contas da Bula) -> a
 *      pessoa que o ERP já vinha usando para esse padrão
 *   4. nome do favorecido/remetente que o extrato declara ("FAV.: X LTDA",
 *      "REM.: Y LTDA") -> pessoa cadastrada com esse nome
 *
 * Nada aqui adivinha por semelhança de texto solto: um "Hotel Leonardo" no
 * memo é o hotel, não o Leonardo. Quando nenhuma regra fecha, devolve null e o
 * movimento continua pedindo mão humana — que é o certo, e não um nome
 * inventado.
 *
 * Usado em dois lugares: no importador de extrato (`extrato-aplicar`), para o
 * movimento já nascer identificado, e no backfill
 * (`scripts/identifica-contraparte.mts`), para o que entrou antes disso.
 */

export interface PessoaCadastro {
    id: string
    nome: string
    razao_social?: string | null
    documento?: string | null
}

export interface MovimentoTexto {
    descricao?: string | null
    observacoes?: string | null
    documento?: string | null
}

export interface Contraparte {
    pessoa_id: string
    nome: string
    /** qual das regras fechou — vai para o log e para o relatório do backfill */
    regra: 'documento' | 'documento-mascarado' | 'padrao-banco' | 'favorecido'
    evidencia: string
}

export function normaliza(s: unknown): string {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

export function digitos(s: unknown): string {
    return String(s ?? '').replace(/\D/g, '')
}

/**
 * Padrões de lançamento que não têm CNPJ no histórico e sempre têm o mesmo
 * dono. Os nomes são os que já estão no cadastro (`erp_pessoas.nome`) e a
 * escolha segue o que a conciliação vinha fazendo à mão nos meses anteriores —
 * por isso a contagem de precedentes no comentário de cada linha.
 */
const PADROES: Array<{ re: RegExp; pessoa: string; nota: string }> = [
    // tarifas do Sicoob
    { re: /^TARIFA\s+COBRAN|PACOTE\s+SERVICOS|TARIFA\s+(DOC|TED|PIX|EXTRATO)/i, pessoa: 'SICOOB (Tarifas)', nota: 'tarifa bancária' },
    // seguro em débito em conta (12 precedentes -> SICOOB Unique BR)
    { re: /CONV\.?\s*SEGUROS/i, pessoa: 'SICOOB Unique BR (banco)', nota: 'débito de seguro em conta' },
    // fatura de cartão debitada em conta (14 precedentes -> SICOOB Unique BR)
    { re: /CONV\.?\s*DEM\.?\s*EMPRES/i, pessoa: 'SICOOB Unique BR (banco)', nota: 'débito em conta de convênio/fatura' },
    // capital da cooperativa (8 precedentes -> SICOOB Unique BR)
    { re: /(PARCELAS\s+SUBSC|INTEGR\.?\s*CAPITAL|SUBSC\.?\/?INTEGR)/i, pessoa: 'SICOOB Unique BR (banco)', nota: 'subscrição/integralização de capital' },
    // tributos federais
    { re: /(TR\s*FD-?RFB|TRIBUTOS\s+FEDERAIS|\bDARF\b|SIMPLES\s+NACIONAL|\bDAS\b)/i, pessoa: 'RECEITA FEDERAL DO BRASIL', nota: 'tributo federal' },
    // tributo municipal
    { re: /(CONV\.?\s*PREFEITURA|\bISSQN\b|\bALVARA\b)/i, pessoa: 'PREFEITURA MUNICIPAL (tributo)', nota: 'tributo municipal' },
    // varredura da aplicação do Sicredi (157 precedentes)
    { re: /(RESG\.?\s*APLIC|APLICACAO\s+FINANCEIRA|RESGATE\s+ENVIADO\s+A\s+CC|VARREDURA|AJUSTE\s+DE\s+POSICAO\s+SICREDI|AJUSTE\s+POSICAO\s+APLICACAO)/i, pessoa: 'SICREDI - Aplicacao (varredura automatica)', nota: 'varredura/aplicação Sicredi' },
]

/** "FAV.: FULANO LTDA", "REM.: CICRANA LTDA", "Beneficiário: ..." */
const MARCADORES_FAVORECIDO = [
    /FAV\.?\s*:\s*([^|\-–]{6,80})/i,
    /REM\.?\s*:\s*([^|\-–]{6,80})/i,
    /BENEFICI[^:]*:\s*([^|(\-–]{6,80})/i,
    /RECEBEDOR\s*:\s*([^|(\-–]{6,80})/i,
    /PAGADOR\s*:\s*([^|(\-–]{6,80})/i,
]

const RE_CNPJ = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g
const RE_CPF = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g
const RE_CPF_MASCARADO = /\*{2,3}\.?(\d{3})\.(\d{3})-?\*{2}/g

function textoDo(mov: MovimentoTexto): string {
    return `${mov.descricao ?? ''} | ${mov.observacoes ?? ''}`
}

function documentosNoTexto(texto: string): string[] {
    const achados: string[] = []
    let semCnpj = texto
    for (const m of texto.matchAll(RE_CNPJ)) {
        const d = digitos(m[0])
        if (d.length === 14) { achados.push(d); semCnpj = semCnpj.replace(m[0], ' ') }
    }
    for (const m of semCnpj.matchAll(RE_CPF)) {
        const d = digitos(m[0])
        if (d.length === 11) achados.push(d)
    }
    return achados
}

export function identificaContraparte(
    mov: MovimentoTexto,
    pessoas: PessoaCadastro[],
): Contraparte | null {
    const texto = textoDo(mov)

    // 1. documento completo no histórico
    const porDoc = new Map<string, PessoaCadastro[]>()
    for (const p of pessoas) {
        const d = digitos(p.documento)
        if (d.length === 11 || d.length === 14) {
            const lista = porDoc.get(d) ?? []
            lista.push(p)
            porDoc.set(d, lista)
        }
    }
    for (const doc of documentosNoTexto(texto)) {
        const achou = porDoc.get(doc)
        if (achou?.length === 1) {
            return { pessoa_id: achou[0].id, nome: achou[0].nome, regra: 'documento', evidencia: `documento ${doc} no histórico` }
        }
    }

    // 2. CPF mascarado — os 6 dígitos do meio bastam para achar um único
    //    cadastro, seja ele com CPF inteiro ou também mascarado (há pessoas
    //    cadastradas assim, porque o extrato nunca mostrou o CPF completo)
    const meioDoCadastro = (doc: unknown) => {
        const bruto = String(doc ?? '')
        const mascarado = bruto.match(/\*{2,3}\.?(\d{3})\.(\d{3})-?\*{2}/)
        if (mascarado) return `${mascarado[1]}${mascarado[2]}`
        const d = digitos(bruto)
        return d.length === 11 ? d.slice(3, 9) : ''
    }
    for (const m of texto.matchAll(RE_CPF_MASCARADO)) {
        const meio = `${m[1]}${m[2]}`
        const achou = pessoas.filter(p => meioDoCadastro(p.documento) === meio)
        if (achou.length === 1) {
            return { pessoa_id: achou[0].id, nome: achou[0].nome, regra: 'documento-mascarado', evidencia: `CPF ***.${m[1]}.${m[2]}-**` }
        }
    }

    // 3. lançamento do próprio banco / tributo / varredura
    const porNome = new Map(pessoas.map(p => [normaliza(p.nome), p]))
    for (const regra of PADROES) {
        if (!regra.re.test(texto)) continue
        const p = porNome.get(normaliza(regra.pessoa))
        if (p) return { pessoa_id: p.id, nome: p.nome, regra: 'padrao-banco', evidencia: regra.nota }
    }

    // 4. favorecido/remetente declarado pelo extrato
    for (const marcador of MARCADORES_FAVORECIDO) {
        const m = texto.match(marcador)
        if (!m) continue
        const alvo = normaliza(m[1]).replace(/\b(LTDA|S\.?A\.?|EIRELI|ME|EPP|MEI)\b\.?/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
        if (alvo.length < 6) continue
        const candidatos = pessoas.filter(p => {
            const nome = normaliza(p.nome).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
            const razao = normaliza(p.razao_social).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
            if (nome.length >= 6 && (alvo === nome || alvo.startsWith(`${nome} `))) return true
            if (razao.length >= 6 && (alvo === razao || alvo.startsWith(`${razao} `))) return true
            return false
        })
        // o mais específico primeiro: "BULA REMATES" antes de "BULA"
        candidatos.sort((a, b) => normaliza(b.nome).length - normaliza(a.nome).length)
        if (candidatos.length) {
            return { pessoa_id: candidatos[0].id, nome: candidatos[0].nome, regra: 'favorecido', evidencia: `favorecido "${m[1].trim()}"` }
        }
    }

    return null
}
