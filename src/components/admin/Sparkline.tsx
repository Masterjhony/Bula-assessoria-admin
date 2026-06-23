'use client';

import { useId } from 'react';

/**
 * Mini-gráfico de linha (área + linha) para tendências em cards de dashboard.
 * Extraído de OperationDashboard para reuso (CRM dashboard, etc.).
 */
export function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
    const id = useId();
    if (data.length === 0) return null;
    const max = Math.max(...data, 1);
    const w = 100;
    const stepX = data.length > 1 ? w / (data.length - 1) : 0;
    const points = data.map((v, i) => `${(i * stepX).toFixed(2)},${(height - (v / max) * height).toFixed(2)}`).join(' ');
    const lastX = (data.length - 1) * stepX;
    const lastY = height - (data[data.length - 1] / max) * height;
    return (
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`0,${height} ${points} ${w},${height}`} fill={`url(#${id})`} />
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <circle cx={lastX} cy={lastY} r="1.6" fill={color} />
        </svg>
    );
}
