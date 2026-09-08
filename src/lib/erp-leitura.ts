/** Cada página precisa chegar: um subtotal nunca representa uma consulta completa. */
export async function leituraCompleta<T>(consulta: () => {
  order(column: string): {
    range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  }
}) {
  const rows: T[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await consulta().order('id').range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Consulta financeira não retornou dados')
    rows.push(...data)
    if (data.length < pageSize) return { data: rows, error: null }
  }
}
