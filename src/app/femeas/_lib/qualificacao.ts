// ─────────────────────────────────────────────────────────────────────────
// A RÉGUA DO SERVIDOR — e o vocabulário que ela julga.
//
// Fonte única para os dois lados: o formulário (client) valida com estas
// funções e a rota (servidor) revalida com as mesmas. Duas cópias da mesma
// régua divergem, e quando divergem o lead é recusado no servidor depois de
// passar no browser — sem mensagem que explique.
//
// ⚠️ AQUI "MQL" NÃO É O MQL CANÔNICO DO CRM. A régua de touros
// (DEFAULT_JMP_MQL_RULE em src/lib/crm-types.ts) é `≥100 cabeças + tem IE`, e
// foi desenhada para comprador de TOURO: quem tem 100 vacas comerciais precisa
// de touro. Aplicá-la aqui reprovaria justamente o público que esta página
// existe para atrair — quem está montando o criatório e pode ter rebanho
// pequeno (ou nenhum). A apuração do São Geraldo (§9 de
// ANALISE-VERBA-SAOGERALDO-2026-07-31.md) já mostrou a mesma régua subestimando
// o inventário atendível em ~35%, com 11 de 18 leads caindo só por não ter IE.
//
// ⚠️ E ESTA RÉGUA NÃO É O PORTÃO DO FUNIL. A triagem é MANUAL (decisão de
// 05/08): quem decide se o lead vira reunião é o SDR, na coluna "Aprovado" da
// aba FEMEAS. O que a régua decide é só (a) qual página de obrigado o lead vê e
// (b) o VALOR da conversão enviado ao Meta — isto é, o que o algoritmo de mídia
// aprende a procurar. Nenhum lead é descartado por ela: reprovado entra na fila
// do SDR igual ao aprovado.
//
// Por isso errar a régua custa eficiência de MÍDIA, não lead perdido — e por
// isso a calibração fica para quando houver dado real confrontando esta coluna
// com a "Aprovado" do SDR (Fase 11, T11.3).
// ─────────────────────────────────────────────────────────────────────────

import { cpfValido } from '@/lib/habilitacao-form'
import { categoriaIds, CATEGORIA_INDECISO } from './categorias'
import { form } from './copy'

/** Categorias aceitas no formulário: as seis + "ainda não sei". */
export const CATEGORIAS_ACEITAS: readonly string[] = [...categoriaIds, CATEGORIA_INDECISO.id]

/** Vocabulário dos selects — o texto mora na copy (INV-5), a validação aqui. */
export const MOMENTOS_ACEITOS: readonly string[] = form.momentos
export const REBANHOS_ACEITOS: readonly string[] = form.rebanhos
export const QUANTIDADES_ACEITAS: readonly string[] = form.quantidades

/**
 * Os pesos da régua, num lugar só — é isto que se mexe quando o dado chegar.
 *
 * `minimoDeCabecas` é `null` de propósito e com comentário: é a diferença
 * central entre esta régua e a de touros, e a única linha deste arquivo que não
 * pode ser "otimizada" sem desfazer a decisão que a página inteira representa.
 */
export const REGRA_FEMEAS = {
  /** CPF ou CNPJ com dígito verificador válido. Habilita a compra em leilão. */
  exigeDocumento: true,
  /** Sem IE não há como comprar em leilão nem transportar o animal. */
  exigeInscricaoEstadual: true,
  /**
   * Faixas que sinalizam expectativa de preço de gado comercial — o público
   * que a rodada anterior trouxe em massa. Sinal, não recusa: existe (raro) o
   * comprador com caixa para volume de matriz cara, e ele continua chegando ao
   * SDR. O que muda é o valor que a mídia aprende a perseguir.
   */
  quantidadesForaDaFaixa: ['mais de 50 matrizes'] as readonly string[],
  /**
   * NUNCA usar mínimo de cabeças nesta régua. Quem está montando criatório
   * pode ter rebanho pequeno ou nenhum e ser exatamente o comprador certo —
   * o campo "Cabeças" aqui é CONTEXTO para a conversa, não corte.
   */
  minimoDeCabecas: null,
} as const

/** Dígito verificador de CNPJ (o repositório só tinha o de CPF). */
export function cnpjValido(raw: string): boolean {
  const cnpj = String(raw ?? '').replace(/\D/g, '')
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const dv = (base: string) => {
    let peso = base.length - 7
    let soma = 0
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso
      peso = peso - 1 < 2 ? 9 : peso - 1
    }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13])
}

/**
 * CPF ou CNPJ — o formulário pede "CPF ou CNPJ" porque produtor com fazenda em
 * pessoa jurídica é o comprador típico, não a exceção. Recusar CNPJ derrubaria
 * lead bom por formalidade.
 */
export function documentoValido(raw: string): boolean {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}

/** Máscara de CPF/CNPJ conforme o tamanho digitado (client e servidor). */
export function mascaraDocumento(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

export interface EntradaQualificacao {
  documento: string
  /** 'Sim' | 'Não', como o formulário pergunta. */
  inscricaoEstadual: string
  quantidade: string
}

export interface VeredictoQualificacao {
  /** Mantido com este nome porque o formulário e o GTM já esperam `is_mql`. */
  isMql: boolean
  /**
   * Por que reprovou, em chave estável — vai para o PostHog e é o que permite
   * comparar a régua com a coluna "Aprovado" do SDR sem depender de texto.
   */
  motivos: string[]
}

/** A régua. Função pura: sem rede, sem data, sem env — testável em uma linha. */
export function avaliarLeadFemeas(entrada: EntradaQualificacao): VeredictoQualificacao {
  const motivos: string[] = []
  if (REGRA_FEMEAS.exigeDocumento && !documentoValido(entrada.documento)) {
    motivos.push('documento_invalido')
  }
  if (REGRA_FEMEAS.exigeInscricaoEstadual && entrada.inscricaoEstadual !== 'Sim') {
    motivos.push('sem_inscricao_estadual')
  }
  if (REGRA_FEMEAS.quantidadesForaDaFaixa.includes(entrada.quantidade)) {
    motivos.push('quantidade_fora_da_faixa')
  }
  return { isMql: motivos.length === 0, motivos }
}
