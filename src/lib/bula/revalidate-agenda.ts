import { revalidatePath } from 'next/cache'

/**
 * Invalida o cache (ISR) das paginas publicas da agenda apos uma mutacao no
 * admin, para que a alteracao apareca de imediato em vez de esperar o
 * `revalidate` por tempo. Cobre a listagem (/agenda) e os detalhes
 * (/agenda/[id]).
 */
export function revalidateAgendaPublica() {
    revalidatePath('/agenda')
    revalidatePath('/agenda/[id]', 'page')
}
