// HastaPro (Firebird, SÓ LEITURA), filial 2: os lotes dos dois leilões Naviraí Camparino
// com pisteiro, VENDEDOR (é ele que separa Camparino de Naviraí) e comprador.
// Saída: outputs/camparino-fechamento-2026-09/hp-lotes.json
import Firebird from 'node-firebird'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.startsWith('#'))
  .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const FB = { host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT||3050), database: env.HASTAPRO_DATABASE,
  user: env.HASTAPRO_USER, password: env.HASTAPRO_PASSWORD, lowercase_keys:false, pageSize:4096 }
const fb = (sql, params=[]) => new Promise((res,rej)=>Firebird.attach(FB,(err,db)=>{
  if (err) return rej(err); db.query(sql, params, (e,r)=>{db.detach(); e?rej(e):res(r)}) }))
const str = v => v==null ? '' : Buffer.isBuffer(v) ? v.toString('latin1').replace(/\x00/g,'').trim() : String(v).replace(/\x00/g,'').trim()
const brl = n => Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
const PRES = Object.fromEntries((await fb('select PRE_CODIGO, PRE_NOME from PRESTADORES')).map(p=>[str(p.PRE_CODIGO), str(p.PRE_NOME)]))
const ALVO = [
  ['2026-08-22','ESSENCIA','2','260822224948509'],
  ['2026-08-23','REPRODUTORES','2','260823115309818'],
]
const dump = []
for (const [data, tag, fil, lei] of ALVO) {
  const lotes = await fb('select LOT_LOTE, LOT_ORDEM, LOT_QTD, LOT_LANCE, LOT_TOTAL, LOT_PISTEIRO, LOT_TIPO, LOT_PARCELAS, LOT_DATA_VENDA, CON_CODIGO, LOT_PORCENTAGEM from LOTES ' +
    'where FIL_CODIGO=? and LEI_CODIGO=? order by LOT_ORDEM', [fil, lei])
  const comps = await fb('select c.LOT_LOTE, c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_UF, f.FAZ_NOME from COMPRADORES c ' +
    'left join CLIENTES cl on cl.CLI_CODIGO=c.CLI_CODIGO ' +
    'left join FAZENDAS f on f.FAZ_CODIGO=c.FAZ_CODIGO and f.CLI_CODIGO=c.CLI_CODIGO where c.FIL_CODIGO=? and c.LEI_CODIGO=?', [fil, lei])
  const vends = await fb('select v.LOT_LOTE, v.VEN_PORCENTAGEM, cl.CLI_NOME, f.FAZ_NOME from VENDEDORES v ' +
    'left join CLIENTES cl on cl.CLI_CODIGO=v.CLI_CODIGO ' +
    'left join FAZENDAS f on f.FAZ_CODIGO=v.FAZ_CODIGO and f.CLI_CODIGO=v.CLI_CODIGO where v.FIL_CODIGO=? and v.LEI_CODIGO=?', [fil, lei])
  const cmap = {}; for (const c of comps) { const k = str(c.LOT_LOTE); (cmap[k] ||= []).push(c) }
  const vmap = {}; for (const v of vends) { const k = str(v.LOT_LOTE); (vmap[k] ||= []).push(v) }
  console.log('\n### ' + data + ' — ' + tag + ' (FIL ' + fil + ' / ' + lei + ') — ' + lotes.length + ' lotes')
  let tot = 0
  for (const l of lotes) {
    const k = str(l.LOT_LOTE); const pist = str(l.LOT_PISTEIRO)
    tot += Number(l.LOT_TOTAL||0)
    const comp = (cmap[k]||[]).map(c=>[str(c.CLI_NOME), str(c.FAZ_NOME), str(c.CLI_UF), c.COP_PORCENTAGEM!=null&&Number(c.COP_PORCENTAGEM)!==100?`(${c.COP_PORCENTAGEM}%)`:''].filter(Boolean).join(' · ')).join(' + ')
    const vend = (vmap[k]||[]).map(v=>[str(v.CLI_NOME), str(v.FAZ_NOME)].filter(Boolean).join(' · ')).join(' + ')
    console.log('   lote ' + k.padEnd(5), 'qtd=' + Number(l.LOT_QTD||1), 'lance=' + brl(l.LOT_LANCE).padStart(10), 'total=' + brl(l.LOT_TOTAL).padStart(12),
      '| pist=' + (pist ? (PRES[pist] || '??' + pist) : '(vazio)').padEnd(24), '| vend=' + vend, '| comp=' + comp)
    dump.push({ data, tag, fil, lei, lote:k, ordem:l.LOT_ORDEM, qtd:Number(l.LOT_QTD||1), lance:Number(l.LOT_LANCE||0), total:Number(l.LOT_TOTAL||0), parcelas: str(l.LOT_PARCELAS), pist_cod:pist,
      pist_nome: pist ? (PRES[pist]||null) : null, vendedor: vend, comprador: comp })
  }
  console.log('   TOTAL', brl(tot))
}
fs.writeFileSync('outputs/camparino-fechamento-2026-09/hp-lotes.json', JSON.stringify(dump,null,2))
