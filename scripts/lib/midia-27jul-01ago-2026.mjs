// Mídia da janela 27/07 → 01/08/2026, lida do export de campanhas do Gerenciador (conta CA2).
//
// Por que ler o CSV em vez de fixar números no código: a extração anterior vinha da API com o
// token vencido e cobria só até 31/07 16h24 — o gasto do São Geraldo aparecia como R$632,83
// contra os R$1.413,59 reais da janela. Export do Gerenciador é a fonte de verdade do gasto.
//
// O export NÃO traz cliques nem CTR. Se precisar deles, reexportar incluindo as colunas
// "Cliques no link" e "CTR"; até lá, a métrica de eficiência de mídia aqui é o CPM.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CSV_PADRAO = join(homedir(), 'Downloads', 'CA2---Bula-360-Campanhas-27-de-jul-de-2026-1-de-ago-de-2026.csv')

// Parser mínimo de CSV com campos entre aspas — o export do Meta usa vírgula e aspas simples.
function parseCsv(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let dentroDeAspas = false
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]
    if (dentroDeAspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1 }
      else if (c === '"') dentroDeAspas = false
      else campo += c
    } else if (c === '"') dentroDeAspas = true
    else if (c === ',') { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas.filter((l) => l.some((x) => x !== ''))
}

// O export do Meta sai com ponto decimal e sem separador de milhar ("1192.58"). Trato o caso
// pt-BR ("1.192,58") só como defesa, caso a exportação mude de locale.
const num = (v) => {
  const bruto = String(v ?? '').trim()
  const texto = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto
  const n = Number(texto)
  return Number.isFinite(n) ? n : 0
}

export function carregaMidia(caminho = CSV_PADRAO) {
  const linhas = parseCsv(readFileSync(caminho, 'utf8'))
  const cab = linhas[0]
  const idx = (nome) => cab.indexOf(nome)
  const iNome = idx('Nome da campanha')
  const iGasto = idx('Valor usado (BRL)')
  const iImpr = idx('Impressões')
  const iAlcance = idx('Alcance')
  const iResult = idx('Resultados')
  const iCusto = idx('Custo por resultados')
  const iDe = idx('Início dos relatórios')
  const iAte = idx('Encerramento dos relatórios')

  const campanhas = linhas.slice(1).map((l) => {
    const gasto = num(l[iGasto])
    const impressoes = num(l[iImpr])
    const alcance = num(l[iAlcance])
    return {
      nome: l[iNome],
      // "LEADS - SAO GERALDO" é a campanha do leilão; os "CA - SAO GERALDO - ..." da planilha
      // são os conjuntos dentro dela.
      bloco: /SAO GERALDO/i.test(l[iNome]) ? 'SAO GERALDO' : 'PERPETUO',
      gasto,
      impressoes,
      alcance,
      frequencia: alcance ? impressoes / alcance : 0,
      cpm: impressoes ? (gasto / impressoes) * 1000 : 0,
      resultadosMeta: l[iResult] === '' ? null : num(l[iResult]),
      custoResultadoMeta: l[iCusto] === '' ? null : num(l[iCusto]),
    }
  })

  const soma = (itens) => {
    const gasto = itens.reduce((a, c) => a + c.gasto, 0)
    const impressoes = itens.reduce((a, c) => a + c.impressoes, 0)
    // Alcance NÃO é somável entre campanhas (a mesma pessoa pode estar nas duas). Somado aqui
    // só para calcular frequência aproximada por campanha, nunca para reportar alcance total.
    return { gasto, impressoes, cpm: impressoes ? (gasto / impressoes) * 1000 : 0 }
  }

  const doBloco = (b) => campanhas.filter((c) => c.bloco === b)

  return {
    caminho,
    janela: { de: linhas[1][iDe], ate: linhas[1][iAte] },
    campanhas,
    saoGeraldo: { ...doBloco('SAO GERALDO')[0], ...soma(doBloco('SAO GERALDO')) },
    perpetuo: { ...doBloco('PERPETUO')[0], ...soma(doBloco('PERPETUO')) },
    total: soma(campanhas),
  }
}
