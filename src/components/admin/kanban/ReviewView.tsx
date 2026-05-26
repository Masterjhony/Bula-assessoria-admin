'use client';

import { useState, useMemo } from 'react';
import { TacticalTask, TacticalColumn } from '@/app/sistema/actions/tactical-tasks';
import {
  TacticalRisk, TacticalDecision,
  createRisk, updateRisk, deleteRisk,
  createDecision, updateDecision, deleteDecision,
} from '@/app/sistema/actions/tactical-strategic';
import {
  ClipboardList, AlertTriangle, BookOpen, Plus, Trash2, Edit2, Check, X, CheckCircle2, Clock, XCircle, ShieldAlert
} from 'lucide-react';

type SubTab = 'review' | 'risks' | 'decisions';

interface Props {
  tasks: TacticalTask[];
  columns: TacticalColumn[];
  risks: TacticalRisk[];
  decisions: TacticalDecision[];
  onRisksChange: (r: TacticalRisk[]) => void;
  onDecisionsChange: (d: TacticalDecision[]) => void;
}

// ─── Weekly Review ─────────────────────────────────────────────────────────────

function WeeklyReviewTab({ tasks, columns }: { tasks: TacticalTask[]; columns: TacticalColumn[] }) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const doneStatus = columns.find(c =>
    c.title.toLowerCase().includes('complet') || c.title.toLowerCase().includes('conclu')
  )?.title;

  const { completed, overdue, stale, cancelled } = useMemo(() => {
    const completed = tasks.filter(t =>
      t.status === doneStatus && new Date(t.created_at) >= weekAgo
    );
    const overdue = tasks.filter(t => {
      if (!t.due_date || t.status === doneStatus) return false;
      return new Date(t.due_date) < now;
    });
    const stale = tasks.filter(t => {
      if (t.status === doneStatus) return false;
      const ref = new Date(t.status_changed_at || t.created_at);
      return (now.getTime() - ref.getTime()) / 86400000 > 7;
    });
    const cancelled: TacticalTask[] = []; // placeholder
    return { completed, overdue, stale, cancelled };
  }, [tasks, columns]);

  const weekScore = () => {
    if (completed.length === 0 && overdue.length === 0) return { label: 'Sem dados suficientes', color: 'text-gray-400' };
    if (overdue.length > completed.length) return { label: 'Semana Crítica ⚠️', color: 'text-red-500' };
    if (completed.length > 3 && overdue.length === 0) return { label: 'Semana Produtiva! 🚀', color: 'text-emerald-500' };
    if (completed.length > 0 && overdue.length <= 2) return { label: 'Semana Moderada', color: 'text-amber-500' };
    return { label: 'Semana Baixa', color: 'text-red-400' };
  };

  const score = weekScore();

  const Section = ({
    icon, label, items, color, emptyMsg
  }: {
    icon: React.ReactNode; label: string; items: TacticalTask[]; color: string; emptyMsg: string
  }) => (
    <div>
      <h4 className={`flex items-center gap-2 font-semibold text-sm mb-3 ${color}`}>
        {icon} {label}
        <span className="ml-auto text-xs font-normal text-gray-400">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 pl-6">{emptyMsg}</p>
      ) : (
        <ul className="space-y-1.5 pl-2">
          {items.map(t => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.replace('text-', 'bg-')}`} />
              <span className="text-gray-700 dark:text-gray-300 truncate">{t.title}</span>
              {t.priority === 'Alta' && <span className="text-[10px] text-red-500 font-bold shrink-0">Alta</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="bg-white dark:bg-[#262626] rounded-2xl p-5 border border-gray-200 dark:border-[#2e2e2e]">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Avaliação da Semana</p>
        <p className={`text-2xl font-bold ${score.color}`}>{score.label}</p>
        <p className="text-sm text-gray-500 mt-1">
          {completed.length} concluída{completed.length !== 1 ? 's' : ''} · {overdue.length} atrasada{overdue.length !== 1 ? 's' : ''} · {stale.length} parada{stale.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="bg-white dark:bg-[#262626] rounded-2xl p-5 border border-gray-200 dark:border-[#2e2e2e] space-y-5">
        <Section
          icon={<CheckCircle2 size={15} />}
          label="Concluídas esta semana"
          items={completed}
          color="text-emerald-600 dark:text-emerald-400"
          emptyMsg="Nenhuma tarefa concluída nos últimos 7 dias."
        />
        <div className="border-t border-gray-100 dark:border-[#2e2e2e]" />
        <Section
          icon={<Clock size={15} />}
          label="Atrasadas"
          items={overdue}
          color="text-red-600 dark:text-red-400"
          emptyMsg="Nenhuma tarefa atrasada. Ótimo!"
        />
        <div className="border-t border-gray-100 dark:border-[#2e2e2e]" />
        <Section
          icon={<XCircle size={15} />}
          label="Paradas há mais de 7 dias"
          items={stale}
          color="text-amber-600 dark:text-amber-400"
          emptyMsg="Nenhuma tarefa parada. Excelente fluxo!"
        />
      </div>

      {stale.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle size={14} /> Sugestão: considere cancelar ou revisar prioridade das tarefas paradas.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Risk Matrix ──────────────────────────────────────────────────────────────

const PROB_ROWS = ['alta', 'media', 'baixa'] as const;
const IMPACT_COLS = ['baixo', 'medio', 'alto'] as const;

const PROB_LABELS: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const IMPACT_LABELS: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };

function matrixCellStyle(prob: string, impact: string) {
  const pi = ['baixa', 'media', 'alta'].indexOf(prob);
  const ii = ['baixo', 'medio', 'alto'].indexOf(impact);
  const score = pi + ii;
  if (score >= 4) return { bg: 'bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20', dot: 'bg-red-500', label: 'Crítico' };
  if (score >= 3) return { bg: 'bg-orange-100 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20', dot: 'bg-orange-500', label: 'Alto' };
  if (score >= 2) return { bg: 'bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20', dot: 'bg-amber-500', label: 'Moderado' };
  if (score >= 1) return { bg: 'bg-yellow-50 dark:bg-yellow-500/5 border-yellow-200 dark:border-yellow-500/15', dot: 'bg-yellow-400', label: 'Baixo' };
  return { bg: 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/15', dot: 'bg-emerald-500', label: 'Mínimo' };
}

function RiskMatrix({ risks }: { risks: TacticalRisk[] }) {
  const active = risks.filter(r => r.status === 'active');
  if (active.length === 0) return null;

  return (
    <div className="bg-white dark:bg-[#222222] rounded-2xl border border-gray-200 dark:border-[#2e2e2e] p-4 mb-4">
      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
        Matriz de Risco — Probabilidade × Impacto
      </p>
      <div className="flex gap-2">
        {/* Y-axis label */}
        <div className="flex flex-col justify-around pb-5 pr-1">
          {PROB_ROWS.map(p => (
            <span key={p} className="text-[10px] text-gray-400 font-medium w-8 text-right leading-none">
              {PROB_LABELS[p]}
            </span>
          ))}
        </div>
        <div className="flex-1">
          {/* Matrix grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {PROB_ROWS.map(prob =>
              IMPACT_COLS.map(impact => {
                const cell = matrixCellStyle(prob, impact);
                const cellRisks = active.filter(r => r.probability === prob && r.impact === impact);
                return (
                  <div
                    key={`${prob}-${impact}`}
                    className={`relative rounded-xl border p-2.5 min-h-[52px] flex flex-col justify-between ${cell.bg}`}
                    title={cellRisks.map(r => r.title).join('\n') || undefined}
                  >
                    {cellRisks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {cellRisks.slice(0, 3).map(r => (
                          <span key={r.id} className={`w-2 h-2 rounded-full ${cell.dot} shrink-0`} />
                        ))}
                        {cellRisks.length > 3 && (
                          <span className="text-[9px] text-gray-400">+{cellRisks.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-end justify-between">
                      {cellRisks.length > 0 ? (
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{cellRisks.length}</span>
                      ) : (
                        <span className="text-[10px] text-gray-300 dark:text-gray-700">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {/* X-axis labels */}
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {IMPACT_COLS.map(i => (
              <span key={i} className="text-[10px] text-gray-400 font-medium text-center leading-none">
                {IMPACT_LABELS[i]}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-0.5">← Impacto →</p>
        </div>
      </div>
    </div>
  );
}

// ─── Risks ────────────────────────────────────────────────────────────────────

function RisksTab({ risks, onRisksChange }: { risks: TacticalRisk[]; onRisksChange: (r: TacticalRisk[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<TacticalRisk, 'id' | 'created_at'>>({
    title: '', description: '', probability: 'media', impact: 'medio', mitigation: '', status: 'active'
  });

  const resetForm = () => setForm({ title: '', description: '', probability: 'media', impact: 'medio', mitigation: '', status: 'active' });

  const handleSave = async () => {
    if (!form.title.trim()) return;
    if (editId) {
      const updated = await updateRisk(editId, form);
      onRisksChange(risks.map(r => r.id === editId ? updated : r));
      setEditId(null);
    } else {
      const created = await createRisk(form);
      onRisksChange([created, ...risks]);
    }
    resetForm(); setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este risco?')) return;
    await deleteRisk(id);
    onRisksChange(risks.filter(r => r.id !== id));
  };

  const handleEdit = (r: TacticalRisk) => {
    setForm({ title: r.title, description: r.description || '', probability: r.probability, impact: r.impact, mitigation: r.mitigation || '', status: r.status });
    setEditId(r.id);
    setShowForm(true);
  };

  const riskLevel = (prob: string, impact: string) => {
    const score = ['baixa', 'media', 'alta'].indexOf(prob) + ['baixo', 'medio', 'alto'].indexOf(impact);
    if (score >= 3) return { label: 'Crítico', color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20' };
    if (score >= 1) return { label: 'Moderado', color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20' };
    return { label: 'Baixo', color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20' };
  };

  const activeRisks = risks.filter(r => r.status === 'active');
  const hasCritical = activeRisks.some(r => {
    const level = riskLevel(r.probability, r.impact);
    return level.label === 'Crítico';
  });

  const FormRow = () => (
    <div className="bg-gray-50 dark:bg-[#1d1d1d] rounded-xl p-4 space-y-3 border border-[#A0792E]/30">
      <input
        autoFocus
        value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        placeholder="Título do risco"
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white"
      />
      <textarea
        value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        placeholder="Descrição"
        rows={2}
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white resize-none"
      />
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Probabilidade</label>
          <select value={form.probability} onChange={e => setForm(p => ({ ...p, probability: e.target.value }))}
            className="px-3 py-1.5 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none text-gray-900 dark:text-white">
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Impacto</label>
          <select value={form.impact} onChange={e => setForm(p => ({ ...p, impact: e.target.value }))}
            className="px-3 py-1.5 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none text-gray-900 dark:text-white">
            <option value="baixo">Baixo</option>
            <option value="medio">Médio</option>
            <option value="alto">Alto</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="px-3 py-1.5 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none text-gray-900 dark:text-white">
            <option value="active">Ativo</option>
            <option value="mitigated">Mitigado</option>
            <option value="accepted">Aceito</option>
          </select>
        </div>
      </div>
      <textarea
        value={form.mitigation}
        onChange={e => setForm(p => ({ ...p, mitigation: e.target.value }))}
        placeholder="Plano de mitigação"
        rows={2}
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white resize-none"
      />
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!form.title.trim()} className="px-4 py-2 bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black rounded-lg text-sm font-bold disabled:opacity-50">
          <Check size={14} className="inline mr-1" /> Salvar
        </button>
        <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="px-4 py-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {hasCritical && (
            <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
              <ShieldAlert size={14} /> Riscos críticos ativos — ação necessária
            </div>
          )}
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); resetForm(); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black rounded-xl text-sm font-bold"
        >
          <Plus size={14} /> Novo Risco
        </button>
      </div>

      {showForm && !editId && <FormRow />}

      <RiskMatrix risks={risks} />

      {risks.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <ShieldAlert size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum risco registrado.</p>
        </div>
      )}

      <div className="space-y-3">
        {risks.map(r => {
          const level = riskLevel(r.probability, r.impact);
          const statusLabels: Record<string, string> = { active: 'Ativo', mitigated: 'Mitigado', accepted: 'Aceito' };
          return (
            <div key={r.id}>
              {editId === r.id && showForm ? <FormRow /> : (
                <div className={`bg-white dark:bg-[#262626] rounded-xl p-4 border border-gray-200 dark:border-[#2e2e2e] ${r.status !== 'active' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{r.title}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${level.color}`}>{level.label}</span>
                        <span className="text-[10px] text-gray-400">{statusLabels[r.status] || r.status}</span>
                      </div>
                      {r.description && <p className="text-xs text-gray-500 mb-1">{r.description}</p>}
                      <div className="flex gap-3 text-[11px] text-gray-400">
                        <span>Prob.: <b className="text-gray-600 dark:text-gray-300">{r.probability}</b></span>
                        <span>Impacto: <b className="text-gray-600 dark:text-gray-300">{r.impact}</b></span>
                      </div>
                      {r.mitigation && (
                        <p className="text-xs text-gray-500 mt-1.5">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Mitigação:</span> {r.mitigation}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleEdit(r)} className="p-1.5 text-gray-300 hover:text-[#A0792E] transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Decisions ────────────────────────────────────────────────────────────────

function DecisionsTab({ decisions, onDecisionsChange }: { decisions: TacticalDecision[]; onDecisionsChange: (d: TacticalDecision[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<TacticalDecision, 'id' | 'created_at'>>({
    decision: '', reason: '', data_basis: '', outcome: '', decided_at: new Date().toISOString().split('T')[0]
  });

  const resetForm = () => setForm({ decision: '', reason: '', data_basis: '', outcome: '', decided_at: new Date().toISOString().split('T')[0] });

  const handleSave = async () => {
    if (!form.decision.trim()) return;
    if (editId) {
      const updated = await updateDecision(editId, form);
      onDecisionsChange(decisions.map(d => d.id === editId ? updated : d));
      setEditId(null);
    } else {
      const created = await createDecision(form);
      onDecisionsChange([created, ...decisions]);
    }
    resetForm(); setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta decisão?')) return;
    await deleteDecision(id);
    onDecisionsChange(decisions.filter(d => d.id !== id));
  };

  const handleEdit = (d: TacticalDecision) => {
    setForm({ decision: d.decision, reason: d.reason || '', data_basis: d.data_basis || '', outcome: d.outcome || '', decided_at: d.decided_at });
    setEditId(d.id);
    setShowForm(true);
  };

  const FormRow = () => (
    <div className="bg-gray-50 dark:bg-[#1d1d1d] rounded-xl p-4 space-y-3 border border-[#A0792E]/30">
      <input
        autoFocus
        value={form.decision}
        onChange={e => setForm(p => ({ ...p, decision: e.target.value }))}
        placeholder="Decisão tomada"
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white"
      />
      <textarea
        value={form.reason}
        onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
        placeholder="Motivo / contexto"
        rows={2}
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white resize-none"
      />
      <textarea
        value={form.data_basis}
        onChange={e => setForm(p => ({ ...p, data_basis: e.target.value }))}
        placeholder="Base de dados / evidências usadas"
        rows={2}
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white resize-none"
      />
      <textarea
        value={form.outcome}
        onChange={e => setForm(p => ({ ...p, outcome: e.target.value }))}
        placeholder="Resultado posterior (opcional — preencha depois)"
        rows={2}
        className="w-full px-3 py-2 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white resize-none"
      />
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Data:</label>
        <input type="date" value={form.decided_at} onChange={e => setForm(p => ({ ...p, decided_at: e.target.value }))}
          className="px-3 py-1.5 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-lg text-sm outline-none text-gray-900 dark:text-white" />
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!form.decision.trim()} className="px-4 py-2 bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black rounded-lg text-sm font-bold disabled:opacity-50">
          <Check size={14} className="inline mr-1" /> Salvar
        </button>
        <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="px-4 py-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setShowForm(true); setEditId(null); resetForm(); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#A0792E] to-[#D4A85C] text-black rounded-xl text-sm font-bold"
        >
          <Plus size={14} /> Registrar Decisão
        </button>
      </div>

      {showForm && !editId && <FormRow />}

      {decisions.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma decisão registrada.</p>
          <p className="text-sm mt-1">Documente decisões importantes para referência futura.</p>
        </div>
      )}

      <div className="space-y-3">
        {decisions.map(d => (
          <div key={d.id}>
            {editId === d.id && showForm ? <FormRow /> : (
              <div className="bg-white dark:bg-[#262626] rounded-xl p-4 border border-gray-200 dark:border-[#2e2e2e]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">{d.decision}</span>
                      <span className="text-[10px] text-gray-400">{new Date(d.decided_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {d.reason && <p className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-600 dark:text-gray-400">Motivo:</span> {d.reason}</p>}
                    {d.data_basis && <p className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-600 dark:text-gray-400">Base:</span> {d.data_basis}</p>}
                    {d.outcome && (
                      <p className="text-xs mt-2 bg-emerald-50 dark:bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                        <span className="font-medium">Resultado:</span> {d.outcome}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleEdit(d)} className="p-1.5 text-gray-300 hover:text-[#A0792E] transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReviewView({ tasks, columns, risks, decisions, onRisksChange, onDecisionsChange }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('review');

  const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'review', label: 'Revisão Semanal', icon: <ClipboardList size={14} /> },
    { key: 'risks', label: `Riscos${risks.filter(r => r.status === 'active').length > 0 ? ` (${risks.filter(r => r.status === 'active').length})` : ''}`, icon: <AlertTriangle size={14} /> },
    { key: 'decisions', label: 'Decisões', icon: <BookOpen size={14} /> },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-[#262626] p-1 rounded-xl border border-gray-200 dark:border-[#2e2e2e] w-fit shrink-0">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${subTab === t.key
              ? 'bg-white dark:bg-[#363636] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {subTab === 'review' && <WeeklyReviewTab tasks={tasks} columns={columns} />}
        {subTab === 'risks' && <RisksTab risks={risks} onRisksChange={onRisksChange} />}
        {subTab === 'decisions' && <DecisionsTab decisions={decisions} onDecisionsChange={onDecisionsChange} />}
      </div>
    </div>
  );
}
