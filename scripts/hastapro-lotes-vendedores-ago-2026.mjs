import Firebird from 'node-firebird'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const FB = { host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT||3050), database: env.HASTAPRO_DATABASE, user: env.HASTAPRO_USER, password: env.HASTAPRO_PASSWORD, lowercase_keys:false, pageSize:4096 }
const fb = (sql, params=[]) => new Promise((res,rej)=>Firebird.attach(FB,(err,db)=>{ if (err) return rej(err); db.query(sql, params, (e,r)=>{db.detach(); e?rej(e):res(r)}) }))
const str = v => v==null ? '' : Buffer.isBuffer(v) ? v.toString('latin1').replace(/\x00/g,'').trim() : String(v).replace(/\x00/g,'').trim()
const brl = n => Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
const PRES = Object.fromEntries((await fb('select PRE_CODIGO, PRE_NOME from PRESTADORES')).map(p=>[str(p.PRE_CODIGO), str(p.PRE_NOME)]))
// 1. o telefone no cadastro
const ccols = (await fb("select RDB$FIELD_NAME as F from RDB$RELATION_FIELDS where RDB$RELATION_NAME='CLIENTES' order by RDB$FIELD_POSITION")).map(c=>str(c.F))
const tel = ccols.filter(c=>/TEL|CEL|FONE|WHATS/i.test(c)); console.log('colunas de telefone em CLIENTES:', tel.join(', '))
for (const c of tel) { const r = await fb(`select CLI_CODIGO, CLI_NOME, CLI_UF, ${c} from CLIENTES where ${c} like '%8825%0047%' or ${c} like '%88250047%'`); for (const x of r) console.log('  CLIENTE', str(x.CLI_CODIGO), str(x.CLI_NOME), str(x.CLI_UF), c, str(x[c])) }
// 2. o leilão de 21/08 (FIL 2) e todos os leilões de ago com vendedor de DDD 38 / MG
const leis = await fb("select FIL_CODIGO, LEI_CODIGO, LEI_NOME, LEI_DATA from LEILAO where LEI_DATA between '2026-08-15' and '2026-09-10' and FIL_CODIGO='2' order by LEI_DATA")
for (const l of leis) console.log('LEILAO', str(l.LEI_CODIGO), '|', str(l.LEI_NOME), '|', String(l.LEI_DATA).slice(0,10))
const dump = []
for (const l of leis) {
  const lei = str(l.LEI_CODIGO)
  const lotes = await fb('select LOT_LOTE, LOT_QTD, LOT_LANCE, LOT_TOTAL, LOT_PISTEIRO from LOTES where FIL_CODIGO=? and LEI_CODIGO=? order by LOT_ORDEM', ['2', lei])
  if (!lotes.length) continue
  const vends = await fb('select v.LOT_LOTE, v.VEN_PORCENTAGEM, cl.CLI_CODIGO, cl.CLI_NOME, cl.CLI_UF, f.FAZ_NOME from VENDEDORES v left join CLIENTES cl on cl.CLI_CODIGO=v.CLI_CODIGO left join FAZENDAS f on f.FAZ_CODIGO=v.FAZ_CODIGO and f.CLI_CODIGO=v.CLI_CODIGO where v.FIL_CODIGO=? and v.LEI_CODIGO=?', ['2', lei])
  const comps = await fb('select c.LOT_LOTE, c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_UF, f.FAZ_NOME from COMPRADORES c left join CLIENTES cl on cl.CLI_CODIGO=c.CLI_CODIGO left join FAZENDAS f on f.FAZ_CODIGO=c.FAZ_CODIGO and f.CLI_CODIGO=c.CLI_CODIGO where c.FIL_CODIGO=? and c.LEI_CODIGO=?', ['2', lei])
  const vmap = {}; for (const v of vends) (vmap[str(v.LOT_LOTE)] ||= []).push(v)
  const cmap = {}; for (const c of comps) (cmap[str(c.LOT_LOTE)] ||= []).push(c)
  console.log('\n###', String(l.LEI_DATA).slice(0,10), str(l.LEI_NOME), '—', lotes.length, 'lotes')
  for (const x of lotes) {
    const k = str(x.LOT_LOTE); const pist = str(x.LOT_PISTEIRO)
    const vend = (vmap[k]||[]).map(v=>[str(v.CLI_NOME), str(v.FAZ_NOME), str(v.CLI_UF), v.VEN_PORCENTAGEM!=null&&Number(v.VEN_PORCENTAGEM)!==100?`(${v.VEN_PORCENTAGEM}%)`:''].filter(Boolean).join(' · ')).join(' + ')
    const comp = (cmap[k]||[]).map(c=>[str(c.CLI_NOME), str(c.FAZ_NOME), str(c.CLI_UF)].filter(Boolean).join(' · ')).join(' + ')
    console.log('   lt', k.padEnd(5), 'qtd', Number(x.LOT_QTD||1), 'lance', brl(x.LOT_LANCE).padStart(9), 'total', brl(x.LOT_TOTAL).padStart(11), '| pist', (PRES[pist]||pist||'—').padEnd(28), '| VEND', vend, '| comp', comp)
    dump.push({ data: String(l.LEI_DATA).slice(0,10), lei, leilao: str(l.LEI_NOME), lote: k, qtd: Number(x.LOT_QTD||1), lance: Number(x.LOT_LANCE||0), total: Number(x.LOT_TOTAL||0), pisteiro: PRES[pist]||pist||null, vendedor: vend, vend_cod: (vmap[k]||[]).map(v=>str(v.CLI_CODIGO)).join('+'), comprador: comp })
  }
}
fs.mkdirSync('outputs/noite-nacional-2026-09', { recursive: true })
fs.writeFileSync('outputs/noite-nacional-2026-09/hp-lotes-ago-fil2.json', JSON.stringify(dump, null, 2))
