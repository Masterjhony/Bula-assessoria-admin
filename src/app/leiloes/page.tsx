export { default } from '../agenda/page'

// `revalidate` NÃO pode ser reexportado: o Next lê esse valor estaticamente em
// tempo de compilação e, a partir da 16, falha o build em vez de só avisar
// ("can't recognize the exported `revalidate` field in route"). Tem que ser um
// literal declarado aqui mesmo.
//
// Mantenha igual ao de ../agenda/page.tsx — é a mesma página servida em dois
// caminhos, e valores diferentes dariam idades de cache diferentes pra ela.
export const revalidate = 120
