// Disparo EAO Baviera para leads do Instagram (planilha após 21h07 de 10/07) que
// JÁ TRABALHAM com pecuária (exclui "Não trabalho, quero aprender").
// Template aprovado bula_convite_evento_ofertas (header imagem + 5 vars).
// Importa cada lead no CRM (ENTRADA) e registra o envio. Dedup por telefone.
//   node scripts/disparo-instagram-eao-trabalham-2026-07-10.mjs           # dry-run
//   node scripts/disparo-instagram-eao-trabalham-2026-07-10.mjs --send    # envia
import xlsx from 'xlsx'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync('.env.local','utf-8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const SEND = process.argv.includes('--send')
const GRAPH=(env.WHATSAPP_CLOUD_GRAPH_VERSION||'v25.0').replace(/^v?/,'v')
const PHONE_ID=env.WHATSAPP_CLOUD_PHONE_NUMBER_ID, TOKEN=env.WHATSAPP_CLOUD_ACCESS_TOKEN
const LANG=env.WHATSAPP_CLOUD_TEMPLATE_LANGUAGE||'pt_BR'
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ORIGIN='instagram-eao-trabalham:2026-07-10'
const ARTE='disparos/eao-2026-07/1783697745418-capa_evento.jpeg'
const TEMPLATE='bula_convite_evento_ofertas'
const EVENT=['13º Mega Evento EAO Baviera','de 09 a 12 de Julho','Sêmen, Aspirações, 350 Fêmeas PO e 500 Touros PO','40x']

const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
const naoTrab=m=>/nao trabalho|quero aprender/.test(norm(m))
const first=n=>String(n||'').trim().split(/\s+/)[0]||'produtor(a)'
function fone(v){let d=String(v).replace(/\D/g,'');if(d.startsWith('55')&&d.length>11)d=d.slice(2);if(d.length===10||d.length===11)return '55'+d;return null}
const foneOk=f=>/^55\d{2}9\d{8}$/.test(String(f||''))
const UF={PARA:'PA'}; const uf=s=>{const u=String(s||'').trim().toUpperCase();if(u.length===2)return u;return UF[u]||''}
const render=(nome)=>`Olá, ${nome}!\n\nPrazer, João Antônio da Bula Assessoria aqui. 🤠\n\nPassando para te convidar para o *${EVENT[0]}*, que acontecerá ${EVENT[1]}!\n\nOfertas de: ${EVENT[2]}.\n\nEm até *${EVENT[3]} no boleto* e *frete grátis* para todo o Brasil! 🇧🇷\n\nBora bater um papo?`

const wb=xlsx.readFile('F:/Bula_Assessoria_Leads_Instagram_apos_21h07_2026-07-10.xlsx')
const objs=xlsx.utils.sheet_to_json(wb.Sheets['Leads'],{defval:''})
let alvos=objs.filter(o=>!naoTrab(o['Momento na pecuaria'])).map(o=>({
  nome:String(o['Nome completo']||'').trim(), fone:fone(o['Telefone']), estado:uf(o['Estado']),
  momento:String(o['Momento na pecuaria']||'').trim(), cabecas:String(o['Cabecas']||'').trim(),
  ie:/sim/i.test(String(o['Inscricao estadual']||''))?'Sim':'Não', interesse:String(o['Interesse']||'').trim(),
  email:String(o['Email']||'').trim(),
})).filter(a=>a.nome && foneOk(a.fone))

// dedup: já contatado por WhatsApp (evita duplicar se já entrou por outra via)
const fones=alvos.map(a=>a.fone)
const {data:msgs}=await sb.from('whatsapp_messages').select('phone').in('phone',fones)
const jaContatado=new Set((msgs||[]).map(m=>String(m.phone).replace(/\D/g,'')))
const antes=alvos.length
alvos=alvos.filter(a=>!jaContatado.has(a.fone))
console.log(`Alvos: ${antes} já-trabalham válidos · ${antes-alvos.length} já contatados (pulados) · ${alvos.length} a enviar`)
alvos.forEach((a,i)=>console.log(`  ${i+1}. ${a.nome.padEnd(26)} ${a.fone} ${a.estado} · ${a.interesse} · ${a.cabecas}`))

if(!SEND){ console.log('\n[DRY-RUN] nada enviado. rode com --send para disparar.'); process.exit(0) }
if(!PHONE_ID||!TOKEN){ console.log('faltam credenciais Cloud'); process.exit(1) }

// arte → URL assinada (7 dias)
const {data:signed}=await sb.storage.from('whatsapp-media').createSignedUrl(ARTE, 7*86400)
if(!signed?.signedUrl){ console.log('falha ao assinar a arte'); process.exit(1) }

async function upsertLead(a){
  const digits=a.fone
  const {data:ex}=await sb.from('crm_leads').select('id').or(`celular.eq.${digits},telefone.eq.${digits}`).limit(1)
  if(ex&&ex[0]) return ex[0].id
  const {data:ins,error}=await sb.from('crm_leads').insert({
    nome:a.nome, celular:digits, email:a.email||null, estado:a.estado||null,
    momento_pecuaria:a.momento||null, quantidade_animais:a.cabecas||null, tem_inscricao_estadual:a.ie,
    interesse_principal:a.interesse||null, o_que_busca:a.interesse||null,
    source:'instagram-direct', origem:'Instagram Direct (após 21h07 10/07)', status:'ENTRADA',
    data_entrada:new Date().toISOString(), last_whatsapp_at:new Date().toISOString(),
  }).select('id').single()
  if(error){ console.log(`   ⚠ upsert lead falhou (${a.nome}): ${error.message}`); return null }
  return ins.id
}

console.log(`\n=== ENVIANDO ${alvos.length} (template ${TEMPLATE}, throttle 2s) ===`)
let sent=0, fail=0
for(let i=0;i<alvos.length;i++){
  const a=alvos[i], nome=first(a.nome)
  const leadId=await upsertLead(a)
  const payload={messaging_product:'whatsapp',recipient_type:'individual',to:a.fone,type:'template',
    template:{name:TEMPLATE,language:{code:LANG},components:[
      {type:'header',parameters:[{type:'image',image:{link:signed.signedUrl}}]},
      {type:'body',parameters:[nome,...EVENT].map(t=>({type:'text',text:t}))},
    ]}}
  let status='failed',msgId=null,err=null
  try{
    const res=await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`,{method:'POST',
      headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)})
    const j=await res.json().catch(()=>null)
    if(res.ok){status='sent';msgId=j?.messages?.[0]?.id||null}
    else err=j?.error?.message?`${j.error.message} (code ${j.error.code})`:`HTTP ${res.status}`
  }catch(e){err=e?.message||'fetch_error'}
  await sb.from('whatsapp_messages').insert({phone:a.fone,name:a.nome,body:render(nome),direction:'outbound',
    status,channel:'cloud',intent:'campaign',origin:ORIGIN,bot_step:'convite',lead_id:leadId,
    media_url:ARTE,media_type:'image',media_mime:'image/jpeg',media_filename:'capa_evento.jpeg',
    reason:msgId??(status==='failed'?'send_failed':null),error_msg:err})
  if(status==='sent'){sent++; if(leadId) await sb.from('crm_leads').update({last_whatsapp_at:new Date().toISOString()}).eq('id',leadId); console.log(`  ✓ ${a.fone} ${nome}`)}
  else{fail++; console.log(`  ✗ ${a.fone} ${nome}: ${err}`)}
  if(i<alvos.length-1) await new Promise(r=>setTimeout(r,2000))
}
console.log(`\n=== FIM === enviados ${sent} · falhas ${fail}`)
