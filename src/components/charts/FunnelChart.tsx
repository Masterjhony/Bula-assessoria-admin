'use client';

const BRAND = {
    BRONZE: '#A0792E',
    BRONZE_DEEP: '#6B4F1E',
    BRONZE_MID: '#8B6826',
    BRONZE_PALE: '#D4A85C',
    TECH_GREEN: '#7FD4A0',
    TECH_BLUE: '#1E3A5F',
    LOSS: '#A04545',
} as const;

export interface FunnelStage {
    label: string;
    count: number;
}

interface FunnelChartProps {
    stages: FunnelStage[];
    /** Optional, kept for API compat — not used in horizontal layout. */
    totalForPct?: number;
}

/** Color progression: Bronze deep → Bronze → Bronze pale → Tech Blue → Tech Green. */
function stageColor(i: number, total: number): string {
    if (i === total - 1) return BRAND.TECH_GREEN;
    if (total === 5) {
        return [BRAND.BRONZE_DEEP, BRAND.BRONZE_MID, BRAND.BRONZE, BRAND.TECH_BLUE, BRAND.TECH_GREEN][i] ?? BRAND.BRONZE;
    }
    const palette = [BRAND.BRONZE_DEEP, BRAND.BRONZE, BRAND.BRONZE_PALE, BRAND.TECH_BLUE, BRAND.TECH_GREEN];
    return palette[Math.min(Math.floor((i / Math.max(total - 1, 1)) * (palette.length - 1)), palette.length - 1)];
}

/**
 * Horizontal funnel — chevron-shaped arrows pointing right.
 * Brand: bronze progression with Tech Blue/Green accents at the end.
 * Conversion rates appear below each non-final chevron.
 */
export function FunnelChart({ stages }: FunnelChartProps) {
    if (stages.length < 2) return null;

    const N = stages.length;
    const VB_W = 1200;
    const CHEVRON_H = 96;
    const LABEL_BLOCK_H = 38;
    const VB_H = CHEVRON_H + LABEL_BLOCK_H;

    const TIP_W = 18;
    const OVERLAP = 14;
    const stageW = (VB_W + (N - 1) * OVERLAP) / N;

    return (
        <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
        >
            <defs>
                {stages.map((_, i) => {
                    const c = stageColor(i, N);
                    return (
                        <linearGradient key={i} id={`fc-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={c} stopOpacity="1" />
                            <stop offset="100%" stopColor={c} stopOpacity="0.85" />
                        </linearGradient>
                    );
                })}
                <filter id="fc-glow-last" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {stages.map((stage, i) => {
                const isFirst = i === 0;
                const isLast = i === N - 1;
                const x = i * (stageW - OVERLAP);
                const w = stageW;

                // Chevron path:
                // - First: flat left, pointed right
                // - Middle: notched left, pointed right
                // - Last: notched left, flat right
                const path = isFirst
                    ? `M ${x} 0 L ${x + w - TIP_W} 0 L ${x + w} ${CHEVRON_H / 2} L ${x + w - TIP_W} ${CHEVRON_H} L ${x} ${CHEVRON_H} Z`
                    : isLast
                        ? `M ${x + TIP_W} 0 L ${x + w} 0 L ${x + w} ${CHEVRON_H} L ${x + TIP_W} ${CHEVRON_H} L ${x} ${CHEVRON_H / 2} Z`
                        : `M ${x + TIP_W} 0 L ${x + w - TIP_W} 0 L ${x + w} ${CHEVRON_H / 2} L ${x + w - TIP_W} ${CHEVRON_H} L ${x + TIP_W} ${CHEVRON_H} L ${x} ${CHEVRON_H / 2} Z`;

                // Visual center of the chevron body (excluding the tip protrusion)
                const cx = x + (isFirst ? (w - TIP_W) / 2 : isLast ? (w + TIP_W) / 2 : w / 2);
                const convToNext = !isLast && stage.count > 0
                    ? (stages[i + 1].count / stage.count) * 100
                    : null;

                const convColor = convToNext === null
                    ? BRAND.BRONZE
                    : convToNext >= 50 ? BRAND.TECH_GREEN
                        : convToNext >= 25 ? BRAND.BRONZE
                            : BRAND.LOSS;

                return (
                    <g key={stage.label}>
                        <path
                            d={path}
                            fill={`url(#fc-grad-${i})`}
                            filter={isLast ? 'url(#fc-glow-last)' : undefined}
                        />
                        {/* Subtle inner highlight on top edge */}
                        <path
                            d={path}
                            fill="none"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth="1"
                        />
                        {/* Stage label */}
                        <text
                            x={cx}
                            y={CHEVRON_H / 2 - 12}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="700"
                            fill="#fff"
                            fillOpacity="0.85"
                            style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}
                        >
                            {stage.label}
                        </text>
                        {/* Count (big, mono) */}
                        <text
                            x={cx}
                            y={CHEVRON_H / 2 + 22}
                            textAnchor="middle"
                            fontSize="28"
                            fontWeight="900"
                            fill="#fff"
                            fontFamily="ui-monospace, 'JetBrains Mono', monospace"
                            style={{ letterSpacing: '-0.02em' }}
                        >
                            {stage.count.toLocaleString('pt-BR')}
                        </text>

                        {/* Conversion rate to next stage */}
                        {convToNext !== null && (
                            <g>
                                <text
                                    x={cx}
                                    y={CHEVRON_H + 16}
                                    textAnchor="middle"
                                    fontSize="15"
                                    fontWeight="800"
                                    fill={convColor}
                                    fontFamily="ui-monospace, 'JetBrains Mono', monospace"
                                >
                                    {convToNext.toFixed(0)}%
                                </text>
                                <text
                                    x={cx}
                                    y={CHEVRON_H + 31}
                                    textAnchor="middle"
                                    fontSize="8"
                                    fill="currentColor"
                                    className="text-gray-500 dark:text-gray-400"
                                    fontWeight="600"
                                    style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}
                                >
                                    taxa de conversão
                                </text>
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
