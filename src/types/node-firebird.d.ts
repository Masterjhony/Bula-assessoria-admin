declare module 'node-firebird' {
    export interface FirebirdOptions {
        host: string
        port?: number
        database: string
        user: string
        password: string
        encoding?: string
        lowercase_keys?: boolean
    }
    export interface FirebirdDb {
        query(sql: string, params: unknown[], cb: (err: Error | null, rows: Record<string, unknown>[]) => void): void
        detach(cb?: (err: Error | null) => void): void
    }
    export function attach(options: FirebirdOptions, cb: (err: Error | null, db: FirebirdDb) => void): void
    const firebird: { attach: typeof attach }
    export default firebird
}
