export { default, generateMetadata } from '../../agenda/[id]/page'

// Mesmo motivo de ../page.tsx: `revalidate` precisa ser um literal declarado no
// próprio arquivo de rota, senão o build quebra. Mantenha igual ao de
// ../../agenda/[id]/page.tsx.
export const revalidate = 120
