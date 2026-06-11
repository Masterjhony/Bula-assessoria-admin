// Teste E2E do drag do kanban NA PRODUÇÃO (admin.bulaassessoria.com).
// Cenários adversariais (mouse "humano": trajetória ondulada, pausas, drops
// fora do óbvio). Invariante verificado em cada drop:
//   status na UI === status no DB === status após reload  (sem snap-back)
// Cria usuário temporário, restaura os leads e apaga o usuário ao final.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const TEST_EMAIL = 'e2e-claude-kanban@example.com';
const TEST_PASS = 'E2e!Kanban#2026_tmp';
// Marca presente apenas no código novo (af5e85a) — prova que o navegador
// recebeu o deploy com a correção.
const CODE_MARKER = 'Não foi possível mover o lead';

const exeCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const exe = exeCandidates.find(existsSync);

let userId = null, browser = null;
const backups = new Map(); // id -> {status, position}
const results = [];

async function backupLead(id) {
    if (backups.has(id)) return;
    const { rows } = await db.query('select status, position from crm_leads where id=$1', [id]);
    backups.set(id, rows[0]);
}

try {
    // ── usuário temporário ──
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASS, email_confirm: true });
    if (cErr) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
        const found = list?.users?.find(u => u.email === TEST_EMAIL);
        if (!found) throw new Error('createUser: ' + cErr.message);
        userId = found.id;
        await admin.auth.admin.updateUserById(userId, { password: TEST_PASS });
    } else userId = created.user.id;
    console.log('[setup] usuário temp:', userId);

    browser = await chromium.launch({ executablePath: exe, headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
    const consoleLogs = [];
    const scriptUrls = new Set();
    page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', e => consoleLogs.push('[pageerror] ' + e.message));
    page.on('response', r => { if (r.url().includes('/_next/static/') && r.url().endsWith('.js')) scriptUrls.add(r.url()); });
    page.on('dialog', async d => { consoleLogs.push('[ALERT] ' + d.message()); await d.dismiss(); });

    await page.goto('https://admin.bulaassessoria.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.fill('#login-email', TEST_EMAIL);
    await page.fill('#login-password', TEST_PASS);
    await page.click('#btn-login');
    await page.waitForURL(/\/sistema/, { timeout: 30000 }).catch(() => { });
    await page.goto('https://admin.bulaassessoria.com/sistema/crm?view=kanban', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-crm-card-id]', { timeout: 30000 });
    console.log('[setup] kanban carregado');

    // ── verifica que o JS servido contém o código NOVO ──
    let markerFound = false;
    for (const u of scriptUrls) {
        try {
            const txt = await (await fetch(u)).text();
            if (txt.includes(CODE_MARKER)) { markerFound = true; break; }
        } catch { /* segue */ }
    }
    console.log('[deploy-check] código novo (af5e85a) servido ao navegador:', markerFound ? 'SIM ✓' : 'NÃO ✗');

    // mouse "humano": trajetória com ondulação senoidal e pausas irregulares
    async function humanDrag(fromX, fromY, toX, toY) {
        await page.mouse.move(fromX, fromY);
        await page.mouse.down();
        const steps = 45;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = fromX + (toX - fromX) * t + Math.sin(t * Math.PI * 3) * 28;
            const y = fromY + (toY - fromY) * t + Math.cos(t * Math.PI * 2) * 14;
            await page.mouse.move(x, y);
            await page.waitForTimeout(i % 7 === 0 ? 90 : 22); // pausas irregulares
        }
        await page.waitForTimeout(350); // usuário "segura" antes de soltar
        await page.mouse.up();
        await page.waitForTimeout(3000); // server action persiste
    }

    async function checkInvariant(label, leadId, expectedCol) {
        const ui = await page.locator(`[data-crm-card-id="${leadId}"]`).first().getAttribute('data-crm-card-status').catch(() => 'CARD SUMIU');
        const { rows } = await db.query('select status from crm_leads where id=$1', [leadId]);
        const dbStatus = rows[0]?.status;
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('[data-crm-card-id]', { timeout: 30000 });
        const uiReload = await page.locator(`[data-crm-card-id="${leadId}"]`).first().getAttribute('data-crm-card-status').catch(() => 'CARD NAO ENCONTRADO');
        const ok = ui === expectedCol && dbStatus === expectedCol && uiReload === expectedCol;
        results.push({ label, ok, ui, dbStatus, uiReload, expectedCol });
        console.log(`[${label}] UI=${ui} DB=${dbStatus} reload=${uiReload} esperado=${expectedCol} → ${ok ? 'OK ✓' : 'FALHOU ✗'}`);
        return ok;
    }

    async function cardBox(leadId) {
        const c = page.locator(`[data-crm-card-id="${leadId}"]`).first();
        await c.scrollIntoViewIfNeeded();
        return await c.boundingBox();
    }
    async function colBox(name) {
        return await page.locator(`[data-crm-column="${name}"]`).boundingBox();
    }

    // ════ Cenário 1: drop no MEIO da coluna CADASTRO (trajetória humana) ════
    {
        const { rows } = await db.query("select id from crm_leads where arquivado=false and status='QUALIFICAÇÃO' order by position desc limit 1");
        const id = rows[0].id; await backupLead(id);
        const cb = await cardBox(id); const tb = await colBox('CADASTRO');
        await humanDrag(cb.x + cb.width / 2, cb.y + cb.height / 2, tb.x + tb.width / 2, tb.y + tb.height * 0.5);
        await checkInvariant('1: drop meio CADASTRO', id, 'CADASTRO');
    }

    // ════ Cenário 2: drop na coluna VAZIA (CONEXÃO) ════
    {
        const { rows } = await db.query("select id from crm_leads where arquivado=false and status='QUALIFICAÇÃO' order by position asc limit 1");
        const id = rows[0].id; await backupLead(id);
        const cb = await cardBox(id); const tb = await colBox('CONEXÃO');
        await humanDrag(cb.x + cb.width / 2, cb.y + cb.height / 2, tb.x + tb.width / 2, tb.y + 200);
        await checkInvariant('2: drop coluna vazia CONEXÃO', id, 'CONEXÃO');
    }

    // ════ Cenário 3: solta ACIMA do quadro, alinhado à coluna CADASTRO ════
    // (testa o fallback de faixa horizontal do hit-test)
    {
        const { rows } = await db.query("select id from crm_leads where arquivado=false and status='QUALIFICAÇÃO' order by position desc limit 1");
        const id = rows[0].id; await backupLead(id);
        const cb = await cardBox(id); const tb = await colBox('CADASTRO');
        await humanDrag(cb.x + cb.width / 2, cb.y + cb.height / 2, tb.x + tb.width / 2, Math.max(20, tb.y - 60));
        await checkInvariant('3: drop ACIMA do quadro (faixa da CADASTRO)', id, 'CADASTRO');
    }

    // ════ Cenário 4: drop SOBRE um card existente da coluna destino ════
    {
        const { rows } = await db.query("select id from crm_leads where arquivado=false and status='QUALIFICAÇÃO' order by position asc limit 1");
        const id = rows[0].id; await backupLead(id);
        const { rows: dst } = await db.query("select id from crm_leads where arquivado=false and status='CADASTRO' order by position asc limit 1");
        const cb = await cardBox(id); const db2 = await cardBox(dst[0].id);
        await humanDrag(cb.x + cb.width / 2, cb.y + cb.height / 2, db2.x + db2.width / 2, db2.y + db2.height / 2);
        await checkInvariant('4: drop sobre card de CADASTRO', id, 'CADASTRO');
    }

    const allOk = results.every(r => r.ok);
    console.log('\n════ RESULTADO GERAL: ' + (allOk && markerFound ? 'TODOS OS CENÁRIOS OK — SEM SNAP-BACK ✓' : 'HÁ FALHAS ✗') + ' ════');
    console.log('--- últimos eventos da página ---');
    consoleLogs.filter(l => l.includes('ALERT') || l.includes('pageerror') || l.includes('error')).slice(-10).forEach(l => console.log(' ', l));
} catch (e) {
    console.error('ERRO no teste:', e.message);
} finally {
    for (const [id, b] of backups) {
        await db.query('update crm_leads set status=$1, position=$2 where id=$3', [b.status, b.position, id]);
    }
    if (backups.size) {
        const ids = [...backups.keys()];
        const { rows } = await db.query('select id, status from crm_leads where id = any($1)', [ids]);
        console.log('[restore] leads restaurados:', rows.map(r => r.status).join(', '));
    }
    if (userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        console.log('[cleanup] usuário temp deletado:', error ? 'FALHOU: ' + error.message : 'ok');
    }
    if (browser) await browser.close();
    await db.end();
}
