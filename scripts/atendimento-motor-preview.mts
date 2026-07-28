/**
 * PREVIEW do motor de atendimento — roda o planejamento REAL e imprime,
 * sem gravar nada e sem enviar nada.
 *
 * É a ferramenta de conferência: antes de deixar o cron rodar sozinho, dá pra
 * olhar o dia inteiro — quem seria chamado, com qual molde, por quê, e quanta
 * gente ficou de fora e por qual motivo.
 *
 * Uso:
 *   npx tsx scripts/atendimento-motor-preview.mts            # resumo + 20 exemplos
 *   npx tsx scripts/atendimento-motor-preview.mts 60         # 60 exemplos
 *   npx tsx scripts/atendimento-motor-preview.mts --csv plano.csv
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { montarPlano, loadMotorConfig } from '../src/lib/atendimento-motor'
import { PLAY_LABEL } from '../src/lib/atendimento-ontologia'

for (const file of ['.env.local', '.env']) {
    try {
        for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
            if (!m) continue
            let v = m[2].trim()
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
            if (!(m[1] in process.env)) process.env[m[1]] = v
        }
    } catch { /* arquivo ausente é normal */ }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const argv = process.argv.slice(2)
const csvPath = (() => { const i = argv.indexOf('--csv'); return i >= 0 ? argv[i + 1] : null })()
const amostra = Number(argv.find(a => /^\d+$/.test(a))) || 20

const config = await loadMotorConfig(supabase)
console.log('\n═══ CONFIG DO MOTOR ═══')
console.log(`  ligado: ${config.enabled}   dry_run: ${config.dry_run}`)
console.log(`  rampa: ${config.cap_inicial} → ${config.cap_maximo} (+${config.cap_passo}/dia)   pausa se quality < ${config.quality_min}`)
console.log(`  cotas: ${Object.entries(config.cotas).map(([k, v]) => `${k}=${v}`).join('  ')}`)

console.time('planejamento')
const { plano, resumo } = await montarPlano(supabase)
console.timeEnd('planejamento')

console.log(`\n═══ PLANO DE ${resumo.dia} ═══`)
console.log(`  leads avaliados : ${resumo.avaliados}`)
console.log(`  elegíveis hoje  : ${resumo.elegiveis}`)
console.log(`  planejados      : ${resumo.planejados}  (teto do dia: ${resumo.cap})`)

console.log('\n── por play ──')
for (const [play, n] of Object.entries(resumo.porPlay).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${PLAY_LABEL[play as keyof typeof PLAY_LABEL] ?? play}`)
}

console.log('\n── quem ficou de fora (e por quê) ──')
for (const [motivo, n] of Object.entries(resumo.bloqueios).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${motivo}`)
}

console.log(`\n── amostra (${Math.min(amostra, plano.length)} de ${plano.length}) ──`)
for (const t of plano.slice(0, amostra)) {
    console.log(`\n[${String(t.prioridade).padStart(3)}] ${t.play}  ·  ${t.telefone}  ·  fase=${t.fase} seg=${t.segmento}`)
    console.log(`      POR QUÊ: ${t.motivo}`)
    console.log(`      MOLDE  : ${t.template ?? '(texto livre — janela aberta)'}${t.template_params.length ? `  vars=[${t.template_params.join(' | ')}]` : ''}`)
    console.log(`      TEXTO  : ${t.corpo.replace(/\s+/g, ' ').slice(0, 150)}…`)
}

if (csvPath) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const linhas = [
        ['prioridade', 'play', 'telefone', 'fase', 'segmento', 'template', 'motivo', 'corpo'].join(','),
        ...plano.map(t => [t.prioridade, t.play, t.telefone, t.fase, t.segmento, t.template ?? 'texto_livre', t.motivo, t.corpo.replace(/\s+/g, ' ')].map(esc).join(',')),
    ]
    writeFileSync(csvPath, '﻿' + linhas.join('\n'), 'utf8')
    console.log(`\n✔ CSV salvo em ${csvPath}`)
}

console.log('\nNada foi gravado e nada foi enviado — isto é só o preview.\n')
