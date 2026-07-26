/**
 * Classificação de categoria do mercado de leilões — módulo PURO de propósito.
 *
 * Mora aqui, e não em `mercado-leiloes.ts` nem na server action, por duas razões
 * concretas (as duas já custaram um deploy quebrado):
 *
 *  1. Arquivo `'use server'` só pode exportar função async. `ehNelorePo` é
 *     síncrona, então exportá-la de `app/sistema/actions/mercado.ts` compila no
 *     tsc mas QUEBRA no build do Next ("Export ehNelorePo doesn't exist").
 *  2. `mercado-leiloes.ts` importa o cliente Apify, que lê `process.env` — pôr
 *     isto lá arrastaria código de servidor para o bundle do browser.
 *
 * Zero dependências: pode ser importado por client component e por server
 * action ao mesmo tempo, que é exatamente o que a tela precisa.
 */

/**
 * A Bula trabalha com **Nelore PO**, e só. "Nelore" solto não serve de filtro:
 * a agenda pública traz também Nelore CEIP (comercial certificado), Nelore
 * Pintado e Nelore Mocho, que são outras coisas. Aceita "Nelore PO" e
 * "Nelore P.O.".
 */
export function ehNelorePo(categoria: string | null | undefined): boolean {
    return /nelore\s*p\.?\s*o\.?(\b|$)/i.test(String(categoria ?? ''))
}
