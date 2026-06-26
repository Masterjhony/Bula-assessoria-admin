/**
 * Cloudflare R2 — cliente S3-compatible para biblioteca de mídia (backups,
 * arquivos grandes). USO EXCLUSIVAMENTE NO SERVIDOR.
 *
 * Usa `aws4fetch` em vez do AWS SDK v3 porque o SDK tem incompatibilidade
 * conhecida no Vercel/Turbopack (deps internas ESM-only sendo `require()`'d
 * pelo CJS xml-builder, quebra com ERR_REQUIRE_ESM em runtime). aws4fetch é
 * SigV4 + fetch puro, recomendado pelo próprio Cloudflare pra R2 em serverless.
 *
 * Convenções:
 * - Todo objeto vive sob R2_PREFIX (default "libmedia/"). As funções aceitam
 *   tanto o "key" completo (ex.: "libmedia/foo.zip") quanto o nome relativo
 *   ao prefixo (ex.: "foo.zip"); internamente é sempre normalizado para o
 *   formato completo antes de falar com o R2.
 * - URLs públicas não existem (bucket privado). Para baixar/compartilhar,
 *   gere uma signed URL via `getR2DownloadUrl`. Para upload direto do browser,
 *   use `getR2UploadUrl` (presigned PUT).
 */

import 'server-only';
import { AwsClient } from 'aws4fetch';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@/utils/supabase/server';

// ── Config & client ────────────────────────────────────────────────────────────

function getEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Variável de ambiente ${name} não configurada.`);
    return v;
}

export function getR2Bucket(): string {
    return getEnv('R2_BUCKET');
}

export function getR2Prefix(): string {
    return (process.env.R2_PREFIX ?? '').replace(/^\/+/, '');
}

function getEndpoint(): string {
    // R2_ENDPOINT é "https://<account>.r2.cloudflarestorage.com" (sem bucket).
    return getEnv('R2_ENDPOINT').replace(/\/+$/, '');
}

function getBucketUrl(): string {
    return `${getEndpoint()}/${getR2Bucket()}`;
}

let _client: AwsClient | null = null;
function getClient(): AwsClient {
    if (_client) return _client;
    _client = new AwsClient({
        accessKeyId: getEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: getEnv('R2_SECRET_ACCESS_KEY'),
        // R2 aceita qualquer região, "auto" é o padrão.
        region: 'auto',
        service: 's3',
    });
    return _client;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export async function assertR2Admin(): Promise<void> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Não autenticado.');
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (profile?.role !== 'admin') throw new Error('Acesso negado.');
}

// ── Key helpers ────────────────────────────────────────────────────────────────

export function resolveR2Key(rawKey: string): string {
    if (!rawKey || typeof rawKey !== 'string') {
        throw new Error('Key inválido.');
    }
    if (rawKey.includes('..') || rawKey.startsWith('/')) {
        throw new Error('Key inválido.');
    }
    const prefix = getR2Prefix();
    const full = rawKey.startsWith(prefix) ? rawKey : `${prefix}${rawKey}`;
    if (!full.startsWith(prefix)) {
        throw new Error('Key fora do prefixo permitido.');
    }
    return full;
}

export function stripR2Prefix(key: string): string {
    const prefix = getR2Prefix();
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

export function sanitizeR2Filename(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9._\-]/g, '_');
    return `${Date.now()}_${cleaned}`;
}

/** Encode key path-style preservando "/" entre segmentos. S3/R2 esperam que
 *  cada segmento seja URL-encoded mas o "/" continue como separador. */
function encodeKey(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
}

// ── Operations ─────────────────────────────────────────────────────────────────

export type R2Object = {
    key: string;
    name: string;
    size: number;
    lastModified: string | null;
    etag: string | null;
};

export type R2ListResult = {
    objects: R2Object[];
    nextToken: string | null;
    truncated: boolean;
};

const xmlParser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    isArray: (name) => name === 'Contents',
});

export async function listR2Objects(opts?: {
    continuationToken?: string;
    maxKeys?: number;
}): Promise<R2ListResult> {
    const client = getClient();
    const prefix = getR2Prefix();
    const u = new URL(getBucketUrl() + '/');
    u.searchParams.set('list-type', '2');
    u.searchParams.set('max-keys', String(opts?.maxKeys ?? 1000));
    if (prefix) u.searchParams.set('prefix', prefix);
    if (opts?.continuationToken) u.searchParams.set('continuation-token', opts.continuationToken);

    const res = await client.fetch(u.toString());
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`R2 list falhou (${res.status}): ${body.slice(0, 200)}`);
    }
    const xml = await res.text();
    const parsed = xmlParser.parse(xml) as {
        ListBucketResult?: {
            Contents?: Array<{
                Key: string;
                Size: string;
                LastModified: string;
                ETag?: string;
            }>;
            IsTruncated?: string;
            NextContinuationToken?: string;
        };
    };
    const result = parsed.ListBucketResult ?? {};
    const objects: R2Object[] = (result.Contents ?? [])
        .filter(o => o.Key && !o.Key.endsWith('/'))
        .map(o => ({
            key: o.Key,
            name: stripR2Prefix(o.Key),
            size: Number(o.Size) || 0,
            lastModified: o.LastModified ?? null,
            etag: o.ETag ?? null,
        }));
    return {
        objects,
        nextToken: result.NextContinuationToken ?? null,
        truncated: result.IsTruncated === 'true',
    };
}

/** Gera URL assinada para DOWNLOAD privado. Default 1h, máx 7 dias (limite S3). */
export async function getR2DownloadUrl(
    rawKey: string,
    opts?: { expiresInSeconds?: number; downloadAs?: string }
): Promise<string> {
    const Key = resolveR2Key(rawKey);
    const expiresIn = Math.min(Math.max(opts?.expiresInSeconds ?? 3600, 60), 7 * 24 * 3600);
    const u = new URL(`${getBucketUrl()}/${encodeKey(Key)}`);
    u.searchParams.set('X-Amz-Expires', String(expiresIn));
    if (opts?.downloadAs) {
        u.searchParams.set(
            'response-content-disposition',
            `attachment; filename="${opts.downloadAs.replace(/"/g, '')}"`
        );
    }
    const signed = await getClient().sign(u.toString(), {
        method: 'GET',
        aws: { signQuery: true },
    });
    return signed.url;
}

/** Gera URL assinada para UPLOAD direto (PUT). Limite single-part: 5GB. */
export async function getR2UploadUrl(
    rawKey: string,
    opts?: { contentType?: string; expiresInSeconds?: number }
): Promise<{ url: string; key: string }> {
    const Key = resolveR2Key(rawKey);
    const expiresIn = Math.min(Math.max(opts?.expiresInSeconds ?? 3600, 60), 24 * 3600);
    const u = new URL(`${getBucketUrl()}/${encodeKey(Key)}`);
    u.searchParams.set('X-Amz-Expires', String(expiresIn));
    const headers: Record<string, string> = {};
    if (opts?.contentType) headers['Content-Type'] = opts.contentType;
    const signed = await getClient().sign(u.toString(), {
        method: 'PUT',
        headers,
        aws: { signQuery: true },
    });
    return { url: signed.url, key: Key };
}

/**
 * Sobe bytes direto para o R2 a partir do servidor (ex.: mídia inbound do
 * WhatsApp baixada da Graph API). Diferente de `getR2UploadUrl` (presigned PUT
 * para o browser), aqui o próprio server assina e entrega o corpo. Retorna a
 * key completa (já com prefixo) para gravar no banco.
 */
export async function putR2Object(
    rawKey: string,
    body: ArrayBuffer | Uint8Array,
    opts?: { contentType?: string }
): Promise<{ key: string }> {
    const Key = resolveR2Key(rawKey);
    const u = `${getBucketUrl()}/${encodeKey(Key)}`;
    // cast: o lib do TS tipa Uint8Array como genérico sobre ArrayBufferLike
    // (que inclui SharedArrayBuffer, não-BlobPart); aqui é sempre buffer comum.
    const blob = new Blob([body as BlobPart], opts?.contentType ? { type: opts.contentType } : undefined);
    const res = await getClient().fetch(u, {
        method: 'PUT',
        body: blob,
        headers: opts?.contentType ? { 'Content-Type': opts.contentType } : {},
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`R2 put falhou (${res.status}): ${text.slice(0, 200)}`);
    }
    return { key: Key };
}

export async function deleteR2Object(rawKey: string): Promise<void> {
    const Key = resolveR2Key(rawKey);
    const u = `${getBucketUrl()}/${encodeKey(Key)}`;
    const res = await getClient().fetch(u, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
        const body = await res.text();
        throw new Error(`R2 delete falhou (${res.status}): ${body.slice(0, 200)}`);
    }
}

export async function headR2Object(rawKey: string) {
    const Key = resolveR2Key(rawKey);
    const u = `${getBucketUrl()}/${encodeKey(Key)}`;
    return getClient().fetch(u, { method: 'HEAD' });
}
