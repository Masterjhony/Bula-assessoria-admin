// Limpeza do campo `condicao` — pedido do Marcelo em 01/09/2026, 15:19.
//
// Ele mandou print do card TOUROS NELORE CRISPIM na agenda pública com o texto
// circulado em verde e escreveu: "Tira essas escritas, deixa só o restante".
//
// O que estava aparecendo era nota INTERNA de procedência que eu mesmo gravei em
// `bula_leiloes.condicao`:
//   "Leilão que a Bula vai atender em setembro/2026 (definido na reunião com o
//    Felipe Mota e a equipe de assessores; lista passada pelo Marcelo no grupo em
//    01/09/2026). Horário, leiloeira, cidade e modalidade entram quando o cartaz
//    for divulgado."
//
// `condicao` é campo PÚBLICO — sai no card da agenda e na página do leilão. Nota de
// procedência, pendência e ressalva de cadastro não vão aqui. Quem quiser esse
// rastro tem o comentário do script e o `notes` do `agenda_events`, que é interno.
//
// Como o pedido foi "a agenda no geral", varri as 164 linhas de `bula_leiloes`
// atrás de meta-texto (não informado / a arte não / por isso está cadastrado /
// lista passada / quando o cartaz / atendidas pela Bula). Deu 7 cards — os 3 da
// lista do Marcelo, o Aurora, os dois dias da BC Agrofeira e o Pintado Brasil.
//
// Os 3 da lista ficam com `condicao` VAZIA: o que sobrava neles era só "Oferta de
// N touros", e a quantidade já aparece no card pelo campo `animais` ("14 animais").
// Nos outros 4, sai só a frase meta e a descrição comercial fica inteira.
//
// Uso: node scripts/agenda-2026-09-01-limpa-metatexto.mjs [--dry]

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const dry = process.argv.includes('--dry')
const root = 'F:/Projetos/Desktop/web-bula'

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// data + nome do card -> condicao nova. String vazia = card sem descrição.
const LIMPEZA = [
  { data: '2026-09-03', nome: 'Touros Nelore Crispim', condicao: '' },
  { data: '2026-09-19', nome: 'Touros Barra do Dia', condicao: '' },
  { data: '2026-09-24', nome: 'Fêmeas FB Agro', condicao: '' },
  {
    data: '2026-09-17',
    nome: '1º Leilão Fazenda Bela Aurora',
    condicao: '1º Leilão Fazenda Bela Aurora — "onde nasce uma bela genética". Quinta-feira, 17/09/2026, '
      + 'às 19h. Oferta de fêmeas Nelore P.O. do Nelore Bela Aurora. Plataforma e-rural, com oferecimento '
      + 'erural pay e assessoria da Bula Assessoria Pecuária. Transmissão em erural.net e no YouTube '
      + '@erural_br. Comercial e-rural (16) 99742-0031.',
  },
  {
    data: '2026-09-18',
    nome: '1º DIA - BC AGROFEIRA FAZENDA RECANTO',
    condicao: 'BC Agrofeira 2026 na Fazenda Recanto (200 anos), Chã Preta/AL, dias 18 e 19 de setembro. '
      + 'Homologado e chancelado por PMGZ, Dia de Campo Oficial, Pró-Genética e Leilão&Shopping. Realização '
      + 'BC / RVF Eventos, organização Start, patrocínio Sebrae. Assessores do leilão: Premier, Davi '
      + 'Sostinho e Bula.',
  },
  {
    data: '2026-09-19',
    nome: '2º DIA - BC AGROFEIRA FAZENDA RECANTO',
    condicao: 'BC Agrofeira 2026 na Fazenda Recanto (200 anos), Chã Preta/AL, dias 18 e 19 de setembro. '
      + 'Homologado e chancelado por PMGZ, Dia de Campo Oficial, Pró-Genética e Leilão&Shopping. Realização '
      + 'BC / RVF Eventos, organização Start, patrocínio Sebrae. Assessores do leilão: Premier, Davi '
      + 'Sostinho e Bula.',
  },
  {
    data: '2026-10-08',
    nome: 'LEILÃO PINTADO BRASIL 2026',
    condicao: 'Evento de 08 a 11 de outubro de 2026, em Campo Grande/MS — "onde a raça e a excelência se '
      + 'encontram". Realização São Lourenço (Geraldo de Souza Carvalho Jr). Leilão oficial Nelore, vídeos FV5.',
  },
]

for (const item of LIMPEZA) {
  const { data: pub, error: selErr } = await supabase
    .from('bula_leiloes')
    .select('id, nome, condicao')
    .eq('data', item.data)
    .eq('nome', item.nome)
    .maybeSingle()
  if (selErr) throw new Error(`SELECT ${item.data} ${item.nome}: ${selErr.message}`)
  if (!pub) {
    console.error(`!! nao achei ${item.data} — ${item.nome}`)
    continue
  }

  const antes = (pub.condicao ?? '').length
  const depois = item.condicao.length
  console.log(`\n[${item.data}] ${pub.nome}`)
  console.log(`   ${antes} -> ${depois} caracteres${depois === 0 ? ' (card sem descricao)' : ''}`)

  if (dry) {
    console.log(`   [dry] condicao: ${item.condicao ? JSON.stringify(item.condicao) : '(vazia)'}`)
    continue
  }

  const { error } = await supabase.from('bula_leiloes').update({ condicao: item.condicao }).eq('id', pub.id)
  if (error) throw new Error(`UPDATE ${pub.id}: ${error.message}`)
  console.log('   atualizado')
}

console.log('\nOK — meta-texto removido da agenda publica.')
