"use client"

/**
 * Formulário público de habilitação — 3 blocos de dados + os 4 documentos do
 * dossiê. Upload vai DIRETO ao Supabase Storage via signed URL (o /api da
 * Vercel estoura em ~4.5MB), no mesmo bucket/pipeline do funil WhatsApp.
 */

import { useRef, useState } from "react"
import {
    HABILITACAO_DOC_SLOTS, HABILITACAO_ACCEPT, HABILITACAO_MAX_FILE_BYTES, cpfValido,
} from "@/lib/habilitacao-form"

const GOLD = "#C9A84C"
const OSWALD = "'Oswald', sans-serif"
const INTER = "'Inter', sans-serif"

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

function maskCpf(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}
function maskPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)',
    color: '#fff', padding: '14px 16px', fontFamily: INTER, fontSize: '15px', outline: 'none',
    borderRadius: '2px',
}
const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: OSWALD, fontWeight: 500, fontSize: '12px',
    letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: '8px',
}

function BlocoTitulo({ n, titulo }: { n: string; titulo: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', margin: '0 0 22px', paddingTop: '10px' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', color: GOLD }}>{n}</span>
            <h3 style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 'clamp(18px,2vw,22px)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{titulo}</h3>
        </div>
    )
}

type Status = 'idle' | 'enviando' | 'sucesso'

export function HabilitacaoForm() {
    const [f, setF] = useState({
        nome: '', cpf: '', whatsapp: '', email: '', endereco: '',
        fazenda_nome: '', fazenda_cidade: '', fazenda_uf: '', inscricao_estadual: '', sem_ie: false,
        website: '', // honeypot
    })
    const [files, setFiles] = useState<Record<string, File | null>>({})
    const [status, setStatus] = useState<Status>('idle')
    const [progresso, setProgresso] = useState('')
    const [erro, setErro] = useState<string | null>(null)
    const [docsEnviados, setDocsEnviados] = useState(0)
    const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

    const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }))

    function pickFile(slot: string, file: File | null) {
        if (file && file.size > HABILITACAO_MAX_FILE_BYTES) {
            setErro(`"${file.name}" passa de 25MB — tire uma foto ou gere um PDF menor.`)
            return
        }
        setErro(null)
        setFiles(p => ({ ...p, [slot]: file }))
    }

    function validar(): string | null {
        if (!/\S+\s+\S+/.test(f.nome.trim())) return 'Informe seu nome completo.'
        if (!cpfValido(f.cpf)) return 'CPF inválido — confira os números.'
        if (f.whatsapp.replace(/\D/g, '').length < 10) return 'Informe seu WhatsApp com DDD.'
        if (f.endereco.trim().length < 8) return 'Informe o endereço de correspondência completo (rua, número, cidade).'
        if (f.fazenda_nome.trim().length < 2) return 'Informe o nome da fazenda (local de entrega dos animais).'
        if (f.fazenda_cidade.trim().length < 2 || !f.fazenda_uf) return 'Informe cidade e UF da fazenda.'
        if (!f.inscricao_estadual.trim() && !f.sem_ie) return 'Informe a Inscrição Estadual/NIRF ou marque que ainda não possui.'
        return null
    }

    async function enviar() {
        const v = validar()
        if (v) { setErro(v); return }
        setErro(null)
        setStatus('enviando')
        try {
            const docsMeta = HABILITACAO_DOC_SLOTS
                .filter(s => files[s.slot])
                .map(s => ({
                    slot: s.slot, filename: files[s.slot]!.name,
                    contentType: files[s.slot]!.type || 'application/octet-stream', size: files[s.slot]!.size,
                }))

            setProgresso('Registrando seus dados…')
            const res = await fetch('/api/habilitacao/submit', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...f, docs: docsMeta }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Não foi possível enviar. Tente de novo.')

            const uploaded: Array<{ slot: string; path: string; filename: string; mime: string; size: number }> = []
            const uploads: Array<{ slot: string; path: string; signedUrl: string }> = data.uploads ?? []
            for (let i = 0; i < uploads.length; i++) {
                const u = uploads[i]
                const file = files[u.slot]
                if (!file) continue
                setProgresso(`Enviando documento ${i + 1} de ${uploads.length}…`)
                const put = await fetch(u.signedUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file,
                })
                if (put.ok) uploaded.push({ slot: u.slot, path: u.path, filename: file.name, mime: file.type, size: file.size })
            }

            if (uploaded.length) {
                setProgresso('Confirmando documentos…')
                await fetch('/api/habilitacao/confirm', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ref: data.ref, sig: data.sig, uploaded }),
                }).catch(() => null)
            }

            setDocsEnviados(uploaded.length)
            setStatus('sucesso')
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível enviar. Tente de novo.')
            setStatus('idle')
        }
    }

    if (status === 'sucesso') {
        const faltando = HABILITACAO_DOC_SLOTS.filter(s => !files[s.slot])
        return (
            <div style={{ border: `1px solid rgba(201,168,76,0.4)`, padding: 'clamp(28px,4vw,48px)', textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', margin: '0 auto 20px', border: `1px solid ${GOLD}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <h3 style={{ fontFamily: OSWALD, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(22px,3vw,30px)', letterSpacing: '0.04em', margin: '0 0 14px' }}>
                    Cadastro recebido
                </h3>
                <p style={{ fontFamily: INTER, fontSize: '15px', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', maxWidth: '46ch', margin: '0 auto 8px' }}>
                    Seus dados{docsEnviados > 0 ? ` e ${docsEnviados} documento(s)` : ''} chegaram à nossa equipe.
                    Vamos conferir e encaminhar às leiloeiras parceiras — você recebe o retorno pelo WhatsApp informado.
                </p>
                {faltando.length > 0 && (
                    <p style={{ fontFamily: INTER, fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', maxWidth: '48ch', margin: '10px auto 0' }}>
                        Ficou pendente: {faltando.map(s => s.label).join(' · ')}. Você pode enviar depois por aqui mesmo ou pelo WhatsApp — a análise das leiloeiras começa com o dossiê completo.
                    </p>
                )}
            </div>
        )
    }

    return (
        <form onSubmit={e => { e.preventDefault(); void enviar() }} noValidate>
            {/* honeypot invisível */}
            <input type="text" name="website" value={f.website} onChange={e => set('website', e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }} aria-hidden="true" />

            <BlocoTitulo n="01" titulo="Identificação" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '18px', marginBottom: '34px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Nome completo *</label>
                    <input style={inputStyle} value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Como está no seu documento" autoComplete="name" />
                </div>
                <div>
                    <label style={labelStyle}>CPF *</label>
                    <input style={inputStyle} value={f.cpf} onChange={e => set('cpf', maskCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
                </div>
                <div>
                    <label style={labelStyle}>WhatsApp *</label>
                    <input style={inputStyle} value={f.whatsapp} onChange={e => set('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                </div>
                <div>
                    <label style={labelStyle}>E-mail</label>
                    <input style={inputStyle} value={f.email} onChange={e => set('email', e.target.value)} placeholder="voce@exemplo.com" inputMode="email" autoComplete="email" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Endereço de correspondência *</label>
                    <input style={inputStyle} value={f.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro, cidade/UF, CEP" autoComplete="street-address" />
                </div>
            </div>

            <BlocoTitulo n="02" titulo="Propriedade" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '18px', marginBottom: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Nome da fazenda (local de entrega) *</label>
                    <input style={inputStyle} value={f.fazenda_nome} onChange={e => set('fazenda_nome', e.target.value)} placeholder="Ex.: Fazenda Santa Fé" />
                </div>
                <div>
                    <label style={labelStyle}>Cidade da fazenda *</label>
                    <input style={inputStyle} value={f.fazenda_cidade} onChange={e => set('fazenda_cidade', e.target.value)} placeholder="Cidade" />
                </div>
                <div>
                    <label style={labelStyle}>UF *</label>
                    <select style={{ ...inputStyle, appearance: 'none' }} value={f.fazenda_uf} onChange={e => set('fazenda_uf', e.target.value)}>
                        <option value="" style={{ color: '#000' }}>UF</option>
                        {UFS.map(uf => <option key={uf} value={uf} style={{ color: '#000' }}>{uf}</option>)}
                    </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Inscrição Estadual ou NIRF {f.sem_ie ? '' : '*'}</label>
                    <input style={{ ...inputStyle, opacity: f.sem_ie ? 0.4 : 1 }} disabled={f.sem_ie} value={f.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} placeholder="Número da I.E. da propriedade (ou NIRF)" />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', cursor: 'pointer', fontFamily: INTER, fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                        <input type="checkbox" checked={f.sem_ie} onChange={e => set('sem_ie', e.target.checked)} style={{ accentColor: GOLD }} />
                        Ainda não possuo — quero orientação para emitir (é rápido)
                    </label>
                </div>
            </div>

            <BlocoTitulo n="03" titulo="Documentos" />
            <p style={{ fontFamily: INTER, fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(255,255,255,0.55)', margin: '-8px 0 20px' }}>
                A compra em leilão é parcelada direto com a leiloeira — e é ela quem assume o parcelamento.
                Por isso o cadastro aprovado exige estes documentos: eles dimensionam o seu crédito para dar lance.
                Foto legível ou PDF, até 25MB cada. Se não tiver algum em mãos, envie o restante depois pelo WhatsApp.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '14px', marginBottom: '34px' }}>
                {HABILITACAO_DOC_SLOTS.map(s => {
                    const file = files[s.slot]
                    return (
                        <div key={s.slot}
                            onClick={() => fileRefs.current[s.slot]?.click()}
                            style={{
                                border: file ? `1px solid ${GOLD}` : '1px dashed rgba(255,255,255,0.25)',
                                padding: '16px 18px', cursor: 'pointer', background: file ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                                transition: 'border-color .15s',
                            }}>
                            <input
                                ref={el => { fileRefs.current[s.slot] = el }}
                                type="file" accept={HABILITACAO_ACCEPT} style={{ display: 'none' }}
                                onChange={e => pickFile(s.slot, e.target.files?.[0] ?? null)}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <span style={{ fontFamily: OSWALD, fontWeight: 500, fontSize: '13.5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</span>
                                {file
                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>}
                            </div>
                            <p style={{ fontFamily: INTER, fontSize: '12px', lineHeight: 1.55, color: file ? GOLD : 'rgba(255,255,255,0.45)', margin: '8px 0 0', wordBreak: 'break-word' }}>
                                {file ? file.name : s.hint}
                            </p>
                        </div>
                    )
                })}
            </div>

            {erro && (
                <p style={{ fontFamily: INTER, fontSize: '14px', color: '#e5484d', border: '1px solid rgba(229,72,77,0.4)', padding: '12px 16px', marginBottom: '18px' }}>{erro}</p>
            )}

            <button
                type="submit" disabled={status === 'enviando'}
                style={{
                    fontFamily: OSWALD, fontWeight: 600, fontSize: '15px', letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: '#0A0A0A', background: '#fff', border: 'none', padding: '18px 44px', cursor: status === 'enviando' ? 'wait' : 'pointer',
                    opacity: status === 'enviando' ? 0.7 : 1, width: '100%',
                }}>
                {status === 'enviando' ? (progresso || 'Enviando…') : 'Enviar habilitação'}
            </button>
            <p style={{ fontFamily: INTER, fontSize: '12px', lineHeight: 1.6, color: 'rgba(255,255,255,0.4)', margin: '14px 0 0', textAlign: 'center' }}>
                Seus dados e documentos são usados exclusivamente para o cadastro nas leiloeiras parceiras da Bula
                e trafegam em conexão segura. Nenhum custo é cobrado do produtor.
            </p>
        </form>
    )
}
