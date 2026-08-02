import type { TubingComponent, WellData } from '../types';
import { fmt, n } from '../utils/num';

type Props = {
  data: WellData;
};

const FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

type Segment = {
  id: string;
  comp: TubingComponent;
  /** Início do trecho (base do anterior ou 0) */
  from: number;
  /** Fim do trecho = profundidade informada do componente */
  to: number;
  /** Diâmetro visual relativo (maior = mais grosso) */
  width: number;
  index: number;
};

const KIND_LABEL: Record<string, string> = {
  tubing: 'Tubo',
  reducer: 'Redução',
  stator: 'Estator / BCP',
  screen: 'Crivo',
  anchor: 'Âncora',
  filter: 'Filtro',
  plug: 'Tampão',
  joint: 'Junta',
  other: 'Componente',
};

/** Extrai polegadas do texto (ex: 2 7/8, 2.7/8, 2-3/8) */
function parseInches(text: string): number | null {
  const mixed = text.match(/(\d+)\s*[.\s-]\s*(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
  }
  const whole = text.match(/(\d+(?:[.,]\d+)?)\s*["″]/);
  if (whole) return parseFloat(whole[1].replace(',', '.'));
  return null;
}

/**
 * Larguras da coluna: começa no diâmetro do 1º tubo e muda em reduções.
 * Cada componente "herda" o diâmetro até a próxima redução.
 */
function buildSegments(comps: TubingComponent[], tubingSize: string): Segment[] {
  const sorted = [...comps]
    .filter((c) => c.depth != null)
    .sort((a, b) => n(a.depth) - n(b.depth));

  let currentOD =
    parseInches(tubingSize) ??
    parseInches(sorted[0]?.label ?? '') ??
    2.875;

  const segs: Segment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const from =
      c.depthTop != null
        ? n(c.depthTop)
        : i === 0
          ? 0
          : n(sorted[i - 1].depth);
    const to = n(c.depth);

    // Redução: tenta pegar o diâmetro de saída (depois do "x")
    if (c.kind === 'reducer') {
      const parts = c.label.split(/x|×/i);
      if (parts.length >= 2) {
        const out = parseInches(parts[parts.length - 1]);
        if (out != null) currentOD = out;
      }
    } else {
      const d = parseInches(c.label);
      if (d != null && (c.kind === 'tubing' || c.kind === 'joint')) {
        currentOD = d;
      }
    }

    // Largura visual 18–48 px
    const width = Math.max(18, Math.min(48, currentOD * 14));

    segs.push({
      id: c.id,
      comp: c,
      from,
      to,
      width,
      index: i,
    });
  }
  return segs;
}

/**
 * Detalhe da coluna:
 * - Cada componente é um TRECHO (do fim do anterior até a profundidade informada).
 * - Escala VISUAL uniforme: um segmento abaixo do outro (ideal p/ diferenças em cm).
 * - O 1º tubo começa no topo (mais grosso); a profundidade é onde ele TERMINA.
 */
export function ColumnDetailSchematic({ data }: Props) {
  const extrem = n(
    data.extremidadeColuna,
    Math.max(...data.components.map((c) => n(c.depth, 0)), 1)
  );

  const segments = buildSegments(data.components, data.tubingSize);

  // Slot extra para a extremidade (se houver gap após o último componente)
  const lastTo = segments.length ? segments[segments.length - 1].to : 0;
  const hasExtremSlot = extrem > lastTo + 1e-9 || segments.length === 0;
  const slotCount = segments.length + (hasExtremSlot ? 1 : 0) || 1;

  const W = 960;
  const headerH = 96;
  const topY = headerH + 52;
  const slotH = 78; // altura visual fixa por componente — sem sobreposição
  const colBottom = topY + slotCount * slotH;
  const svgH = colBottom + 100;
  const cx = 300;
  const casingW = 110;

  /** Y do topo do slot i (0-based) */
  const slotTop = (i: number) => topY + i * slotH;
  const slotMid = (i: number) => slotTop(i) + slotH / 2;
  const slotBot = (i: number) => slotTop(i) + slotH;

  const cardX = cx + 90;
  const cardW = 340;

  return (
    <div className="schematic-wrap">
      <svg
        viewBox={`0 0 ${W} ${svgH}`}
        className="schematic-svg schematic-svg-detail"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Detalhe da coluna ${data.wellName}`}
      >
        <defs>
          <linearGradient id="detHeader" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <linearGradient id="detPipe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="28%" stopColor="#e2e8f0" />
            <stop offset="55%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="detBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>
          <filter id="detShadow" x="-20%" y="-20%" width="150%" height="160%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="3.5"
              floodColor="#0f172a"
              floodOpacity="0.1"
            />
          </filter>
        </defs>

        <rect width={W} height={svgH} fill="url(#detBg)" />

        {/* Header */}
        <rect width={W} height={headerH} fill="url(#detHeader)" />
        <text
          x="36"
          y="32"
          fontFamily={FONT}
          fontSize="11"
          fontWeight="600"
          fill="#99f6e4"
          letterSpacing="1.4"
        >
          DETALHE DA COLUNA · TRECHOS EMPILHADOS
        </text>
        <text
          x="36"
          y="58"
          fontFamily={FONT}
          fontSize="22"
          fontWeight="700"
          fill="#fff"
        >
          {data.wellName}
        </text>
        <text
          x="36"
          y="80"
          fontFamily={FONT}
          fontSize="12"
          fill="#ccfbf1"
        >
          Profundidade = base do trecho (onde termina e começa o próximo)
        </text>
        <text
          x={W - 36}
          y="48"
          textAnchor="end"
          fontFamily={FONT}
          fontSize="12"
          fontWeight="700"
          fill="#fff"
        >
          Extremidade {fmt(extrem)} m
        </text>
        <text
          x={W - 36}
          y="70"
          textAnchor="end"
          fontFamily={FONT}
          fontSize="11"
          fill="#99f6e4"
        >
          Escala visual uniforme · {segments.length} trechos
        </text>

        {/* Info pill */}
        <g transform={`translate(36, ${headerH + 14})`}>
          <rect width={420} height={26} rx={13} fill="#fff" stroke="#cbd5e1" />
          <text
            x="14"
            y="17"
            fontFamily={FONT}
            fontSize="11"
            fontWeight="600"
            fill="#0f766e"
          >
            1º tubo no topo → cada bloco abaixo é o próximo componente
          </text>
        </g>

        {/* Formation / casing bed */}
        <rect
          x={cx - casingW / 2}
          y={topY - 6}
          width={casingW}
          height={colBottom - topY + 12}
          rx={14}
          fill="#fef3c7"
          stroke="#f59e0b"
          strokeOpacity={0.35}
          filter="url(#detShadow)"
        />

        {/* Casing walls */}
        <rect
          x={cx - casingW / 2 + 6}
          y={topY}
          width={10}
          height={colBottom - topY}
          fill="url(#detPipe)"
          stroke="#334155"
        />
        <rect
          x={cx + casingW / 2 - 16}
          y={topY}
          width={10}
          height={colBottom - topY}
          fill="url(#detPipe)"
          stroke="#334155"
        />

        {/* Cabeça de produção + coluna entrando nela */}
        {(() => {
          const firstW = segments[0]?.width ?? 28;
          const tubingTop = topY - 44;
          const tubingTo =
            segments.length > 0 ? slotTop(0) + 2 : topY + 20;
          return (
            <g>
              {/* Coluna sobe até a cabeça */}
              <rect
                x={cx - firstW / 2}
                y={tubingTop}
                width={firstW}
                height={Math.max(8, tubingTo - tubingTop)}
                fill="url(#detPipe)"
                stroke="#0f172a"
                strokeWidth={1}
                rx={1.5}
              />
              <rect
                x={cx - firstW / 2 + 3}
                y={tubingTop}
                width={Math.max(2, firstW * 0.18)}
                height={Math.max(8, tubingTo - tubingTop)}
                fill="#fff"
                opacity={0.22}
                rx={1}
              />
              {/* Árvore / flanges */}
              <rect
                x={cx - 28}
                y={topY - 48}
                width={56}
                height={14}
                rx={3}
                fill="url(#detPipe)"
                stroke="#334155"
              />
              <rect
                x={cx - 42}
                y={topY - 32}
                width={84}
                height={12}
                rx={3}
                fill="url(#detPipe)"
                stroke="#334155"
              />
              <rect
                x={cx - 32}
                y={topY - 18}
                width={64}
                height={16}
                rx={2}
                fill="url(#detPipe)"
                stroke="#334155"
              />
              {/* Hangar do tubo */}
              <rect
                x={cx - firstW / 2 - 5}
                y={topY - 10}
                width={firstW + 10}
                height={7}
                rx={1.5}
                fill="#475569"
                stroke="#1e293b"
              />
            </g>
          );
        })()}

        {/* Segments — equal visual height, stacked top → bottom */}
        {segments.map((seg, i) => {
          const y0 = slotTop(i);
          const y1 = slotBot(i);
          const mid = slotMid(i);
          const w = seg.width;
          const prevW = i > 0 ? segments[i - 1].width : w;
          const isReducer = seg.comp.kind === 'reducer';
          const length = Math.max(0, seg.to - seg.from);
          const lengthLabel =
            length < 1
              ? `${fmt(length * 100)} cm`
              : `${fmt(length)} m`;

          return (
            <g key={seg.id}>
              {/* Slot background strip */}
              <rect
                x={cx - casingW / 2 + 18}
                y={y0}
                width={casingW - 36}
                height={slotH}
                fill={i % 2 === 0 ? '#fffbeb' : '#fef9c3'}
                opacity={0.45}
              />

              {/* Pipe body of this segment */}
              {isReducer ? (
                <polygon
                  points={[
                    `${cx - prevW / 2},${y0 + 4}`,
                    `${cx + prevW / 2},${y0 + 4}`,
                    `${cx + w / 2},${y1 - 4}`,
                    `${cx - w / 2},${y1 - 4}`,
                  ].join(' ')}
                  fill="url(#detPipe)"
                  stroke="#0f172a"
                  strokeWidth={1.2}
                />
              ) : (
                <rect
                  x={cx - w / 2}
                  y={y0 + 2}
                  width={w}
                  height={slotH - 4}
                  rx={2}
                  fill="url(#detPipe)"
                  stroke="#0f172a"
                  strokeWidth={1.1}
                />
              )}

              {/* Metal highlight */}
              <rect
                x={cx - w / 2 + 3}
                y={y0 + 4}
                width={Math.max(2, w * 0.18)}
                height={slotH - 8}
                fill="#fff"
                opacity={0.22}
                rx={1}
              />

              {/*
                Tubo/junta = só a tubulação contínua (sem “niple”).
                Outros tipos: ornamento no meio do trecho.
              */}
              {seg.comp.kind !== 'tubing' && seg.comp.kind !== 'joint' && (
                <SegmentOrnament
                  kind={seg.comp.kind}
                  cx={cx}
                  y={mid}
                  w={w}
                  /* face interna do revestimento (após as paredes de 10px) */
                  casingInnerHalf={casingW / 2 - 16}
                />
              )}

              {/* Junta sutil no fim do trecho (transição entre componentes) */}
              <line
                x1={cx - Math.max(prevW, w) / 2 - 6}
                y1={y1}
                x2={cx + Math.max(prevW, w) / 2 + 6}
                y2={y1}
                stroke="#64748b"
                strokeWidth={
                  seg.comp.kind === 'tubing' || seg.comp.kind === 'joint'
                    ? 1
                    : 1.5
                }
                strokeDasharray={
                  seg.comp.kind === 'tubing' || seg.comp.kind === 'joint'
                    ? '3 3'
                    : i === segments.length - 1
                      ? '0'
                      : '4 3'
                }
                opacity={
                  seg.comp.kind === 'tubing' || seg.comp.kind === 'joint'
                    ? 0.55
                    : 1
                }
              />

              {/* Left: depth range */}
              <text
                x={cx - casingW / 2 - 12}
                y={mid - 6}
                textAnchor="end"
                fontFamily={FONT}
                fontSize="11"
                fontWeight="700"
                fill="#334155"
              >
                {fmt(seg.from)} → {fmt(seg.to)} m
              </text>
              <text
                x={cx - casingW / 2 - 12}
                y={mid + 10}
                textAnchor="end"
                fontFamily={FONT}
                fontSize="10"
                fontWeight="600"
                fill="#64748b"
              >
                Δ {lengthLabel}
              </text>

              {/* Leader + card */}
              <path
                d={`M ${cx + w / 2 + 4} ${mid} H ${cx + 58} L ${cardX - 6} ${mid}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.3}
                strokeLinecap="round"
              />
              <circle cx={cx + w / 2 + 4} cy={mid} r={3.2} fill="#0f766e" />

              <g filter="url(#detShadow)">
                <rect
                  x={cardX}
                  y={mid - 26}
                  width={cardW}
                  height={52}
                  rx={10}
                  fill="#fff"
                  stroke="#e2e8f0"
                />
                <rect
                  x={cardX}
                  y={mid - 26}
                  width={5}
                  height={52}
                  rx={2}
                  fill="#0f766e"
                />
                <text
                  x={cardX + 16}
                  y={mid - 6}
                  fontFamily={FONT}
                  fontSize="13"
                  fontWeight="700"
                  fill="#0f172a"
                >
                  {seg.comp.label.length > 38
                    ? seg.comp.label.slice(0, 36) + '…'
                    : seg.comp.label}
                </text>
                <text
                  x={cardX + 16}
                  y={mid + 14}
                  fontFamily={FONT}
                  fontSize="11"
                  fontWeight="600"
                  fill="#64748b"
                >
                  Base {fmt(seg.to)} m · {KIND_LABEL[seg.comp.kind] ?? seg.comp.kind}
                  {' · '}
                  trecho {i + 1}/{segments.length}
                </text>
              </g>
            </g>
          );
        })}

        {/* Extremidade slot */}
        {hasExtremSlot &&
          (() => {
            const i = segments.length;
            const mid = slotMid(i);
            const y0 = slotTop(i);
            const lastW = segments.length
              ? segments[segments.length - 1].width
              : 28;
            return (
              <g>
                <rect
                  x={cx - casingW / 2 + 18}
                  y={y0}
                  width={casingW - 36}
                  height={slotH}
                  fill="#fee2e2"
                  opacity={0.5}
                />
                {/* End plug / extremity */}
                <rect
                  x={cx - lastW / 2 - 4}
                  y={mid - 10}
                  width={lastW + 8}
                  height={20}
                  rx={3}
                  fill="#1e293b"
                  stroke="#0f172a"
                />
                <line
                  x1={cx - 48}
                  y1={mid}
                  x2={cx + 48}
                  y2={mid}
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  strokeDasharray="7 4"
                />
                <path
                  d={`M ${cx + lastW / 2 + 6} ${mid} H ${cx + 58} L ${cardX - 6} ${mid}`}
                  fill="none"
                  stroke="#f87171"
                  strokeWidth={1.3}
                />
                <g filter="url(#detShadow)">
                  <rect
                    x={cardX}
                    y={mid - 26}
                    width={cardW}
                    height={52}
                    rx={10}
                    fill="#fef2f2"
                    stroke="#fecaca"
                  />
                  <rect
                    x={cardX}
                    y={mid - 26}
                    width={5}
                    height={52}
                    rx={2}
                    fill="#dc2626"
                  />
                  <text
                    x={cardX + 16}
                    y={mid - 6}
                    fontFamily={FONT}
                    fontSize="13"
                    fontWeight="700"
                    fill="#991b1b"
                  >
                    EXTREMIDADE DA COLUNA
                  </text>
                  <text
                    x={cardX + 16}
                    y={mid + 14}
                    fontFamily={FONT}
                    fontSize="11"
                    fontWeight="600"
                    fill="#b91c1c"
                  >
                    {fmt(extrem)} m · fim da coluna de produção
                  </text>
                </g>
                <text
                  x={cx - casingW / 2 - 12}
                  y={mid + 4}
                  textAnchor="end"
                  fontFamily={FONT}
                  fontSize="11"
                  fontWeight="700"
                  fill="#b91c1c"
                >
                  {fmt(extrem)} m
                </text>
              </g>
            );
          })()}

        {/* Footer */}
        <text
          x={36}
          y={svgH - 36}
          fontFamily={FONT}
          fontSize="11"
          fill="#64748b"
        >
          Escala visual: cada trecho tem a mesma altura no desenho (evita
          sobreposição em cm). Os valores à esquerda são as profundidades reais
          de topo e base.
        </text>
        <text
          x={36}
          y={svgH - 18}
          fontFamily={FONT}
          fontSize="11"
          fill="#64748b"
        >
          Ordem: topo → fundo. O 1º componente começa em 0 m e termina na base
          informada; o seguinte começa aí.
        </text>
      </svg>
    </div>
  );
}

function SegmentOrnament({
  kind,
  cx,
  y,
  w,
  casingInnerHalf = 39,
}: {
  kind: string;
  cx: number;
  y: number;
  w: number;
  /** Distância do centro até a face interna do revestimento */
  casingInnerHalf?: number;
}) {
  const tubeHalf = w / 2;
  switch (kind) {
    case 'filter':
    case 'screen':
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={cx - tubeHalf + 4}
              y1={y - 10 + i * 6}
              x2={cx + tubeHalf - 4}
              y2={y - 10 + i * 6}
              stroke="#0f172a"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
          ))}
        </g>
      );
    case 'anchor': {
      // Slips em paralelogramo: encostam no tubo (inner) e na face interna do revestimento (outer)
      // sem invadir a parede nem deixar vão lateral
      const inner = tubeHalf;
      const outer = Math.max(inner + 4, casingInnerHalf);
      const h = 13;
      const skew = 5;
      return (
        <g>
          {[-1, 1].map((s) => (
            <polygon
              key={s}
              points={[
                `${cx + s * inner},${y - h}`,
                `${cx + s * outer},${y - h + skew}`,
                `${cx + s * outer},${y + h + skew}`,
                `${cx + s * inner},${y + h}`,
              ].join(' ')}
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth={0.8}
            />
          ))}
        </g>
      );
    }
    case 'stator':
      return (
        <ellipse
          cx={cx}
          cy={y}
          rx={tubeHalf + 6}
          ry={14}
          fill="none"
          stroke="#0f172a"
          strokeWidth={1.5}
          opacity={0.5}
        />
      );
    case 'plug':
      return (
        <g>
          <rect
            x={cx - 48}
            y={y - 14}
            width={96}
            height={28}
            rx={3}
            fill="#1e293b"
            stroke="#0f172a"
          />
          <rect
            x={cx - 42}
            y={y - 9}
            width={84}
            height={18}
            rx={2}
            fill="#475569"
          />
        </g>
      );
    default:
      return null;
  }
}
