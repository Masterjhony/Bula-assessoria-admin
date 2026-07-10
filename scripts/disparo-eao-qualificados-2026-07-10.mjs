/**
 * Disparo EAO Baviera (12/07) — 30 leads BEM QUALIFICADOS sem interação recente.
 *
 * Objetivo: converter para o Mega Evento EAO Baviera quem já demonstrou ser
 * comprador de verdade (I.E., rebanho, MQL, cadastro aprovado, conversa
 * avançada) mas esfriou. Lista CURTA de propósito: o tier é de 250 conversas
 * iniciadas/dia e as campanhas continuam trazendo gente pra atender.
 *
 * Template POR INTERESSE (os 3 aprovados do evento, com mídia no header):
 *   • fala em touro                → bula_padrao_lote_video      (vídeo tourama)
 *   • fala em matriz/fêmea/bezerra → bula_padrao_genetico_video  (vídeo matrizes)
 *   • resto                        → bula_convite_evento_ofertas (arte agenda)
 *
 * "Sem interação recente" = nenhuma mensagem (ida ou volta) nas últimas 72h e
 * nenhum outro disparo nos últimos 7 dias. Quem está em atendimento humano
 * (handoff), opt-out ou arquivado fica fora.
 *
 * Mídia dos headers (obrigatória no envio, dispensada no dry-run):
 *   --img-convite <arquivo|url>  --video-tourama <arquivo|url>  --video-matrizes <arquivo|url>
 * Arquivo local é subido ao bucket whatsapp-media (disparos/) e vira URL assinada.
 * Vídeo: MP4 até 16MB (limite do WhatsApp).
 *
 *   node scripts/disparo-eao-qualificados-2026-07-10.mjs                # dry-run: mostra a lista de 30
 *   node scripts/disparo-eao-qualificados-2026-07-10.mjs --alvo 30 --send \
 *        --img-convite arte.jpg --video-tourama tourama.mp4 --video-matrizes matrizes.mp4
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const args = process.argv.slice(2)
const SEND = args.includes('--send')
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const ALVO = Number(argVal('--alvo') || 30)

const GRAPH = (process.env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v25.0').replace(/^v?/, 'v')
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ORIGIN = 'eao-baviera-qualificados:2026-07-10'
const THROTTLE_MS = 2000
const QUIET_HOURS = 72          // sem mensagem em nenhuma direção há pelo menos isto
const DEDUP_DISPARO_DIAS = 7    // não empilhar com outro disparo recente

/**
 * Conteúdo dos 3 templates (variáveis fixadas para o EAO Baviera 12/07).
 * `render` reproduz o corpo REAL que o lead recebe — é o que vai pro log em
 * whatsapp_messages, para o cockpit mostrar a mensagem de verdade (e não um
 * placeholder técnico).
 */
const TEMPLATES = {
    touros: {
        name: 'bula_padrao_lote_video', header: 'video', mediaArg: '--video-tourama',
        params: nome => [nome, 'tourama EAO', 'no próximo domingo, 12/07',
            'repor seus reprodutores e produzir os melhores bezerros da sua região'],
        render: p => `Fala, ${p[0]}! Olha eu aqui mais uma vez… 😁\n\nPassando para te mostrar o padrão de ${p[1]} que estará disponível ${p[2]}.\n\nBora mexer! Aproveite a oportunidade para ${p[3]}. 🤩`,
    },
    matrizes: {
        name: 'bula_padrao_genetico_video', header: 'video', mediaArg: '--video-matrizes',
        params: nome => [nome, 'matrizes', 'Mega Evento EAO - Baviera', '40x'],
        render: p => `Opa, ${p[0]}! João da Bula aqui mais uma vez… 😍\n\nOlha o padrão de ${p[1]} que estará disponível no *${p[2]}*!\n\nChegou a hora de você elevar o padrão genético do seu rebanho 🔥\n\nEm até *${p[3]} no boleto* e *frete grátis*!`,
    },
    convite: {
        name: 'bula_convite_evento_ofertas', header: 'image', mediaArg: '--img-convite',
        params: nome => [nome, '13º Mega Evento EAO Baviera', 'de 09 a 12 de Julho',
            'Sêmen, Aspirações, 350 Fêmeas PO e 500 Touros PO', '40x'],
        render: p => `Olá, ${p[0]}!\n\nPrazer, João Antônio da Bula Assessoria aqui. 🤠\n\nPassando para te convidar para o *${p[1]}*, que acontecerá ${p[2]}!\n\nOfertas de: ${p[3]}.\n\nEm até *${p[4]} no boleto* e *frete grátis* para todo o Brasil! 🇧🇷\n\nBora bater um papo?`,
    },
}

/* ── helpers ──────────────────────────────────────────────────────────────── */
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
const firstName = full => (full ? String(full).trim().split(/\s+/)[0] : '')
function normalizePhone(input) {
    let c = String(input ?? '').replace(/\D/g, '')
    if (!c) return null
    if (!(c.startsWith('55') && c.length >= 12) && (c.length === 10 || c.length === 11)) c = `55${c}`
    return c.length >= 12 && c.length <= 13 ? c : null
}
const celularValido = f => /^55\d{2}9\d{8}$/.test(String(f))
const EMPRESA = /\b(LTDA|S\.?A\.?|EIRELI|EPP|COMERCIO|COMÉRCIO|AGROPECUARIA|AGROPECUÁRIA|GENETICS|LEIL(Õ|O)ES|IMOBILIARIA|TRANSPORT|BANCO)\b/i
const ETAPAS = new Set(['ENTRADA', 'CONEXAO', 'QUALIFICACAO', 'INFO CAPTADAS', 'INFORMACOES CAPTADAS', 'CADASTRO'])

function parseRebanho(v) {
    const m = String(v ?? '').match(/\d+/g)
    if (!m) return 0
    return Math.max(...m.map(Number))
}

/** Interesse → qual template converte melhor este lead. */
function escolherTemplate(lead) {
    const txt = norm(`${lead.o_que_busca ?? ''} ${lead.interesse_principal ?? ''} ${(lead.extra_data?.objetivo_compra_resumido ?? '')} ${(lead.extra_data?.rebanho_atual ?? '')}`)
    if (/MATRIZ|FEMEA|BEZERRA|NOVILHA|VENTRE|ASPIRACA/.test(txt)) return 'matrizes'
    if (/TOURO|REPRODUTOR|TOURAMA/.test(txt)) return 'touros'
    return 'convite'
}

/** Pontuação de "bem qualificado". */
function score(lead, conversouAlguma) {
    let s = 0; const por = []
    const xd = lead.extra_data ?? {}
    if (xd.cadastro_aprovado || xd.cadastro_status === 'aprovado') { s += 6; por.push('cadastro APROVADO') }
    if (lead.is_mql) { s += 4; por.push('MQL') }
    if (String(lead.inscricao_estadual ?? '').trim() || norm(lead.tem_inscricao_estadual) === 'SIM') { s += 3; por.push('I.E.') }
    if (String(lead.cpf ?? '').replace(/\D/g, '').length === 11) { s += 2; por.push('CPF') }
    const reb = parseRebanho(lead.quantidade_animais)
    if (reb >= 100) { s += 3; por.push(`${reb} cab`) }
    else if (reb >= 50) { s += 2; por.push(`${reb} cab`) }
    else if (reb >= 20) { s += 1; por.push(`${reb} cab`) }
    const etapa = norm(lead.status)
    if (etapa === 'INFO CAPTADAS' || etapa === 'INFORMACOES CAPTADAS' || etapa === 'CADASTRO') { s += 2; por.push(etapa.toLowerCase()) }
    else if (etapa === 'QUALIFICACAO') { s += 1; por.push('qualificação') }
    if (conversouAlguma) { s += 2; por.push('já conversou') }
    const cred = Number((xd.credito ?? {}).score)
    if (cred >= 600) { s += 1; por.push(`score ${cred}`) }
    return { s, por }
}

/* ── mídia dos headers ────────────────────────────────────────────────────── */
/**
 * Devolve { link, path, mime, filename }: `link` (URL assinada) vai no header do
 * template pra Meta baixar; `path` (caminho no bucket) vai no LOG da mensagem —
 * é assim que o cockpit renderiza a mídia igualzinha ao que o lead recebeu (o
 * thread API assina o path na hora de exibir).
 */
async function resolverMidia(arg, tipo) {
    const v = argVal(arg)
    if (!v) return null
    if (/^https?:\/\//i.test(v)) return { link: v, path: null, mime: null, filename: null }
    const buf = fs.readFileSync(v)
    const maxMb = tipo === 'video' ? 16 : 5
    if (buf.length > maxMb * 1024 * 1024) throw new Error(`${v}: ${(buf.length / 1048576).toFixed(1)}MB excede o limite de ${maxMb}MB do WhatsApp`)
    const dest = `disparos/eao-2026-07/${Date.now()}-${path.basename(v).replace(/[^\w.\-]/g, '_')}`
    const mime = tipo === 'video' ? 'video/mp4' : (v.match(/\.png$/i) ? 'image/png' : 'image/jpeg')
    const { error } = await supabase.storage.from('whatsapp-media').upload(dest, buf, { contentType: mime, upsert: true })
    if (error) throw new Error(`upload ${v}: ${error.message}`)
    const { data } = await supabase.storage.from('whatsapp-media').createSignedUrl(dest, 7 * 86400)
    if (!data?.signedUrl) throw new Error(`URL assinada falhou para ${dest}`)
    return { link: data.signedUrl, path: dest, mime, filename: path.basename(v) }
}

/* ── main ─────────────────────────────────────────────────────────────────── */
async function main() {
    console.log(`Disparo EAO qualificados · alvo=${ALVO} · ${SEND ? '🚨 ENVIO REAL' : 'DRY-RUN'}\n`)

    // Quem interagiu recentemente (qualquer direção) fica FORA; quem já recebeu
    // disparo nos últimos 7 dias também. Uma passada em whatsapp_messages resolve.
    const desde7d = new Date(Date.now() - DEDUP_DISPARO_DIAS * 86400000).toISOString()
    const desdeQuiet = new Date(Date.now() - QUIET_HOURS * 3600000).toISOString()
    const recentes = new Set()       // phones com msg nas últimas 72h
    const disparados = new Set()     // phones com campaign/bot nos últimos 7d
    const conversaram = new Set()    // lead_ids com inbound em qualquer época
    for (let off = 0; off < 60000; off += 1000) {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('phone, lead_id, direction, intent, created_at')
            .order('created_at', { ascending: false })
            .range(off, off + 999)
        if (error) throw new Error(error.message)
        for (const m of data ?? []) {
            const p = normalizePhone(m.phone)
            if (m.direction === 'inbound' && m.lead_id) conversaram.add(m.lead_id)
            if (p && m.created_at >= desdeQuiet) recentes.add(p)
            if (p && m.created_at >= desde7d && ['campaign', 'bot'].includes(String(m.intent))) disparados.add(p)
        }
        if (!data || data.length < 1000) break
        // as janelas de exclusão são recentes; depois de 7 dias de histórico só o
        // `conversaram` importa — continua varrendo, é barato (uma coluna).
    }
    console.log(`exclusões: ${recentes.size} tel. com msg <${QUIET_HOURS}h · ${disparados.size} tel. com disparo <${DEDUP_DISPARO_DIAS}d · ${conversaram.size} leads que já escreveram\n`)

    // Leads ativos
    const leads = []
    for (let off = 0; ; off += 1000) {
        const { data, error } = await supabase
            .from('crm_leads')
            .select('id, nome, telefone, celular, cpf, status, estado, is_mql, optout_whatsapp, arquivado, handoff_humano, inscricao_estadual, tem_inscricao_estadual, quantidade_animais, o_que_busca, interesse_principal, extra_data, updated_at')
            .eq('arquivado', false)
            .range(off, off + 999)
        if (error) throw new Error(error.message)
        leads.push(...(data ?? []))
        if (!data || data.length < 1000) break
    }

    const vistos = new Set()
    const cand = []
    for (const l of leads) {
        if (l.optout_whatsapp || l.handoff_humano) continue
        if (!ETAPAS.has(norm(l.status))) continue
        if (EMPRESA.test(l.nome ?? '')) continue
        // O template abre com "Olá, {{1}}!" — nome vazio, e-mail no lugar do
        // nome ou "Fazenda X" quebram a saudação. Fora da lista.
        const nome = String(l.nome ?? '').trim()
        if (nome.length < 2 || nome.includes('@') || /^fazenda\b/i.test(nome)) continue
        const fone = normalizePhone(l.celular || l.telefone)
        if (!fone || !celularValido(fone) || vistos.has(fone)) continue
        if (recentes.has(fone) || disparados.has(fone)) continue
        const { s, por } = score(l, conversaram.has(l.id))
        if (s < 3) continue // corta o frio sem sinal nenhum — qualidade > volume
        vistos.add(fone)
        cand.push({ ...l, fone, score: s, por, template: escolherTemplate(l) })
    }
    cand.sort((a, b) => b.score - a.score || String(b.updated_at).localeCompare(String(a.updated_at)))
    const audience = cand.slice(0, ALVO)

    const porTemplate = {}
    for (const a of audience) porTemplate[a.template] = (porTemplate[a.template] ?? 0) + 1
    console.log(`candidatos qualificados: ${cand.length} → lista final: ${audience.length}  ${JSON.stringify(porTemplate)}\n`)
    audience.forEach((a, i) => console.log(
        `${String(i + 1).padStart(2)}. [${String(a.score).padStart(2)}] ${(a.nome ?? '').slice(0, 30).padEnd(30)} ${a.fone} · ${a.template.padEnd(8)} · ${a.por.join(', ')}`,
    ))

    if (!SEND) {
        console.log('\n[DRY-RUN] Nada enviado. Para disparar, rode com --send e as 3 mídias:')
        console.log('  --img-convite <arte.jpg> --video-tourama <t.mp4> --video-matrizes <m.mp4>')
        return
    }

    if (!PHONE_ID || !TOKEN) throw new Error('faltam credenciais Cloud API')
    // Resolve as mídias exigidas pelos templates presentes na lista
    const media = {}
    for (const [key, t] of Object.entries(TEMPLATES)) {
        if (!porTemplate[key]) continue
        const m = await resolverMidia(t.mediaArg, t.header)
        if (!m) throw new Error(`lista tem ${porTemplate[key]} envio(s) de "${key}" mas falta ${t.mediaArg}`)
        media[key] = m
    }

    console.log(`\n=== ENVIANDO ${audience.length} (throttle ${THROTTLE_MS}ms) ===`)
    let sent = 0, failed = 0
    for (let i = 0; i < audience.length; i++) {
        const a = audience[i]
        const t = TEMPLATES[a.template]
        const fname = firstName(a.nome) || 'produtor(a)'
        const params = t.params(fname)
        const payload = {
            messaging_product: 'whatsapp', recipient_type: 'individual', to: a.fone, type: 'template',
            template: {
                name: t.name, language: { code: 'pt_BR' },
                components: [
                    { type: 'header', parameters: [{ type: t.header, [t.header]: { link: media[a.template].link } }] },
                    { type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) },
                ],
            },
        }
        let status = 'failed', messageId = null, errMsg = null
        try {
            const res = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, {
                method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
            })
            const json = await res.json().catch(() => null)
            if (res.ok) { status = 'sent'; messageId = json?.messages?.[0]?.id ?? null }
            else errMsg = json?.error?.message ? `${json.error.message} (code ${json.error.code})` : `HTTP ${res.status}`
        } catch (e) { errMsg = e?.message || 'fetch_error' }

        await supabase.from('whatsapp_messages').insert({
            phone: a.fone, name: a.nome || 'Contato', body: t.render(params),
            direction: 'outbound', status, channel: 'cloud', intent: 'campaign',
            origin: ORIGIN, bot_step: a.template, lead_id: a.id,
            // path no bucket (não URL): o cockpit assina na hora e mostra a
            // mídia exatamente como o lead recebeu.
            media_url: media[a.template].path, media_type: t.header,
            media_mime: media[a.template].mime, media_filename: media[a.template].filename,
            reason: messageId ?? (status === 'failed' ? 'send_failed' : null), error_msg: errMsg,
        })
        if (status === 'sent') {
            sent++
            await supabase.from('crm_leads').update({ last_whatsapp_at: new Date().toISOString() }).eq('id', a.id)
            console.log(`  ✓ ${a.fone} ${fname} (${a.template})`)
        } else { failed++; console.log(`  ✗ ${a.fone} ${fname}: ${errMsg}`) }
        if (i < audience.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS))
    }
    console.log(`\n=== FIM === enviados ${sent} · falhas ${failed}`)
}

main().catch(e => { console.error(e); process.exit(1) })
