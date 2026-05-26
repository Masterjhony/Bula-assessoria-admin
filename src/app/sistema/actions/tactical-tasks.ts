'use server';

import { createClient } from '@/utils/supabase/server';

import { revalidatePath } from 'next/cache';

export interface TacticalColumn {
    id: string;
    title: string;
    position: number;
    created_at: string;
}

export interface TacticalComment {
    id: string;
    task_id: string;
    profile_id: string;
    content: string;
    created_at: string;
    profiles?: {
        full_name: string;
        email: string;
    };
}


export interface TacticalAttachment {
    id: string;
    task_id: string;
    file_name: string;
    file_url: string;
    file_path: string;
    file_type?: string;
    file_size?: number;
    uploaded_by?: string;
    created_at: string;
}

/** Operação dona da tarefa — separa o board de Projetos em dois. */
export type TacticalUnidade = 'formula_boi' | 'bula_formula';

export interface TacticalTask {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    /** Board ao qual a tarefa pertence. Ausente = 'formula_boi' (legado). */
    unidade?: TacticalUnidade;
    start_date?: string;
    due_date?: string;
    assignees?: string[];
    position: number;
    created_at: string;
    checklists?: { id: string, title: string, completed: boolean, assignee?: string | null, due_date?: string | null }[];
    tactical_task_comments?: { count: number }[];
    tactical_task_attachments?: { count: number }[];
    // ICE Scoring
    ice_impact?: number;
    ice_confidence?: number;
    ice_ease?: number;
    // Dependencies & Strategy
    depends_on?: string[];
    strategic_stage?: string;
    status_changed_at?: string;
    // Origem WhatsApp
    whatsapp_group_id?: string;
    whatsapp_group_name?: string;
    whatsapp_sender?: string;
    whatsapp_sender_name?: string;
    // Arquivamento
    archived_at?: string | null;
}

export async function getTasks() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_tasks')
        .select('*, tactical_task_comments(count), tactical_task_attachments(count)')
        .is('archived_at', null)
        .order('position', { ascending: true }); // We might want to order by status then position, or handle sorting in JS

    if (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }

    return data as TacticalTask[];
}

export async function getArchivedTasks() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_tasks')
        .select('*, tactical_task_comments(count), tactical_task_attachments(count)')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });

    if (error) {
        console.error('Error fetching archived tasks:', error);
        return [];
    }

    return data as TacticalTask[];
}

export async function archiveTask(id: string) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('tactical_tasks')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        console.error('Error archiving task:', error);
        throw new Error('Failed to archive task');
    }

    revalidatePath('/web-admin/projetos');
}

export async function unarchiveTask(id: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_tasks')
        .update({ archived_at: null })
        .eq('id', id)
        .select('*, tactical_task_comments(count), tactical_task_attachments(count)')
        .single();

    if (error) {
        console.error('Error unarchiving task:', error);
        throw new Error('Failed to unarchive task');
    }

    revalidatePath('/web-admin/projetos');
    return data as TacticalTask;
}

export async function createTask(task: Omit<TacticalTask, 'id' | 'created_at'>) {
    const supabase = await createClient();

    // Get max position to append — escopado ao board (unidade) + status
    const { data: maxPosData } = await supabase
        .from('tactical_tasks')
        .select('position')
        .eq('status', task.status)
        .eq('unidade', task.unidade ?? 'formula_boi')
        .order('position', { ascending: false })
        .limit(1)
        .single();

    const newPosition = (maxPosData?.position || 0) + 1000;

    const { data, error } = await supabase
        .from('tactical_tasks')
        .insert({ ...task, position: newPosition })
        .select()
        .single();

    if (error) {
        console.error('Error creating task:', error);
        throw new Error('Failed to create task');
    }

    revalidatePath('/web-admin/projetos');
    return data as TacticalTask;
}

export async function updateTask(id: string, updates: Partial<TacticalTask>) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('tactical_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating task:', error);
        throw new Error('Failed to update task');
    }

    revalidatePath('/web-admin/projetos');
    return data;
}

export async function moveTask(id: string, newStatus: string, newPosition: number) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('tactical_tasks')
        .update({ status: newStatus, position: newPosition })
        .eq('id', id);

    if (error) {
        console.error('Error moving task:', error);
        throw new Error('Failed to move task');
    }

    revalidatePath('/web-admin/projetos');
}

export async function deleteTask(id: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('tactical_tasks')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting task:', error);
        throw new Error('Failed to delete task');
    }

    revalidatePath('/web-admin/projetos');
}

export async function getProfiles() {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .neq('role', 'user');

    if (error) {
        // If profiles table isn't readable or fields missing, return empty or handle.
        // For now, log and return empty.
        console.error('Error fetching internal profiles:', error);
        return [];
    }

    return data;
}

// --- Columns Actions ---
export async function getColumns() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_kanban_columns')
        .select('*')
        .order('position', { ascending: true });

    if (error) {
        console.error('Error fetching columns:', error);
        return [];
    }
    return data as TacticalColumn[];
}

export async function createColumn(title: string) {
    const supabase = await createClient();

    // Get max position to append
    const { data: maxPosData } = await supabase
        .from('tactical_kanban_columns')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .single();

    const newPosition = (maxPosData?.position || 0) + 1000;

    const { data, error } = await supabase
        .from('tactical_kanban_columns')
        .insert({ title, position: newPosition })
        .select()
        .single();

    if (error) {
        console.error('Error creating column:', error);
        throw new Error('Failed to create column');
    }

    revalidatePath('/web-admin/projetos');
    return data as TacticalColumn;
}

export async function updateColumn(id: string, title: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_kanban_columns')
        .update({ title })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating column:', error);
        throw new Error('Failed to update column');
    }

    revalidatePath('/web-admin/projetos');
    return data as TacticalColumn;
}

export async function deleteColumn(id: string) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('tactical_kanban_columns')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting column:', error);
        throw new Error('Failed to delete column');
    }

    revalidatePath('/web-admin/projetos');
}

// --- Comments Actions ---
export async function getComments(taskId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_task_comments')
        .select('*, profiles(full_name, email)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching comments:', error);
        return [];
    }
    return data as TacticalComment[];
}

export async function addComment(taskId: string, content: string) {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
        throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
        .from('tactical_task_comments')
        .insert({
            task_id: taskId,
            profile_id: userData.user.id,
            content
        })
        .select('*, profiles(full_name, email)')
        .single();

    if (error) {
        console.error('Error adding comment:', error);
        throw new Error('Failed to add comment');
    }

    revalidatePath('/web-admin/projetos');
    return data as TacticalComment;
}

// --- Attachments Actions ---
export async function getAttachments(taskId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('tactical_task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching attachments:', error);
        return [];
    }
    return data as TacticalAttachment[];
}

export async function saveAttachmentRecord(
    taskId: string,
    fileName: string,
    fileUrl: string,
    filePath: string,
    fileType: string,
    fileSize: number
) {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('tactical_task_attachments')
        .insert({
            task_id: taskId,
            file_name: fileName,
            file_url: fileUrl,
            file_path: filePath,
            file_type: fileType,
            file_size: fileSize,
            uploaded_by: userData?.user?.id ?? null,
        })
        .select()
        .single();

    if (error) {
        console.error('[saveAttachment] error:', error);
        throw new Error(`Failed to save attachment: ${error.message}`);
    }

    revalidatePath('/web-admin/projetos');
    return data as TacticalAttachment;
}

export async function deleteAttachment(attachmentId: string, filePath: string) {
    const supabase = await createClient();

    const { error: storageError } = await supabase.storage
        .from('tactical-attachments')
        .remove([filePath]);

    if (storageError) {
        console.error('Error deleting file from storage:', storageError);
        // Continue to delete DB record even if storage fails
    }

    const { error } = await supabase
        .from('tactical_task_attachments')
        .delete()
        .eq('id', attachmentId);

    if (error) {
        console.error('Error deleting attachment record:', error);
        throw new Error('Failed to delete attachment');
    }

    revalidatePath('/web-admin/projetos');
}
