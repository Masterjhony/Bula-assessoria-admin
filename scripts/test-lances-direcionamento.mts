import assert from 'node:assert/strict'
import { rebuildFechamentoFromLances } from '../src/lib/lances-fechamento'
import type { SupabaseClient } from '@supabase/supabase-js'
let writes = 0
const sb = {from(table: string) {
  const q = {
    select(){return q}, eq(){return q}, order(){return q},
    async maybeSingle(){return {data:{id:'event',nome:'Leilão exemplo',data:'2026-08-21'},error:null}},
    then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:table==='bula_leilao_vendas'?[{lote:'29',valor:2600,comprador:'JOSE FABIO',assessor:'Douglas Bispo',raw_text:'Com direcionamento técnico Erik Monteiro'}]:[],error:null}))},
    insert(){writes++;throw new Error('Não publicar atribuição presumida')},
    update(){writes++;throw new Error('Não alterar atribuição presumida')},
  }; return q
}} as unknown as SupabaseClient
const result = await rebuildFechamentoFromLances(sb, 'event')
assert.equal(result.skipped, 'direcionamento_sem_regra_confirmada')
assert.equal(writes, 0)
console.log('OK: parceiro explícito sem regra não recebe atribuição presumida pelo comprador.')
