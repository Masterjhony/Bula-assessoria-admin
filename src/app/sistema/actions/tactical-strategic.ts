'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TacticalObjective {
  id: string;
  title: string;
  description?: string;
  quarter: string;
  color: string;
  status: string;
  created_at: string;
  key_results?: TacticalKeyResult[];
}

export interface TacticalKeyResult {
  id: string;
  objective_id: string;
  title: string;
  current_value: number;
  target_value: number;
  unit: string;
  created_at: string;
  progress?: number; // computed: current_value / target_value * 100
}

export interface TacticalRisk {
  id: string;
  title: string;
  description?: string;
  probability: string; // baixa | media | alta
  impact: string;      // baixo | medio | alto
  mitigation?: string;
  status: string;      // active | mitigated | accepted
  created_at: string;
}

export interface TacticalDecision {
  id: string;
  decision: string;
  reason?: string;
  data_basis?: string;
  outcome?: string;
  decided_at: string;
  created_at: string;
}

// ─── Objectives ───────────────────────────────────────────────────────────────

export async function getObjectives(): Promise<TacticalObjective[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_objectives')
    .select('*, tactical_key_results(*)')
    .order('created_at', { ascending: true });

  if (error) { console.error('getObjectives:', error); return []; }

  return (data || []).map((obj: any) => ({
    ...obj,
    key_results: (obj.tactical_key_results || []).map((kr: any) => ({
      ...kr,
      progress: kr.target_value > 0
        ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
        : 0,
    })),
  }));
}

export async function createObjective(data: {
  title: string; description?: string; quarter?: string; color?: string;
}) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('tactical_objectives')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as TacticalObjective;
}

export async function updateObjective(id: string, updates: Partial<TacticalObjective>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_objectives')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as TacticalObjective;
}

export async function deleteObjective(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('tactical_objectives').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
}

// ─── Key Results ──────────────────────────────────────────────────────────────

export async function createKeyResult(data: {
  objective_id: string; title: string; target_value?: number; unit?: string;
}) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('tactical_key_results')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as TacticalKeyResult;
}

export async function updateKeyResult(id: string, updates: Partial<TacticalKeyResult>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_key_results')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as TacticalKeyResult;
}

export async function deleteKeyResult(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('tactical_key_results').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
}

// ─── Task → KR Links ──────────────────────────────────────────────────────────

export async function linkTaskToKR(taskId: string, krId: string) {
  const supabase = await createClient();
  await supabase.from('tactical_task_kr_links').upsert({ task_id: taskId, kr_id: krId });
  revalidatePath('/web-admin/projetos');
}

export async function unlinkTaskFromKR(taskId: string, krId: string) {
  const supabase = await createClient();
  await supabase.from('tactical_task_kr_links')
    .delete()
    .eq('task_id', taskId)
    .eq('kr_id', krId);
  revalidatePath('/web-admin/projetos');
}

export async function getTaskKRLinks(taskId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tactical_task_kr_links')
    .select('kr_id')
    .eq('task_id', taskId);
  return (data || []).map((r: any) => r.kr_id);
}

// ─── Risks ────────────────────────────────────────────────────────────────────

export async function getRisks(): Promise<TacticalRisk[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_risks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('getRisks:', error); return []; }
  return data as TacticalRisk[];
}

export async function createRisk(data: Omit<TacticalRisk, 'id' | 'created_at'>) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('tactical_risks')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as TacticalRisk;
}

export async function updateRisk(id: string, updates: Partial<TacticalRisk>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_risks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as TacticalRisk;
}

export async function deleteRisk(id: string) {
  const supabase = await createClient();
  await supabase.from('tactical_risks').delete().eq('id', id);
  revalidatePath('/web-admin/projetos');
}

// ─── Members ──────────────────────────────────────────────────────────────────

export interface TacticalMember {
  id: string;
  name: string;
  role?: string;
  avatar_color: string;
  created_at: string;
}

export async function getMembers(): Promise<TacticalMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_members')
    .select('*')
    .order('name', { ascending: true });
  if (error) { console.error('getMembers:', error); return []; }
  return data as TacticalMember[];
}

export async function createMember(data: { name: string; role?: string; avatar_color?: string }) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('tactical_members')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as TacticalMember;
}

export async function updateMember(id: string, updates: Partial<TacticalMember>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as TacticalMember;
}

export async function deleteMember(id: string) {
  const supabase = await createClient();
  await supabase.from('tactical_members').delete().eq('id', id);
  revalidatePath('/web-admin/projetos');
}

// ─── Strategic Flows ──────────────────────────────────────────────────────────

export interface StrategicStage {
  id: string;
  flow_id: string;
  name: string;
  position: number;
  weight: number;
  color: string;
  created_at: string;
}

export interface StrategicFlow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  created_at: string;
  stages?: StrategicStage[];
}

export async function getFlows(): Promise<StrategicFlow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('strategic_flows')
    .select('*, strategic_stages(*)')
    .order('created_at', { ascending: true });
  if (error) { console.error('getFlows:', error); return []; }
  return (data || []).map((f: any) => ({
    ...f,
    stages: [...(f.strategic_stages || [])].sort((a: StrategicStage, b: StrategicStage) => a.position - b.position),
  }));
}

export async function createFlow(data: { name: string; description?: string }) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('strategic_flows')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as StrategicFlow;
}

export async function updateFlow(id: string, updates: Partial<StrategicFlow>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('strategic_flows')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as StrategicFlow;
}

export async function deleteFlow(id: string) {
  const supabase = await createClient();
  await supabase.from('strategic_flows').delete().eq('id', id);
  revalidatePath('/web-admin/projetos');
}

export async function createStage(data: {
  flow_id: string; name: string; position?: number; weight?: number; color?: string;
}) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('strategic_stages')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as StrategicStage;
}

export async function updateStage(id: string, updates: Partial<StrategicStage>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('strategic_stages')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as StrategicStage;
}

export async function deleteStage(id: string) {
  const supabase = await createClient();
  await supabase.from('strategic_stages').delete().eq('id', id);
  revalidatePath('/web-admin/projetos');
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function getDecisions(): Promise<TacticalDecision[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_decisions')
    .select('*')
    .order('decided_at', { ascending: false });
  if (error) { console.error('getDecisions:', error); return []; }
  return data as TacticalDecision[];
}

export async function createDecision(data: Omit<TacticalDecision, 'id' | 'created_at'>) {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('tactical_decisions')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return result as TacticalDecision;
}

export async function updateDecision(id: string, updates: Partial<TacticalDecision>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tactical_decisions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/web-admin/projetos');
  return data as TacticalDecision;
}

export async function deleteDecision(id: string) {
  const supabase = await createClient();
  await supabase.from('tactical_decisions').delete().eq('id', id);
  revalidatePath('/web-admin/projetos');
}
