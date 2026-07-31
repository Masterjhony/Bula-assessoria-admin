/**
 * Preenche buracos das 5 abas da planilha de leads com dado que JÁ existe em
 * outro lugar — nunca inventa:
 *  · Cidade e E-mail: casados por telefone com o crm_leads (o formulário do
 *    Meta não pergunta cidade, então 1.5k leads nasceram sem ela);
 *  · Origem: troca o nome interno da aba antiga ("Página9") por um rótulo que
 *    a equipe entende.
 * Cidade só entra se parecer nome de lugar (o CRM tem lixo tipo "MT|SP").
 *
 * Uso:  node scripts/enriquece-planilha-leads.mjs           (simulação)
 *       node scripts/enriquece-planilha-leads.mjs --apply
 */
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'
const APPLY=process.argv.includes('--apply')
const env=Object.fromEntries(readFileSync('.env.local','utf-8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('='))
 .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const db=new pg.Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
await db.connect()
const {rows:cfg}=await db.query("select value from jmp_config where key='sheets'")
const spreadsheetId=cfg[0].value.spreadsheetId
const creds=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth=new google.auth.JWT({email:creds.client_email,key:creds.private_key.replace(/\n/g,'\n'),scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const S=v=>String(v??'').trim()
const nuc=s=>{const d=S(s).replace(/\D+/g,'').replace(/^55/,'');return d.length>=8?d.slice(-8):''}
const colName=i=>{let n=i+1,s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
// cidade válida: nome de lugar, não sigla nem lista de UF nem número
const cidadeOk=c=>{const x=S(c);return x.length>=3 && !/^[A-Z]{2}$/.test(x) && !/\|/.test(x) && !/^\d+$/.test(x) && !/@/.test(x)}
const {rows:crm}=await db.query("select telefone, cidade, email from crm_leads where telefone is not null")
const cidadePorTel=new Map(), mailPorTel=new Map()
for(const r of crm){
  const k=nuc(r.telefone); if(!k) continue
  if(cidadeOk(r.cidade)&&!cidadePorTel.has(k)) cidadePorTel.set(k,S(r.cidade))
  if(S(r.email)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S(r.email))&&!mailPorTel.has(k)) mailPorTel.set(k,S(r.email))
}
await db.end()
console.log(`CRM: ${cidadePorTel.size} telefones com cidade, ${mailPorTel.size} com e-mail`)

const meta=await sheets.spreadsheets.get({spreadsheetId,includeGridData:false})
let totCid=0, totMail=0, totOrigem=0
for(const tab of meta.data.sheets.map(s=>s.properties.title)){
  const v=(await sheets.spreadsheets.values.get({spreadsheetId,range:`'${tab}'!A1:AE20000`})).data.values??[]
  if(v.length<2) continue
  const h=v[0].map(S); const ix=n=>h.findIndex(x=>x.toLowerCase()===n.toLowerCase())
  const iT=ix('WhatsApp'), iC=ix('Cidade'), iM=ix('E-mail'), iO=ix('Origem')
  const linhas=v.slice(1).map(r=>[...r])
  let cid=0, mail=0, org=0
  for(const r of linhas){
    while(r.length<h.length) r.push('')
    const k=nuc(r[iT])
    if(iC>=0&&!S(r[iC])&&k&&cidadePorTel.has(k)){ r[iC]=cidadePorTel.get(k); cid++ }
    if(iM>=0&&!S(r[iM])&&k&&mailPorTel.has(k)){ r[iM]=mailPorTel.get(k); mail++ }
    if(iO>=0&&/Página9/i.test(S(r[iO]))){ r[iO]='Lista antiga de fazendas (sem data)'; org++ }
    if(iO>=0&&/Página4/i.test(S(r[iO]))){ r[iO]='Lista antiga de touros (sem data)'; org++ }
  }
  console.log(`${tab}: +${cid} cidade, +${mail} e-mail, ${org} origem renomeada`)
  totCid+=cid; totMail+=mail; totOrigem+=org
  if(APPLY&&(cid||mail||org)){
    for(const i of [iC,iM,iO].filter(x=>x>=0)){
      await sheets.spreadsheets.values.update({spreadsheetId,range:`'${tab}'!${colName(i)}2:${colName(i)}${linhas.length+1}`,
        valueInputOption:'RAW',requestBody:{values:linhas.map(r=>[r[i]??''])}})
    }
  }
}
console.log(`\nTOTAL: ${totCid} cidades, ${totMail} e-mails, ${totOrigem} origens`)
if(!APPLY) console.log('SIMULAÇÃO — rode com --apply')
