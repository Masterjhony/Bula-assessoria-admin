import { TacticalTask } from '@/app/sistema/actions/tactical-tasks';
import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface GanttViewProps {
    tasks: TacticalTask[];
    onTaskClick: (task: TacticalTask) => void;
}

export function GanttView({ tasks, onTaskClick }: GanttViewProps) {
    const [zoomLevel, setZoomLevel] = useState<number>(48); // default width 48px per day
    const [currentMonth, setCurrentMonth] = useState<Date>(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });

    const ganttTasks = useMemo(() => {
        return tasks
            .filter(t => t.due_date)
            .sort((a, b) => new Date(a.start_date || a.created_at).getTime() - new Date(b.start_date || b.created_at).getTime());
    }, [tasks]);

    // Determine the date range based on the SELECTED month, not just tasks
    const { startDate, endDate, days, monthsHeaders } = useMemo(() => {
        // Start from 15 days before the current month, and go 45 days after to give a good scroll buffer
        const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), -15);
        const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 15);

        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        const daysArray: Date[] = [];
        const monthsMap = new Map<string, number>();

        for (let i = 0; i < totalDays; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            daysArray.push(d);

            const monthKey = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            monthsMap.set(monthKey, (monthsMap.get(monthKey) || 0) + 1);
        }

        const monthsHeaders = Array.from(monthsMap.entries()).map(([label, count]) => ({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            count
        }));

        return { startDate: start, endDate: end, days: daysArray, monthsHeaders };
    }, [currentMonth]);

    const handlePrevMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleToday = () => {
        const today = new Date();
        setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        setZoomLevel(48); // Reset zoom
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Em andamento': return 'bg-blue-500 text-white';
            case 'Completa': return 'bg-emerald-500 text-white';
            case 'Idéias': return 'bg-purple-500 text-white';
            default: return 'bg-amber-400 text-amber-950'; // A fazer
        }
    };

    // Calculate dynamic layout width based on zoom
    const dayWidth = zoomLevel;
    const isSmallZoom = zoomLevel <= 24;

    if (ganttTasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <CalendarIcon size={48} className="mb-4 opacity-50" />
                <p>Nenhuma tarefa com prazo definido.</p>
                <p className="text-sm opacity-70">Adicione uma data de conclusão (Prazo) nas tarefas para visualizá-las aqui.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#3f3f3f] rounded-xl overflow-hidden flex flex-col shadow-sm">
            {/* Toolbar Area */}
            <div className="p-3 border-b border-gray-200 dark:border-[#3f3f3f] bg-gray-50/80 dark:bg-[#1d1d1d]/80 flex flex-wrap items-center justify-between gap-4 shrink-0">

                {/* Month Navigation */}
                <div className="flex items-center gap-2">
                    <button onClick={handlePrevMonth} className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#2e2e2e] rounded transition-colors text-gray-500 dark:text-gray-400">
                        <ChevronLeft size={18} />
                    </button>
                    <button onClick={handleToday} className="px-3 py-1.5 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-[#2e2e2e] rounded transition-colors text-gray-800 dark:text-gray-200 min-w-[140px] text-center capitalize">
                        {currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </button>
                    <button onClick={handleNextMonth} className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#2e2e2e] rounded transition-colors text-gray-500 dark:text-gray-400">
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Legend & Zoom Controls */}
                <div className="flex items-center gap-6">
                    <div className="hidden sm:flex gap-4 text-xs font-medium">
                        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-purple-500 shadow-sm"></div> Idéias</span>
                        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-amber-400 shadow-sm"></div> A fazer</span>
                        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500 shadow-sm"></div> Em andamento</span>
                        <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm"></div> Completa</span>
                    </div>

                    <div className="h-6 w-px bg-gray-300 dark:bg-[#3f3f3f] hidden sm:block"></div>

                    <div className="flex items-center gap-1 bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#3f3f3f] rounded-md p-1 shadow-sm">
                        <button
                            title="Diminuir Zoom"
                            onClick={() => setZoomLevel(Math.max(16, zoomLevel - 8))}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] dark:hover:text-gray-200 rounded transition-colors"
                        >
                            <ZoomOut size={16} />
                        </button>
                        <span className="text-xs font-semibold px-2 w-10 text-center text-gray-600 dark:text-gray-300">
                            {zoomLevel}px
                        </span>
                        <button
                            title="Aumentar Zoom"
                            onClick={() => setZoomLevel(Math.min(96, zoomLevel + 8))}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] dark:hover:text-gray-200 rounded transition-colors"
                        >
                            <ZoomIn size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Gantt Area */}
            <div className="flex-1 overflow-auto custom-scrollbar relative">
                <div className="min-w-max">
                    {/* Header Timeline */}
                    <div className="sticky top-0 bg-white/95 dark:bg-[#262626]/95 backdrop-blur-sm z-20 border-b border-gray-200 dark:border-[#3f3f3f] shadow-sm">
                        {/* Month Headers */}
                        <div className="flex border-b border-gray-100 dark:border-[#2e2e2e]">
                            <div className="w-64 shrink-0 border-r border-gray-200 dark:border-[#3f3f3f] bg-gray-50/80 dark:bg-[#1d1d1d]/80"></div>
                            <div className="flex flex-1">
                                {monthsHeaders.map((month, idx) => (
                                    <div key={idx}
                                        className="py-1 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 border-r border-gray-100 dark:border-[#2e2e2e]"
                                        style={{ width: month.count * dayWidth }}
                                    >
                                        <div className="sticky left-[260px] inline-block">{month.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Days Headers */}
                        <div className="flex">
                            <div className="w-64 shrink-0 border-r border-gray-200 dark:border-[#3f3f3f] p-3 font-semibold text-sm text-gray-700 dark:text-gray-300 flex items-end bg-gray-50/80 dark:bg-[#1d1d1d]/80 tracking-wide uppercase">
                                Tarefas Planejadas
                            </div>
                            <div className="flex flex-1">
                                {days.map((day, i) => {
                                    const isToday = day.toDateString() === new Date().toDateString();
                                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                                    return (
                                        <div
                                            key={i}
                                            style={{ width: dayWidth }}
                                            className={`shrink-0 border-r border-gray-100 dark:border-[#2e2e2e]/50 flex flex-col items-center justify-end pb-2 pt-1
                                                ${isWeekend ? 'bg-gray-50/50 dark:bg-[#212121]/50' : ''}`}
                                        >
                                            {!isSmallZoom && (
                                                <span className={`text-[10px] uppercase font-bold ${isWeekend ? 'text-[#A0792E]/70' : 'text-gray-400'}`}>
                                                    {day.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0, 3)}
                                                </span>
                                            )}
                                            <span className={`text-xs font-bold transition-all duration-200
                                                ${isToday
                                                    ? 'bg-[#A0792E] text-black w-6 h-6 rounded-full flex items-center justify-center mt-1 shadow-md scale-110'
                                                    : `mt-1 ${isWeekend ? 'text-[#A0792E]/80' : 'text-gray-700 dark:text-gray-300'}`
                                                }`}>
                                                {day.getDate()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Gantt Rows */}
                    <div className="relative isolate">
                        {/* Today Marker Line */}
                        {(() => {
                            const today = new Date();
                            const todayDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                            if (todayDiff >= 0 && todayDiff <= days.length) {
                                return (
                                    <div
                                        className="absolute top-0 bottom-0 border-l-[2px] border-[#A0792E]/50 border-dashed z-0 pointer-events-none"
                                        style={{ left: `${256 + (todayDiff * dayWidth) + (dayWidth / 2)}px` }}
                                    />
                                );
                            }
                            return null;
                        })()}

                        {ganttTasks.map((task) => {
                            const tStart = new Date(task.start_date || task.created_at);
                            const tEnd = new Date(task.due_date!);

                            const startOffsetDays = Math.max(0, Math.floor((tStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
                            let endOffsetDays = Math.floor((tEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

                            // Adjust if task ends before visible range or starts after
                            if (endOffsetDays < 0 || startOffsetDays > days.length) return null;

                            // Clip visually
                            const visibleStart = Math.min(days.length, Math.max(0, startOffsetDays));
                            const visibleEnd = Math.max(0, Math.min(days.length, endOffsetDays + 1));
                            const durationDays = visibleEnd - visibleStart;

                            if (durationDays <= 0) return null;

                            const leftPx = visibleStart * dayWidth;
                            const widthPx = durationDays * dayWidth;

                            return (
                                <div key={task.id} className="flex border-b border-gray-100 dark:border-[#2e2e2e] hover:bg-gray-50/50 dark:hover:bg-[#262626]/80 transition-colors group relative z-10">
                                    {/* Task Info Sidebar */}
                                    <div
                                        className="w-64 shrink-0 border-r border-gray-200 dark:border-[#3f3f3f] p-3 cursor-pointer bg-white dark:bg-[#262626]"
                                        onClick={() => onTaskClick(task)}
                                    >
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-[#A0792E] transition-colors leading-snug" title={task.title}>
                                            {task.title}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            {task.assignees && task.assignees.length > 0 && (
                                                <div className="flex -space-x-1.5">
                                                    {task.assignees.slice(0, 3).map((a, i) => (
                                                        <div key={i} className="w-5 h-5 rounded-full bg-gradient-to-br from-[#A0792E] to-[#9A7209] text-black text-[9px] flex items-center justify-center font-bold border border-white dark:border-[#262626]" title={a}>
                                                            {a.charAt(0).toUpperCase()}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-[#2e2e2e] px-1.5 py-0.5 rounded flex items-center gap-1">
                                                <Clock size={10} />
                                                {Math.ceil((tEnd.getTime() - tStart.getTime()) / (1000 * 60 * 60 * 24))}d
                                            </span>
                                        </div>
                                    </div>

                                    {/* Timeline Area relative to Start Date */}
                                    <div className="flex-1 relative h-[60px]">
                                        {/* Weekend background stripes */}
                                        <div className="absolute inset-0 flex pointer-events-none z-0">
                                            {days.map((day, i) => {
                                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                return isWeekend ? (
                                                    <div key={i} style={{ width: dayWidth, left: i * dayWidth }} className="absolute inset-y-0 bg-gray-50/50 dark:bg-[#212121]/50 border-r border-gray-100/50 dark:border-[#2e2e2e]/30" />
                                                ) : null;
                                            })}
                                        </div>

                                        <div
                                            className={`absolute h-8 rounded-md shadow-sm top-3.5 flex items-center px-2.5 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:brightness-110 hover:-translate-y-[1px] hover:shadow-md ${getStatusColor(task.status)} ${task.status === 'Idéias' || task.status === 'A fazer' ? 'border border-black/10 dark:border-white/10' : ''} z-10`}
                                            style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                                            onClick={() => onTaskClick(task)}
                                        >
                                            {!isSmallZoom && (
                                                <span className="text-[11px] font-bold truncate drop-shadow-sm leading-none whitespace-nowrap overflow-hidden text-ellipsis">
                                                    {task.title}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
