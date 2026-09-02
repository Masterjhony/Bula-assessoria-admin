import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createHash, randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: path.resolve('.env.local'), quiet: true })

const migrationFiles = [
  'supabase/migrations/0078_fechamento_identidade.sql',
  'supabase/migrations/0079_fechamento_procedencia.sql',
  'supabase/migrations/0080_fechamento_auditoria_shadow.sql',
  'supabase/migrations/0081_lances_publicacao_segura.sql',
  'supabase/migrations/0082_operational_concurrency_guards.sql',
]

function withoutTransactionControl(sql) {
  return sql
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(begin|commit)\s*;\s*$/i.test(line))
    .join('\n')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL ausente em .env.local')

const client = new pg.Client({ connectionString })
let transactionOpen = false

try {
  await client.connect()
  await client.query('begin')
  transactionOpen = true
  await client.query("set local lock_timeout = '8s'")
  await client.query("set local statement_timeout = '180s'")

  for (const file of migrationFiles) {
    const sql = withoutTransactionControl(await fs.readFile(path.resolve(file), 'utf8'))
    process.stdout.write(`dry-run ${path.basename(file)} ... `)
    await client.query(sql)
    process.stdout.write('ok\n')
  }

  const invariant = await client.query(`
    select
      to_regprocedure('public.bula_fechamento_write_governado(text,uuid,bigint,jsonb,text,text,uuid,uuid)') is not null as governed_write,
      to_regprocedure('public.bula_fechamento_add_decision(uuid,uuid,text,text,uuid,jsonb,text,uuid[],uuid[],uuid,timestamptz,text)') is not null as governed_decision,
      to_regprocedure('public.bula_fechamento_field_evidence_matches(uuid,uuid,text,jsonb,uuid,uuid)') is not null as exact_match,
      to_regclass('public.bula_fechamento_write_requests') is not null as write_idempotency_ledger,
      to_regclass('public.bula_fechamento_cutover_guard') is null as guard_removed,
      not has_table_privilege('authenticated', 'public.bula_leilao_fechamento', 'SELECT') as base_hidden,
      has_table_privilege('authenticated', 'public.bula_leilao_fechamento_comercial_v', 'SELECT') as commercial_visible,
      not has_table_privilege('service_role', 'public.bula_fechamento_snapshots', 'INSERT') as snapshot_not_forgeable,
      not has_table_privilege('service_role', 'public.bula_fechamento_claims', 'INSERT') as claim_not_forgeable,
      not has_table_privilege('service_role', 'public.bula_fechamento_decisoes', 'INSERT') as decision_not_forgeable,
      not has_table_privilege('service_role', 'public.bula_fechamento_write_requests', 'SELECT') as write_ledger_hidden,
      (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as profiles_rls,
      has_table_privilege('authenticated', 'public.profiles', 'SELECT') as profiles_authenticated_read,
      not has_table_privilege('authenticated', 'public.profiles', 'INSERT') as profiles_no_authenticated_insert,
      not has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as profiles_no_authenticated_update,
      not has_table_privilege('authenticated', 'public.profiles', 'DELETE') as profiles_no_authenticated_delete,
      not has_table_privilege('anon', 'public.profiles', 'SELECT') as profiles_no_anon_read,
      has_function_privilege('authenticated', 'public.bula_fechamento_write_governado(text,uuid,bigint,jsonb,text,text,uuid,uuid)', 'EXECUTE') as human_write_rpc,
      has_function_privilege('authenticated', 'public.bula_fechamento_add_decision(uuid,uuid,text,text,uuid,jsonb,text,uuid[],uuid[],uuid,timestamptz,text)', 'EXECUTE') as human_decision_rpc,
      has_function_privilege('authenticated', 'public.bula_profile_is_admin()', 'EXECUTE') as profile_admin_check
      ,to_regprocedure('public.consume_internal_signup_code(text,text,text)') is not null as atomic_signup_code
      ,to_regprocedure('public.issue_internal_signup_code(text,text,text,timestamp with time zone,text)') is not null as atomic_signup_issue
      ,has_function_privilege('service_role', 'public.consume_internal_signup_code(text,text,text)', 'EXECUTE') as service_signup_consumer
      ,has_function_privilege('service_role', 'public.issue_internal_signup_code(text,text,text,timestamp with time zone,text)', 'EXECUTE') as service_signup_issuer
      ,not has_function_privilege('authenticated', 'public.consume_internal_signup_code(text,text,text)', 'EXECUTE') as signup_consumer_not_authenticated
      ,not has_function_privilege('authenticated', 'public.issue_internal_signup_code(text,text,text,timestamp with time zone,text)', 'EXECUTE') as signup_issuer_not_authenticated
      ,coalesce((
        select pg_get_indexdef(i.oid) =
          'CREATE UNIQUE INDEX bula_fechamento_auto_evento_ativo_uidx ON public.bula_leilao_fechamento USING btree (cronograma_id) WHERE ((origem = ''lances-auto''::text) AND (cronograma_id IS NOT NULL) AND (archived_at IS NULL))'
          from pg_class i
         where i.oid = to_regclass('public.bula_fechamento_auto_evento_ativo_uidx')
      ), false) as auto_closure_unique_exact
  `)
  for (const [key, value] of Object.entries(invariant.rows[0])) {
    assert(value === true, `invariante falhou: ${key}`)
  }

  const serviceJwt = JSON.stringify({ role: 'service_role' })
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [serviceJwt])
  await client.query('set local role service_role')
  const signupEmail = `dry-run-${randomUUID()}@example.invalid`
  const correctSignupHash = createHash('sha256').update('123456').digest('hex')
  const wrongSignupHash = createHash('sha256').update('654321').digest('hex')
  const issueEmail = `dry-run-issue-${randomUUID()}@example.invalid`
  const issue = await client.query(`
    select * from public.issue_internal_signup_code(
      $1::text, $2::text, 'Dry Run'::text,
      clock_timestamp() + interval '10 minutes', $3::text
    )
  `, [issueEmail, correctSignupHash, 'b'.repeat(64)])
  assert(issue.rows[0]?.status === 'issued' && issue.rows[0]?.code_id, 'emissão atômica não criou um código')
  const concurrentIssue = await client.query(`
    select * from public.issue_internal_signup_code(
      $1::text, $2::text, 'Dry Run'::text,
      clock_timestamp() + interval '10 minutes', $3::text
    )
  `, [issueEmail, wrongSignupHash, 'b'.repeat(64)])
  assert(concurrentIssue.rows[0]?.status === 'rate_limited', 'segunda emissão imediata contornou o throttle atômico')

  await client.query('reset role')
  await client.query(`
    insert into public.signup_verification_codes (email, code_hash, expires_at)
    values ($1::text, $2::text, clock_timestamp() + interval '10 minutes')
  `, [signupEmail, correctSignupHash])
  await client.query('set local role service_role')
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await client.query(`
      select * from public.consume_internal_signup_code($1::text, $2::text, $3::text)
    `, [signupEmail, wrongSignupHash, 'a'.repeat(64)])
    assert(result.rows[0]?.status === 'incorrect', `tentativa atômica ${attempt} não foi contabilizada`)
    assert(result.rows[0]?.attempts_remaining === 5 - attempt, 'saldo de tentativas incorreto')
  }
  const signupSuccess = await client.query(`
    select * from public.consume_internal_signup_code($1::text, $2::text, $3::text)
  `, [signupEmail, correctSignupHash, 'a'.repeat(64)])
  assert(signupSuccess.rows[0]?.status === 'verified', 'código correto não foi consumido atomicamente')
  const signupReplay = await client.query(`
    select * from public.consume_internal_signup_code($1::text, $2::text, $3::text)
  `, [signupEmail, correctSignupHash, 'a'.repeat(64)])
  assert(signupReplay.rows[0]?.status === 'not_found', 'código consumido pôde ser reutilizado')

  const assertedSale = await client.query(`
    insert into public.bula_leilao_vendas (
      group_jid, message_id, raw_text, lote, status, fonte
    ) values ($1::text, $2::text, 'dry-run parser assertion', 'DRY', 'revisar', 'parser')
    returning id
  `, [`dry-run-${randomUUID()}@g.us`, randomUUID()])
  await client.query('reset role')
  const assertedSaleAudit = await client.query(`
    select attributed, writer_name
      from public.bula_leilao_venda_versoes
     where venda_id = $1::uuid and revision = 0
  `, [assertedSale.rows[0].id])
  assert(assertedSaleAudit.rowCount === 1, 'captura de venda service_role não gerou auditoria')
  assert(assertedSaleAudit.rows[0].attributed === false, 'fonte declarada pelo service_role virou autoria certificada')
  assert(
    assertedSaleAudit.rows[0].writer_name === 'whatsapp-lances-asserted-unverified',
    'fonte service_role não ficou explicitamente delimitada como não verificada'
  )

  const candidate = await client.query(`
    select id, revision, nome, data, cronograma_id, vgv_total
      from public.bula_leilao_fechamento
     where archived_at is null
     order by created_at
     limit 1
  `)
  if (candidate.rowCount > 0) {
    const row = candidate.rows[0]
    const adminProfile = await client.query(`
      select id from public.profiles where role = 'admin' order by created_at limit 1
    `)
    assert(adminProfile.rowCount === 1, 'dry-run requer um profile admin existente')
    const actorId = adminProfile.rows[0].id

    const forgedSaleJwt = JSON.stringify({
      role: 'authenticated',
      email: 'formuladoboi@gmail.com',
      sub: actorId,
    })
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [forgedSaleJwt])
    await client.query('set local role service_role')
    await client.query(`
      update public.bula_leilao_vendas
         set last_changed_by = $1::uuid,
             last_change_reason = 'painel_edicao',
             last_change_request_id = $2::text,
             updated_at = clock_timestamp()
       where id = $3::uuid
    `, [actorId, randomUUID(), assertedSale.rows[0].id])
    await client.query('reset role')
    const forgedSaleAudit = await client.query(`
      select attributed, writer_name
        from public.bula_leilao_venda_versoes
       where venda_id = $1::uuid and revision = 1
    `, [assertedSale.rows[0].id])
    assert(forgedSaleAudit.rows[0]?.attributed === false, 'service_role forjou autoria humana de venda pelo JWT')
    assert(
      forgedSaleAudit.rows[0]?.writer_name === 'service-asserted-human-unverified',
      'update humano via service_role não ficou delimitado como alegação não verificada'
    )

    await client.query('savepoint prearchived_insert_check')
    let prearchivedBlocked = false
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [serviceJwt])
      await client.query('set local role service_role')
      await client.query(`
        insert into public.bula_leilao_fechamento (
          nome, data, archived_at, archived_by, archive_reason
        ) values ('dry run prearchived', current_date, clock_timestamp(), $1::uuid, 'forged archive')
      `, [actorId])
    } catch (error) {
      prearchivedBlocked = error?.code === '23514'
      await client.query('rollback to savepoint prearchived_insert_check')
    }
    await client.query('reset role')
    await client.query('release savepoint prearchived_insert_check')
    assert(prearchivedBlocked, 'service_role conseguiu criar fechamento já arquivado')

    const forgedHumanJwt = JSON.stringify({
      role: 'authenticated',
      email: 'formuladoboi@gmail.com',
      sub: actorId,
    })
    await client.query('savepoint forged_human_review_check')
    let forgedHumanReviewBlocked = false
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [forgedHumanJwt])
      await client.query('set local role service_role')
      await client.query(`
        select public.bula_fechamento_add_version_review(
          $1::uuid, null::uuid, 'pretrail'::text, 'limitation_accepted'::text,
          '{}'::text[], null::uuid, null::uuid, null::uuid,
          'forged_human_limitation'::text, $2::text
        )
      `, [row.id, randomUUID()])
    } catch (error) {
      forgedHumanReviewBlocked = error?.code === '42501'
      await client.query('rollback to savepoint forged_human_review_check')
    }
    await client.query('reset role')
    await client.query('release savepoint forged_human_review_check')
    assert(forgedHumanReviewBlocked, 'service_role personificou finance-admin em version review humano')

    const regularProfile = await client.query(`
      select id from public.profiles where role = 'user' order by created_at limit 1
    `)
    if (regularProfile.rowCount === 1) {
      const regularJwt = JSON.stringify({
        role: 'authenticated',
        email: 'dry-run-user@example.invalid',
        sub: regularProfile.rows[0].id,
      })
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [regularJwt])
      await client.query('set local role authenticated')
      const regularVisibility = await client.query(`select id from public.profiles order by id`)
      await client.query('reset role')
      assert(
        regularVisibility.rowCount === 1 && regularVisibility.rows[0].id === regularProfile.rows[0].id,
        'profile comum enxergou outro usuário ou perdeu a própria leitura'
      )
    }
    const jwt = JSON.stringify({
      role: 'authenticated',
      email: 'formuladoboi@gmail.com',
      sub: actorId,
    })
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [jwt])
    await client.query('set local role authenticated')
    const adminVisibility = await client.query(`select id from public.profiles order by id`)
    await client.query('reset role')
    const totalProfiles = await client.query(`select count(*)::int as total from public.profiles`)
    assert(
      adminVisibility.rowCount === totalProfiles.rows[0].total,
      'profile admin não recebeu a leitura administrativa esperada'
    )

    await client.query('set local role authenticated')
    const decisionIdempotency = randomUUID()
    const decisionDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const decision = await client.query(`
      select public.bula_fechamento_add_decision(
        $1::uuid, $2::uuid, 'vgv_total'::text, 'defer'::text, null::uuid, null::jsonb,
        'dry_run_validation'::text, '{}'::uuid[], '{}'::uuid[], null::uuid,
        $3::timestamptz, $4::text
      ) as id
    `, [row.id, row.cronograma_id, decisionDueAt, decisionIdempotency])
    assert(decision.rows[0]?.id, 'RPC de decisão não retornou id')
    const decisionRetry = await client.query(`
      select public.bula_fechamento_add_decision(
        $1::uuid, $2::uuid, 'vgv_total'::text, 'defer'::text, null::uuid, null::jsonb,
        'dry_run_validation'::text, '{}'::uuid[], '{}'::uuid[], null::uuid,
        $3::timestamptz, $4::text
      ) as id
    `, [row.id, row.cronograma_id, decisionDueAt, decisionIdempotency])
    assert(decisionRetry.rows[0]?.id === decision.rows[0].id, 'retry de decisão não retornou a decisão original')

    const supersedingDecisionIdempotency = randomUUID()
    const supersedingDecisionParams = [
      row.id,
      row.cronograma_id,
      decision.rows[0].id,
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      supersedingDecisionIdempotency,
    ]
    const supersedingDecision = await client.query(`
      select public.bula_fechamento_add_decision(
        $1::uuid, $2::uuid, 'vgv_total'::text, 'defer'::text, null::uuid, null::jsonb,
        'dry_run_validation_supersede'::text, array[$3::uuid], '{}'::uuid[], null::uuid,
        $4::timestamptz, $5::text
      ) as id
    `, supersedingDecisionParams)
    const supersedingDecisionRetry = await client.query(`
      select public.bula_fechamento_add_decision(
        $1::uuid, $2::uuid, 'vgv_total'::text, 'defer'::text, null::uuid, null::jsonb,
        'dry_run_validation_supersede'::text, array[$3::uuid], '{}'::uuid[], null::uuid,
        $4::timestamptz, $5::text
      ) as id
    `, supersedingDecisionParams)
    assert(
      supersedingDecisionRetry.rows[0]?.id === supersedingDecision.rows[0]?.id,
      'retry de decisão superseded não retornou a decisão original'
    )

    const proposedVgv = (Number(row.vgv_total ?? 0) + 0.01).toFixed(2)
    const writeIdempotency = randomUUID()
    const write = await client.query(`
      select * from public.bula_fechamento_write_governado(
        'update'::text, $1::uuid, $2::bigint, jsonb_build_object('vgv_total', $3::numeric),
        'dry_run_validation'::text, $4::text, null::uuid, null::uuid
      )
    `, [row.id, row.revision, proposedVgv, writeIdempotency])
    assert(write.rowCount === 1, 'writer governado não retornou exatamente uma linha')
    assert(Number(write.rows[0].revision) === Number(row.revision) + 1, 'revisão não avançou exatamente uma unidade')
    const writeRetry = await client.query(`
      select * from public.bula_fechamento_write_governado(
        'update'::text, $1::uuid, $2::bigint, jsonb_build_object('vgv_total', $3::numeric),
        'dry_run_validation'::text, $4::text, null::uuid, null::uuid
      )
    `, [row.id, row.revision, proposedVgv, writeIdempotency])
    assert(
      writeRetry.rowCount === 1 && Number(writeRetry.rows[0].revision) === Number(write.rows[0].revision),
      'retry de write avançou revisão ou não devolveu a mesma linha lógica'
    )

    await client.query('savepoint write_token_collision_check')
    let writeCollisionBlocked = false
    try {
      await client.query(`
        select * from public.bula_fechamento_write_governado(
          'update'::text, $1::uuid, $2::bigint, jsonb_build_object('vgv_total', $3::numeric),
          'dry_run_validation'::text, $4::text, null::uuid, null::uuid
        )
      `, [row.id, row.revision, (Number(proposedVgv) + 0.01).toFixed(2), writeIdempotency])
    } catch (error) {
      writeCollisionBlocked = error?.code === '23505'
      await client.query('rollback to savepoint write_token_collision_check')
    }
    await client.query('release savepoint write_token_collision_check')
    assert(writeCollisionBlocked, 'mesmo request_id aceitou outro payload de fechamento')

    const secondVgv = (Number(proposedVgv) + 0.01).toFixed(2)
    const secondWrite = await client.query(`
      select * from public.bula_fechamento_write_governado(
        'update'::text, $1::uuid, $2::bigint, jsonb_build_object('vgv_total', $3::numeric),
        'dry_run_validation_second'::text, $4::text, null::uuid, null::uuid
      )
    `, [row.id, write.rows[0].revision, secondVgv, randomUUID()])
    const oldWriteAfterAdvance = await client.query(`
      select * from public.bula_fechamento_write_governado(
        'update'::text, $1::uuid, $2::bigint, jsonb_build_object('vgv_total', $3::numeric),
        'dry_run_validation'::text, $4::text, null::uuid, null::uuid
      )
    `, [row.id, row.revision, proposedVgv, writeIdempotency])
    assert(
      Number(secondWrite.rows[0].revision) === Number(write.rows[0].revision) + 1
      && Number(oldWriteAfterAdvance.rows[0].revision) === Number(secondWrite.rows[0].revision)
      && Number(oldWriteAfterAdvance.rows[0].vgv_total) === Number(secondVgv),
      'replay antigo após nova revisão repetiu efeito ou devolveu estado obsoleto'
    )
    await client.query('reset role')

    const audit = await client.query(`
      select id, attributed, writer_kind, database_role, evidence_bound, unbound_material_fields, context
        from public.bula_fechamento_versoes
       where fechamento_id = $1 and revision = $2
    `, [row.id, Number(row.revision) + 1])
    assert(audit.rowCount === 1, 'versão transacional ausente')
    assert(audit.rows[0].attributed === true, 'writer governado ficou sem atribuição')
    assert(audit.rows[0].context?.writer_context_asserted === true, 'writer governado perdeu a declaração estrutural')
    assert(audit.rows[0].writer_kind === 'human-api', 'writer_kind governado incorreto')
    assert(audit.rows[0].evidence_bound === false, 'mudança material sem fonte foi certificada indevidamente')
    assert(audit.rows[0].unbound_material_fields.includes('vgv_total'), 'campo material sem fonte não foi delimitado')

    // Exercita a vida completa de uma prova retroativa: link exato, validade
    // corrente, retração pela mesma autoridade e pendência reaberta. Tudo fica
    // dentro desta transação e é revertido ao final.
    const snapshotId = randomUUID()
    const claimId = randomUUID()
    const contentHash = createHash('sha256').update(`dry-run:${snapshotId}`).digest('hex')
    const sourceKey = createHash('sha256').update(`source:${snapshotId}`).digest('hex')
    const snapshotIdempotency = createHash('sha256').update(`snapshot:${snapshotId}`).digest('hex')
    const snapshot = await client.query(`
      insert into public.bula_fechamento_snapshots (
        id, source_kind, source_key, source_locator, source_version,
        artifact_path, artifact_mime, content_sha256, source_authority_id,
        lineage_root_id, payload, data_classification, contains_personal_data,
        retention_until, encryption_key_ref, producer_name, producer_version,
        captured_at, captured_by, idempotency_key
      )
      select
        $1::uuid, 'erp_baseline', $2::text, '{}'::jsonb, 'dry-run-v1',
        ('fechamento-evidence/' || $3::text), 'application/json', $3::text,
        a.id, $1::uuid, '{}'::jsonb, 'restricted', true,
        clock_timestamp() + interval '30 days', 'kms:dry-run-validation',
        'dry-run-validator', 'v1', clock_timestamp(), $4::uuid, $5::text
      from public.bula_fechamento_source_authorities a
      where a.authority_key = 'erp:operational-baseline'
      returning id
    `, [snapshotId, sourceKey, contentHash, actorId, snapshotIdempotency])
    assert(snapshot.rowCount === 1, 'snapshot owner-only de validação não foi criado')

    await client.query('savepoint noncanonical_effective_at_check')
    let noncanonicalClaimBlocked = false
    try {
      await client.query(`
        insert into public.bula_fechamento_claims (
          id, snapshot_id, cronograma_id, fechamento_id, subject_kind,
          subject_key, field_key, scope_kind, scope, accounting_basis,
          currency, effective_at, observed_at, value, unit, confidence,
          certainty_kind, claim_sha256
        ) values (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'fechamento',
          'fechamento', 'vgv_total', 'cobertura_bula',
          jsonb_build_object('applies_to', 'cobertura_bula'), 'operacional',
          'BRL', (
            coalesce(
              (select c.data from public.cronograma_leiloes c where c.id = $3::uuid),
              $5::date
            )::timestamp at time zone 'America/Sao_Paulo'
          ) + interval '1 hour', clock_timestamp(), to_jsonb($6::numeric),
          'BRL', 1.0, 'exact', repeat('0', 64)
        )
      `, [randomUUID(), snapshotId, row.cronograma_id, row.id, write.rows[0].data, proposedVgv])
    } catch (error) {
      noncanonicalClaimBlocked = error?.code === '23514'
      await client.query('rollback to savepoint noncanonical_effective_at_check')
    }
    await client.query('release savepoint noncanonical_effective_at_check')
    assert(noncanonicalClaimBlocked, 'horários diferentes no mesmo evento esconderiam claims conflitantes')

    const claim = await client.query(`
      insert into public.bula_fechamento_claims (
        id, snapshot_id, cronograma_id, fechamento_id, subject_kind,
        subject_key, field_key, scope_kind, scope, accounting_basis,
        currency, effective_at, observed_at, value, unit, confidence,
        certainty_kind, claim_sha256
      ) values (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'fechamento',
        'fechamento', 'vgv_total', 'cobertura_bula',
        jsonb_build_object('applies_to', 'cobertura_bula'), 'operacional',
        'BRL', (
          coalesce(
            (select c.data from public.cronograma_leiloes c where c.id = $3::uuid),
            $5::date
          )::timestamp at time zone 'America/Sao_Paulo'
        ), clock_timestamp(), to_jsonb($6::numeric), 'BRL', 1.0,
        'exact', repeat('0', 64)
      )
      returning id
    `, [claimId, snapshotId, row.cronograma_id, row.id, write.rows[0].data, proposedVgv])
    assert(claim.rowCount === 1, 'claim exato de validação não foi criado')

    const reviewIdempotency = randomUUID()
    await client.query('set local role authenticated')
    const review = await client.query(`
      select public.bula_fechamento_add_version_review(
        $1::uuid, $2::uuid, 'material_fields'::text, 'evidence_link'::text,
        array['vgv_total']::text[], $3::uuid, null::uuid, null::uuid,
        'dry_run_exact_link'::text, $4::text
      ) as id
    `, [row.id, audit.rows[0].id, snapshotId, reviewIdempotency])
    assert(review.rows[0]?.id, 'review retroativo não retornou id')
    const reviewRetry = await client.query(`
      select public.bula_fechamento_add_version_review(
        $1::uuid, $2::uuid, 'material_fields'::text, 'evidence_link'::text,
        array['vgv_total']::text[], $3::uuid, null::uuid, null::uuid,
        'dry_run_exact_link'::text, $4::text
      ) as id
    `, [row.id, audit.rows[0].id, snapshotId, reviewIdempotency])
    assert(reviewRetry.rows[0]?.id === review.rows[0].id, 'retry de version review não retornou o review original')
    await client.query('reset role')

    const currentValidity = await client.query(`
      select evidence_status, valid_fields, stale_fields
        from public.bula_fechamento_version_reviews_validade_v
       where id = $1::uuid
    `, [review.rows[0].id])
    assert(currentValidity.rows[0]?.evidence_status === 'current', 'evidência exata nasceu inválida')
    assert(currentValidity.rows[0].valid_fields.includes('vgv_total'), 'campo exato não ficou válido')

    await client.query(`
      insert into public.bula_fechamento_claims (
        id, snapshot_id, cronograma_id, fechamento_id, subject_kind,
        subject_key, field_key, scope_kind, scope, accounting_basis,
        currency, effective_at, observed_at, value, unit, confidence,
        certainty_kind, claim_sha256, relation_kind, supersedes_id
      )
      select
        $1::uuid, c.snapshot_id, c.cronograma_id, c.fechamento_id,
        c.subject_kind, c.subject_key, c.field_key, c.scope_kind, c.scope,
        c.accounting_basis, c.currency, c.effective_at, clock_timestamp(),
        c.value, c.unit, c.confidence, c.certainty_kind, repeat('0', 64),
        'retracted', c.id
      from public.bula_fechamento_claims c
      where c.id = $2::uuid
    `, [randomUUID(), claimId])

    const staleValidity = await client.query(`
      select evidence_status, valid_fields, stale_fields
        from public.bula_fechamento_version_reviews_validade_v
       where id = $1::uuid
    `, [review.rows[0].id])
    assert(staleValidity.rows[0]?.evidence_status === 'stale', 'prova retirada continuou certificando a versão')
    assert(staleValidity.rows[0].stale_fields.includes('vgv_total'), 'campo retirado não foi marcado stale')

    await client.query(`select set_config('request.jwt.claims', $1, true)`, [jwt])
    await client.query('set local role authenticated')
    const staleReviewRetry = await client.query(`
      select public.bula_fechamento_add_version_review(
        $1::uuid, $2::uuid, 'material_fields'::text, 'evidence_link'::text,
        array['vgv_total']::text[], $3::uuid, null::uuid, null::uuid,
        'dry_run_exact_link'::text, $4::text
      ) as id
    `, [row.id, audit.rows[0].id, snapshotId, reviewIdempotency])
    assert(staleReviewRetry.rows[0]?.id === review.rows[0].id, 'retry de review após retração não retornou o histórico original')

    await client.query('savepoint stale_review_new_token_check')
    let staleReviewRejected = false
    try {
      await client.query(`
        select public.bula_fechamento_add_version_review(
          $1::uuid, $2::uuid, 'material_fields'::text, 'evidence_link'::text,
          array['vgv_total']::text[], $3::uuid, null::uuid, null::uuid,
          'dry_run_exact_link_new'::text, $4::text
        )
      `, [row.id, audit.rows[0].id, snapshotId, randomUUID()])
    } catch (error) {
      staleReviewRejected = error?.code === '23514'
      await client.query('rollback to savepoint stale_review_new_token_check')
    }
    await client.query('release savepoint stale_review_new_token_check')
    await client.query('reset role')
    assert(staleReviewRejected, 'nova review certificou uma evidência já retraída')

    const reopened = await client.query(`
      select count(*)::int as total
        from public.bula_fechamento_pendencias_v
       where fechamento_id = $1::uuid
         and tipo = 'evidencia_review_retirada'
    `, [row.id])
    assert(reopened.rows[0].total >= 1, 'retração não reabriu pendência explícita')

    const archiveIdempotency = randomUUID()
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [jwt])
    await client.query('set local role authenticated')
    const archive = await client.query(`
      select * from public.bula_fechamento_write_governado(
        'archive'::text, $1::uuid, $2::bigint,
        jsonb_build_object('archive_reason', 'dry run terminal archive'),
        'manual_archive'::text, $3::text, null::uuid, null::uuid
      )
    `, [row.id, secondWrite.rows[0].revision, archiveIdempotency])
    const archiveRetry = await client.query(`
      select * from public.bula_fechamento_write_governado(
        'archive'::text, $1::uuid, $2::bigint,
        jsonb_build_object('archive_reason', 'dry run terminal archive'),
        'manual_archive'::text, $3::text, null::uuid, null::uuid
      )
    `, [row.id, secondWrite.rows[0].revision, archiveIdempotency])
    await client.query('reset role')
    assert(archive.rowCount === 1 && archive.rows[0].archived_at, 'archive governado não produziu estado terminal')
    assert(
      archiveRetry.rowCount === 1 && archiveRetry.rows[0].revision === archive.rows[0].revision,
      'retry de archive repetiu efeito ou perdeu a linha arquivada'
    )

    const activeQueue = await client.query(`
      select
        (select count(*)::int from public.bula_fechamento_pendencias_v where fechamento_id = $1::uuid) as pending,
        (select count(*)::int from public.bula_fechamento_procedencia_v where fechamento_id = $1::uuid) as provenance,
        (select count(*)::int from public.bula_fechamento_procedencia_historico_v where fechamento_id = $1::uuid) as historical
    `, [row.id])
    assert(activeQueue.rows[0].pending === 0, 'fechamento arquivado permaneceu no backlog ativo')
    assert(activeQueue.rows[0].provenance === 0, 'fechamento arquivado permaneceu na procedência ativa')
    assert(activeQueue.rows[0].historical === 1, 'fechamento arquivado desapareceu da visão histórica')

    await client.query('savepoint archived_terminal_check')
    let terminalBlocked = false
    try {
      await client.query(`
        update public.bula_leilao_fechamento
           set archived_at = null, archived_by = null, archive_reason = null
         where id = $1::uuid
      `, [row.id])
    } catch (error) {
      terminalBlocked = error?.code === '55000'
      await client.query('rollback to savepoint archived_terminal_check')
    }
    await client.query('release savepoint archived_terminal_check')
    assert(terminalBlocked, 'linha arquivada pôde ser reativada por escrita direta')
  }

  await client.query('rollback')
  transactionOpen = false
  console.log('dry-run completo: todas as alterações foram revertidas')
} catch (error) {
  if (transactionOpen) {
    try { await client.query('rollback') } catch { /* conexão pode ter encerrado */ }
  }
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
