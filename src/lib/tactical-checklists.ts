/**
 * Checklists dos cards de Projetos (Kanban tático).
 *
 * O card guarda os checklists numa coluna jsonb `tactical_tasks.checklists`.
 * Historicamente era uma lista PLANA de itens; agora um card pode ter VÁRIOS
 * checklists nomeados, cada um com seus itens (estilo Trello).
 *
 * Para não quebrar cards antigos (que ainda têm o array plano no banco), toda
 * leitura passa por `normalizeChecklists()` / `flattenChecklistItems()`, que
 * aceitam os dois formatos. O card só é regravado no formato novo quando o
 * usuário edita e salva.
 */

export interface ChecklistItem {
    id: string;
    title: string;
    completed: boolean;
    assignee?: string | null;
    due_date?: string | null;
}

export interface ChecklistGroup {
    id: string;
    title: string;
    items: ChecklistItem[];
}

/** Um elemento é "grupo" quando carrega um array `items`; item plano não tem. */
function isGroup(x: any): x is ChecklistGroup {
    return !!x && typeof x === 'object' && Array.isArray(x.items);
}

/**
 * Devolve sempre uma lista de grupos, aceitando:
 *  - formato novo: `ChecklistGroup[]`
 *  - formato antigo: `ChecklistItem[]` (array plano) → vira 1 grupo "Checklist"
 *  - misto (defensivo): itens soltos entram num grupo "Checklist" no topo
 */
export function normalizeChecklists(raw: any): ChecklistGroup[] {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (raw.every(isGroup)) {
        return raw.map((g) => ({
            id: String(g.id ?? 'default'),
            title: g.title ?? '',
            items: Array.isArray(g.items) ? (g.items as ChecklistItem[]) : [],
        }));
    }

    const groups: ChecklistGroup[] = [];
    const legacyItems: ChecklistItem[] = [];
    for (const el of raw) {
        if (isGroup(el)) groups.push(el);
        else if (el && typeof el === 'object') legacyItems.push(el as ChecklistItem);
    }
    if (legacyItems.length) {
        // id fixo p/ ser determinístico (evita "dirty" falso na detecção de mudança)
        groups.unshift({ id: 'default', title: 'Checklist', items: legacyItems });
    }
    return groups;
}

/** Todos os itens do card, achatando os grupos. Aceita formato antigo e novo. */
export function flattenChecklistItems(raw: any): ChecklistItem[] {
    return normalizeChecklists(raw).flatMap((g) => g.items || []);
}
