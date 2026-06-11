// Teste E2E do drag do kanban NA PRODUÇÃO (admin.bulaassessoria.com).
// 1. Cria usuário temporário (service role) 2. Login real 3. Arrasta card real
// 4. Verifica persistência (UI + DB) 5. RESTAURA o lead 6. Apaga o usuário temp.
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

const exeCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const exe = exeCandidates.find(existsSync);

let userId = null, leadBackup = null, browser = null, result = 'NÃO EXECUTADO';
try {
    // ── 1. usuário temporário ──
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: TEST_EMAIL, password: TEST_PASS, email_confirm: true,
    });
    if (cErr) {
        // se sobrou de uma execução anterior, localiza
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
        const found = list?.users?.find(u => u.email === TEST_EMAIL);
        if (!found) throw new Error('createUser: ' + cErr.message);
        userId = found.id;
        await admin.auth.admin.updateUserById(userId, { password: TEST_PASS });
    } else userId = created.user.id;
    console.log('[1] usuário temp ok:', userId);

    // ── 2. escolhe um lead de QUALIFICAÇÃO e guarda backup ──
    const { rows } = await db.query("select id, status, position from crm_leads where arquivado=false and status='QUALIFICAÇÃO' order by position desc limit 1");
    if (!rows.length) throw new Error('nenhum lead em QUALIFICAÇÃO');
    leadBackup = rows[0];
    console.log('[2] lead alvo:', leadBackup.id, '| status:', leadBackup.status, '| pos:', leadBackup.position);

    // ── 3. browser + login real ──
    browser = await chromium.launch({ executablePath: exe, headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    const consoleLogs = [];
    page.on('console', m => consoleLogs.push(`[console.${m.type()}] ${m.text()}`));
    page.on('pageerror', e => consoleLogs.push('[pageerror] ' + e.message));
    page.on('requestfailed', r => consoleLogs.push('[reqfail] ' + r.url() + ' ' + (r.failure()?.errorText || '')));
    page.on('framenavigated', f => { if (f === page.mainFrame()) consoleLogs.push('[NAV] ' + f.url()); });

    await page.goto('https://admin.bulaassessoria.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.fill('#login-email', TEST_EMAIL);
    await page.fill('#login-password', TEST_PASS);
    await page.click('#btn-login');
    await page.waitForURL(/\/sistema/, { timeout: 30000 }).catch(() => { });
    console.log('[3] pós-login url:', page.url());

    await page.goto('https://admin.bulaassessoria.com/sistema/crm?view=kanban', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector(`[data-crm-card-id="${leadBackup.id}"]`, { timeout: 30000 });
    console.log('[4] kanban carregado, card alvo visível');

    // ── 4. drag real: QUALIFICAÇÃO → CADASTRO ──
    const card = page.locator(`[data-crm-card-id="${leadBackup.id}"]`).first();
    await card.scrollIntoViewIfNeeded();
    const cb = await card.boundingBox();
    const col = page.locator('[data-crm-column="CADASTRO"]');
    const colB = await col.boundingBox();
    if (!cb || !colB) throw new Error('bounding boxes ausentes');
    const sx = cb.x + cb.width / 2, sy = cb.y + cb.height / 2;
    const ex = colB.x + colB.width / 2, ey = colB.y + 120;
    await page.mouse.move(sx, sy); await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
        await page.mouse.move(sx + (ex - sx) * i / 30, sy + (ey - sy) * i / 30);
        await page.waitForTimeout(20);
    }
    await page.waitForTimeout(200);
    await page.mouse.up();
    console.log('[5] drop feito, aguardando persistência…');
    await page.waitForTimeout(3500);

    const uiStatus = await page.locator(`[data-crm-card-id="${leadBackup.id}"]`).first().getAttribute('data-crm-card-status').catch(() => 'CARD SUMIU');
    const { rows: after } = await db.query('select status, position from crm_leads where id=$1', [leadBackup.id]);
    console.log('[6] status na UI após drop:', uiStatus);
    console.log('[6] status no DB após drop:', after[0]?.status, '| pos:', after[0]?.position);

    // reload para conferir persistência de verdade
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-crm-card-id]', { timeout: 30000 });
    const uiAfterReload = await page.locator(`[data-crm-card-id="${leadBackup.id}"]`).first().getAttribute('data-crm-card-status').catch(() => 'CARD NAO ENCONTRADO');
    console.log('[7] status na UI após RELOAD:', uiAfterReload);

    const ok = uiStatus === 'CADASTRO' && after[0]?.status === 'CADASTRO' && uiAfterReload === 'CADASTRO';
    result = ok ? 'DRAG FUNCIONA EM PRODUÇÃO' : 'DRAG FALHOU EM PRODUÇÃO';
    console.log('\n=== ' + result + ' ===');
    console.log('--- console/nav da página ---');
    consoleLogs.slice(-25).forEach(l => console.log(' ', l));
} catch (e) {
    console.error('ERRO no teste:', e.message);
    result = 'ERRO: ' + e.message;
} finally {
    // ── 5. restaura o lead ──
    if (leadBackup) {
        await db.query('update crm_leads set status=$1, position=$2 where id=$3', [leadBackup.status, leadBackup.position, leadBackup.id]);
        const { rows: chk } = await db.query('select status, position from crm_leads where id=$1', [leadBackup.id]);
        console.log('[restore] lead restaurado para:', chk[0]?.status, '| pos:', chk[0]?.position);
    }
    // ── 6. apaga usuário temp ──
    if (userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        console.log('[cleanup] usuário temp deletado:', error ? 'FALHOU: ' + error.message : 'ok');
    }
    if (browser) await browser.close();
    await db.end();
}
