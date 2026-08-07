// PONTE DEV do agente WhatsApp — roda NO PC do João (nunca no servidor).
//
// Faz polling da fila `agente_dev_tarefas` (Supabase) e executa cada tarefa
// com a CLI local correspondente, usando as assinaturas locais (Claude
// Pro/Max e Codex Pro — OAuth só vale na máquina, por isso a bridge existe):
//   runner 'claude' → Claude Code headless no repo (alterar sistema, relatórios)
//   runner 'codex'  → Codex exec (monitoramentos, pesquisas, tarefas avulsas)
// Ao terminar: grava o resultado na fila, manda resumo no WhatsApp do
// solicitante pelo número operacional e envia como documento qualquer arquivo
// listado como "ARQUIVO: <caminho>" no fim da resposta da CLI.
//
// Uso: node scripts/agente-dev-bridge.mjs   (o Startup do Windows chama isso;
// trava de instância única via porta local 47821)
import { readFileSync, existsSync, statSync, mkdirSync, cpSync, rmSync, rmdirSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execSync } from 'node:child_process'
import { createServer } from 'node:net'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK_PORT = 47821
const POLL_MS = 20_000
const TIMEOUT_MS = { claude: 30 * 60_000, codex: 20 * 60_000 }
const OUTPUT_CAP = 400_000

const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ------------------------- instância única -------------------------
await new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', () => {
        console.error('Bridge já está rodando (porta ocupada). Saindo.')
        process.exit(0)
    })
    srv.listen(LOCK_PORT, '127.0.0.1', () => resolve(srv))
    srv.once('close', reject)
})

// ------------------------- WhatsApp (VPS) -------------------------
let sessaoOperacional = 'operacional'
try {
    const { data } = await sb.from('site_settings').select('value').eq('key', 'whatsapp_agente').maybeSingle()
    if (data?.value?.session) sessaoOperacional = data.value.session
} catch { /* usa default */ }

async function enviarWhats(phone, message, media) {
    if (!phone) return
    try {
        const url = `${env.WHATSAPP_SERVER_URL}/send-direct?session=${encodeURIComponent(sessaoOperacional)}`
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-vps-token': env.WHATSAPP_SERVER_TOKEN || '' },
            body: JSON.stringify({ phone, message, ...(media ? { media } : {}) }),
            signal: AbortSignal.timeout(25_000),
        })
        if (!res.ok) log('envio WhatsApp falhou:', res.status, (await res.text().catch(() => '')).slice(0, 120))
    } catch (e) {
        log('envio WhatsApp falhou:', e.message)
    }
}

async function enviarArquivo(phone, caminho) {
    try {
        if (!existsSync(caminho) || !statSync(caminho).isFile()) return
        const nome = basename(caminho)
        const buf = readFileSync(caminho)
        if (buf.length > 45 * 1024 * 1024) { log('arquivo grande demais:', nome); return }
        const path = `agente-dev/${Date.now()}-${nome}`
        const up = await sb.storage.from('whatsapp-media').upload(path, buf)
        if (up.error) { log('upload falhou:', up.error.message); return }
        const signed = await sb.storage.from('whatsapp-media').createSignedUrl(path, 6 * 3600)
        if (!signed.data?.signedUrl) return
        await enviarWhats(phone, `📄 ${nome}`, { type: 'document', url: signed.data.signedUrl, fileName: nome })
        log('arquivo enviado:', nome)
    } catch (e) {
        log('envio de arquivo falhou:', e.message)
    }
}

// ------------------------- worktree isolada (runner claude) -------------------------
// Cada tarefa de código roda numa WORKTREE própria baseada na origin/main mais
// recente — nunca em cima do repo de trabalho. Assim, tarefa simultânea a
// alguém mexendo no repo (ou a outra tarefa recém-pushada) não baguncca nada:
// a tarefa parte de um estado limpo, commita só o que é dela e faz push com
// rebase. node_modules entra por junction (link), .env.local é copiado.
const WORKTREES_DIR = join(dirname(ROOT), 'web-bula-tarefas')

function prepararWorktree(id) {
    const short = id.slice(0, 8)
    const dir = join(WORKTREES_DIR, short)
    mkdirSync(WORKTREES_DIR, { recursive: true })
    execSync('git fetch origin main', { cwd: ROOT, stdio: 'pipe' })
    execSync(`git worktree add -b tarefa/${short} "${dir}" origin/main`, { cwd: ROOT, stdio: 'pipe' })
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction')
    cpSync(join(ROOT, '.env.local'), join(dir, '.env.local'))
    mkdirSync(join(dir, 'outputs'), { recursive: true })
    return dir
}

function limparWorktree(id) {
    const short = id.slice(0, 8)
    const dir = join(WORKTREES_DIR, short)
    // remove a JUNCTION antes de qualquer remoção recursiva — apagar através
    // dela destruiria o node_modules REAL do repo.
    try { rmdirSync(join(dir, 'node_modules')) } catch { /* já foi */ }
    try {
        execSync(`git worktree remove --force "${dir}"`, { cwd: ROOT, stdio: 'pipe' })
    } catch {
        try { rmSync(dir, { recursive: true, force: true }) } catch { /* melhor esforço */ }
        try { execSync('git worktree prune', { cwd: ROOT, stdio: 'pipe' }) } catch { /* idem */ }
    }
    try { execSync(`git branch -D tarefa/${short}`, { cwd: ROOT, stdio: 'pipe' }) } catch { /* branch já foi */ }
}

// ------------------------- execução das CLIs -------------------------
function montarPrompt(tarefa, workdir) {
    const rodape = `

---
Instruções fixas da ponte (obrigatórias):
- Responda em português do Brasil. Termine com um RESUMO curto (3-6 linhas) do que foi feito, escrito para o WhatsApp de quem pediu.
- Se gerar arquivo para o solicitante (relatório, planilha, PDF...), salve em ${join(workdir, 'outputs')} e liste no FINAL da resposta uma linha por arquivo no formato exato: ARQUIVO: <caminho absoluto>`
    if (tarefa.runner === 'claude') {
        return `Tarefa pedida por ${tarefa.solicitante || 'admin'} via WhatsApp (agente interno da Bula):

${tarefa.descricao}

Você está numa WORKTREE ISOLADA do repositório web-bula (sistema da Bula Assessoria), criada agora a partir da origin/main mais recente — o repo principal não é seu; trabalhe SÓ neste diretório. Se a tarefa alterar código: valide com \`npx tsc --noEmit\` (e build se fizer sentido), commite SÓ os arquivos da tarefa e publique com \`git pull --rebase origin main && git push origin HEAD:main\`. Para relatórios, capriche no visual (brandbook preto/branco, dourado <5%) — Playwright está disponível localmente para HTML→PDF.${rodape}`
    }
    return `Tarefa pedida por ${tarefa.solicitante || 'admin'} via WhatsApp (agente interno da Bula Assessoria, assessoria de leilões de gado):

${tarefa.descricao}

Importante: NÃO altere arquivos do repositório nem faça commit/push — tarefas de código são do runner "claude". Seu papel aqui é monitorar/pesquisar/executar e reportar.${rodape}`
}

function executarCli(tarefa, workdir) {
    return new Promise((resolve) => {
        const prompt = montarPrompt(tarefa, workdir)
        const cmd = tarefa.runner === 'claude'
            ? 'claude -p --dangerously-skip-permissions'
            : 'codex exec --sandbox danger-full-access --skip-git-repo-check --color never -'
        log(`executando [${tarefa.runner}] em ${workdir}:`, tarefa.descricao.slice(0, 90))
        const child = spawn(cmd, { cwd: workdir, shell: true, windowsHide: true })
        let out = ''
        const add = (chunk) => { out = (out + chunk.toString('utf-8')).slice(-OUTPUT_CAP) }
        child.stdout.on('data', add)
        child.stderr.on('data', add)
        child.stdin.write(prompt)
        child.stdin.end()
        const timer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch { /* já morreu */ }
            out += '\n[ponte] TEMPO ESGOTADO — processo encerrado'
        }, TIMEOUT_MS[tarefa.runner])
        child.on('close', (code) => {
            clearTimeout(timer)
            resolve({ code: code ?? -1, out })
        })
        child.on('error', (e) => {
            clearTimeout(timer)
            resolve({ code: -1, out: out + '\n[ponte] erro ao iniciar: ' + e.message })
        })
    })
}

// ------------------------- ciclo da fila -------------------------
async function processarUma() {
    const { data: pendentes } = await sb
        .from('agente_dev_tarefas')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })
        .limit(1)
    const tarefa = pendentes?.[0]
    if (!tarefa) return false

    // claim otimista: só processa se ainda estava pendente
    const { data: claimed } = await sb
        .from('agente_dev_tarefas')
        .update({ status: 'rodando', started_at: new Date().toISOString() })
        .eq('id', tarefa.id)
        .eq('status', 'pendente')
        .select('id')
    if (!claimed?.length) return true

    // Tarefa de código roda em worktree isolada; se a criação falhar, é ERRO
    // (rodar no repo de trabalho poderia bagunçar o que estiver aberto lá).
    let workdir = ROOT
    let comWorktree = false
    if (tarefa.runner === 'claude') {
        try {
            workdir = prepararWorktree(tarefa.id)
            comWorktree = true
        } catch (e) {
            log('worktree falhou:', e.message)
            await sb.from('agente_dev_tarefas').update({
                status: 'erro',
                resultado: `worktree falhou: ${e.message}`,
                finished_at: new Date().toISOString(),
            }).eq('id', tarefa.id)
            await enviarWhats(tarefa.phone, `⚠️ Não consegui preparar o ambiente isolado pra tarefa (${e.message}). Nada foi alterado.`)
            return true
        }
    }

    const { code, out } = await executarCli(tarefa, workdir)
    const ok = code === 0
    const texto = out.trim()

    // arquivos anunciados pela CLI ("ARQUIVO: <caminho>")
    const arquivos = [...texto.matchAll(/^ARQUIVO:\s*(.+)$/gim)].map(m => m[1].trim()).slice(0, 5)
    // resumo: o que vier depois de "RESUMO" se existir; senão o fim da saída
    const idxResumo = texto.toUpperCase().lastIndexOf('RESUMO')
    let resumo = idxResumo >= 0 ? texto.slice(idxResumo) : texto.slice(-900)
    resumo = resumo
        .replace(/^RESUMO[^\n:]*:?\s*/i, '') // tira o rótulo ("RESUMO**", "RESUMO (WhatsApp):"…)
        .replace(/^ARQUIVO:.*$/gim, '')
        .trim().slice(0, 1200)

    await sb.from('agente_dev_tarefas').update({
        status: ok ? 'concluida' : 'erro',
        resultado: texto.slice(-8000),
        exit_code: code,
        finished_at: new Date().toISOString(),
    }).eq('id', tarefa.id)

    const nomeRunner = tarefa.runner === 'claude' ? 'Claude Code' : 'Codex'
    const cabecalho = ok ? `✅ Tarefa dev concluída (${nomeRunner})` : `⚠️ Tarefa dev terminou com erro (${nomeRunner}, exit ${code})`
    await enviarWhats(tarefa.phone, `${cabecalho}\n\n${resumo || '(sem resumo)'}`)
    for (const arq of arquivos) await enviarArquivo(tarefa.phone, arq)
    if (comWorktree) limparWorktree(tarefa.id)
    log(`tarefa ${tarefa.id.slice(0, 8)} → ${ok ? 'concluida' : 'erro'} (exit ${code})`)
    return true
}

log(`ponte dev ativa — fila agente_dev_tarefas, repo ${ROOT}, sessão ${sessaoOperacional}`)
for (;;) {
    try {
        // esvazia a fila em sequência; uma tarefa por vez
        while (await processarUma()) { /* próxima */ }
    } catch (e) {
        log('ciclo falhou:', e.message)
    }
    await new Promise(r => setTimeout(r, POLL_MS))
}
