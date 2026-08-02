import type { WellData } from '../types';
import { fmt, n as num } from '../utils/num';

type Props = {
  data: WellData;
};

const FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

const C = {
  bg: '#f8fafc',
  surface: '#ffffff',
  ink: '#0f172a',
  inkMuted: '#64748b',
  inkSoft: '#94a3b8',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  steel: '#94a3b8',
  steelDark: '#475569',
  accent: '#0f766e',
  accentSoft: '#ccfbf1',
  accentDark: '#115e59',
  open: '#059669',
  openBg: '#10b981',
  closed: '#64748b',
  formation: '#fef3c7',
  formationDeep: '#fde68a',
  cement: '#d6d3d1',
  fill: '#ea580c',
  shoe: '#1e293b',
  callout: '#94a3b8',
};

function makeDepthScale(maxDepth: number, topY: number, bottomY: number) {
  const span = bottomY - topY;
  return (depth: number) => topY + (Math.max(0, depth) / maxDepth) * span;
}

function parseDiameterInches(diameter: string): number {
  const cleaned = diameter.replace(/["″]/g, '').trim();
  // handle 13.3/8 or 5.1/2 style
  const mixed = cleaned.match(/^(\d+)\.(\d+)\/(\d+)$/);
  if (mixed) {
    return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
  }
  const frac = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (frac) {
    return parseFloat(frac[1]) + parseFloat(frac[2]) / parseFloat(frac[3]);
  }
  const n = parseFloat(cleaned.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 5;
}

function diameterWidth(diameter: string, maxW = 118): number {
  const inches = parseDiameterInches(diameter);
  return Math.max(32, Math.min(maxW, (inches / 20) * maxW));
}

/**
 * Place labels near desired Y without overlap.
 * Only pushes DOWN — never compresses. Canvas height must grow to fit.
 * Items must already be sorted by desired y (ascending).
 */
function packLabelsDown(
  desiredYs: number[],
  minGap: number,
  minY: number
): number[] {
  if (!desiredYs.length) return [];
  const ys = desiredYs.map((y) => Math.max(y, minY));
  for (let i = 1; i < ys.length; i++) {
    ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
  }
  return ys;
}

/**
 * Same as packLabelsDown but also clamps into [minY, maxY] by
 * spreading evenly when the range is too short (for left column only).
 */
function deconflict(
  desiredYs: number[],
  minGap: number,
  minY: number,
  maxY: number
): number[] {
  const n = desiredYs.length;
  if (!n) return [];
  const needed = (n - 1) * minGap;
  const span = maxY - minY;
  if (needed > span) {
    return desiredYs.map((_, i) => minY + (n === 1 ? 0 : (i * span) / (n - 1)));
  }
  const ys = packLabelsDown(desiredYs, minGap, minY);
  if (ys[n - 1] <= maxY) return ys;
  // Pull up as a block, then re-enforce gaps from top
  const overflow = ys[n - 1] - maxY;
  for (let i = 0; i < n; i++) ys[i] -= overflow;
  if (ys[0] < minY) {
    const shift = minY - ys[0];
    for (let i = 0; i < n; i++) ys[i] += shift;
  }
  for (let i = 1; i < n; i++) {
    ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
  }
  return ys;
}

function casingPrimary(c: WellData['casings'][0]): string {
  return `${c.diameter} · ${fmt(c.depthBottom)} m`;
}

function casingSecondary(c: WellData['casings'][0]): string {
  const bits = [c.name.replace(c.diameter, '').trim(), c.grade, c.weight].filter(
    Boolean
  );
  return bits.join(' · ') || 'Revestimento';
}

export function WellSchematic({ data }: Props) {
  const extremidade = num(
    data.extremidadeColuna,
    Math.max(...data.components.map((c) => num(c.depth)), 100)
  );

  const maxDepth = Math.max(
    num(data.totalDepth),
    num(data.fundoEncontrado),
    extremidade,
    num(data.tampao?.depthBottom),
    num(data.tampao?.depthTop),
    ...data.casings.map((c) => num(c.depthBottom)),
    ...data.components.map((c) => num(c.depth)),
    ...data.perforations.map((p) => num(p.bottom)),
    100
  );

  const W = 1040;
  const headerH = 88;
  const topY = headerH + 56;
  const wellCenterX = 430;

  // Card metrics (must match InfoCard)
  const CARD_H = 40;
  const CARD_GAP = 48; // center-to-center — no overlap
  const LABEL_TOP = topY - 20;
  const FOOTER_H = 64;

  // Well drawing height (fixed). Labels may extend BELOW this; SVG grows.
  const minWellSpan = 900;
  const bottomY = topY + minWellSpan;
  const toY = makeDepthScale(maxDepth, topY, bottomY);

  type RightItem = {
    id: string;
    kind: 'comp' | 'perf' | 'fundo' | 'sapata' | 'wh' | 'extrem';
    depth: number;
    title: string;
    subtitle?: string;
    tone?: 'default' | 'open' | 'closed' | 'warn' | 'meta' | 'extrem';
    /** Y fixo no desenho (componentes: pilha no fundo, sem escala) */
    fixedY?: number;
  };

  // —— Coluna: pilha VISUAL no fundo (sem escala de profundidade) ——
  const compsSorted = [...data.components]
    .filter((c) => c.depth != null)
    .sort((a, b) => num(a.depth) - num(b.depth));

  // Âncora da pilha: logo acima da extremidade (sempre no fundo do desenho)
  const stackAnchorY = Math.min(
    toY(extremidade),
    toY(num(data.fundoEncontrado, extremidade)),
    bottomY - 28
  );
  // Cabe no máximo ~30% inferior do poço; comprime se houver muitos itens
  const maxStackSpan = (bottomY - topY) * 0.3;
  const COMP_SLOT =
    compsSorted.length <= 1
      ? 36
      : Math.min(36, Math.max(22, maxStackSpan / compsSorted.length));
  // i=0 (raso) no topo da pilha; i=n-1 (profundo) encostado no fundo
  const compStackYs = compsSorted.map((_, i) => {
    const fromBottom = compsSorted.length - 1 - i;
    return stackAnchorY - COMP_SLOT * 0.35 - fromBottom * COMP_SLOT;
  });

  const rightItems: RightItem[] = [];

  if (data.wellhead) {
    rightItems.push({
      id: 'wh',
      kind: 'wh',
      depth: -1,
      title: data.wellhead,
      subtitle: data.donut,
      tone: 'meta',
    });
  }

  for (const p of data.perforations) {
    rightItems.push({
      id: p.id,
      kind: 'perf',
      depth: (num(p.top) + num(p.bottom)) / 2,
      title: `${fmt(p.top)} – ${fmt(p.bottom)} m`,
      subtitle:
        p.status === 'aberto' ? 'Canhoneado aberto' : 'Canhoneado fechado',
      tone: p.status === 'aberto' ? 'open' : 'closed',
    });
  }

  // Componentes da coluna (sem tampão)
  for (let i = 0; i < compsSorted.length; i++) {
    const c = compsSorted[i];
    const to = num(c.depth);
    rightItems.push({
      id: c.id,
      kind: 'comp',
      depth: to,
      fixedY: compStackYs[i],
      title: c.label,
      subtitle: `${fmt(to)} m`,
      tone: 'default',
    });
  }

  rightItems.push({
    id: 'extrem',
    kind: 'extrem',
    depth: extremidade,
    title: `EXTREM. ${fmt(extremidade)} m`,
    subtitle: 'Extremidade da coluna',
    tone: 'extrem',
  });

  // Tampão opcional — depois da coluna (não é componente de coluna)
  const tampaoOn = Boolean(data.tampao?.enabled);
  const tampaoTop = num(data.tampao?.depthTop, NaN);
  const tampaoBot = num(data.tampao?.depthBottom, NaN);
  if (tampaoOn && Number.isFinite(tampaoBot)) {
    const tampaoY =
      (compStackYs.length
        ? Math.max(...compStackYs)
        : stackAnchorY - COMP_SLOT) + COMP_SLOT;
    rightItems.push({
      id: 'tampao',
      kind: 'comp',
      depth: Number.isFinite(tampaoTop)
        ? (tampaoTop + tampaoBot) / 2
        : tampaoBot,
      fixedY: tampaoY,
      title: data.tampao?.label || 'Tampão',
      subtitle: Number.isFinite(tampaoTop)
        ? `Topo ${fmt(tampaoTop)} → Base ${fmt(tampaoBot)} m`
        : `Base ${fmt(tampaoBot)} m`,
      tone: 'default',
    });
  }

  rightItems.push({
    id: 'fundo',
    kind: 'fundo',
    depth: num(data.fundoEncontrado),
    title: `Fundo ${fmt(data.fundoEncontrado)} m`,
    subtitle: `Última intervenção ${data.fundoData}`,
    tone: 'warn',
  });

  rightItems.push({
    id: 'sapata',
    kind: 'sapata',
    depth: num(data.totalDepth),
    title: `Sapata ${fmt(data.totalDepth)} m`,
    subtitle: 'Profundidade total / TD',
    tone: 'meta',
  });

  // Ordena: wh no topo; depois por Y (fixos dos comps ou toY da profundidade)
  rightItems.sort((a, b) => {
    if (a.kind === 'wh') return -1;
    if (b.kind === 'wh') return 1;
    const ya = a.fixedY ?? toY(a.depth);
    const yb = b.fixedY ?? toY(b.depth);
    return ya - yb;
  });

  // Empilha labels: comps já têm fixedY; demais usam escala e empurram p/ não colidir
  const desiredRightYs = rightItems.map((item) =>
    item.kind === 'wh'
      ? LABEL_TOP
      : item.fixedY != null
        ? item.fixedY
        : toY(item.depth)
  );
  // Só aplica pack nos que NÃO são comp — preserva pilha fixa dos componentes
  const rightYs = desiredRightYs.slice();
  for (let i = 0; i < rightItems.length; i++) {
    if (rightItems[i].kind === 'comp' || rightItems[i].kind === 'wh') continue;
    // mínimo: abaixo do anterior + gap
    if (i > 0) {
      rightYs[i] = Math.max(rightYs[i], rightYs[i - 1] + CARD_GAP);
    }
  }
  // Passada final: garante gap global sem mover comps para fora da pilha
  for (let i = 1; i < rightItems.length; i++) {
    if (rightItems[i].kind === 'comp') {
      // comp mantém fixedY; se colidir com anterior, empurra o ANTERIOR só se não for comp
      if (rightYs[i] < rightYs[i - 1] + CARD_GAP && rightItems[i - 1].kind !== 'comp') {
        // move o atual levemente (ainda na zona) — na prática comps já estão espaçados
        rightYs[i] = rightYs[i - 1] + CARD_GAP;
      }
      continue;
    }
    rightYs[i] = Math.max(rightYs[i], rightYs[i - 1] + CARD_GAP);
  }

  const lastLabelBottom =
    rightYs.length > 0
      ? Math.max(...rightYs) + CARD_H / 2 + 8
      : bottomY;

  // Altura do SVG: poço + labels (sem esticar por escala dos comps)
  const H = Math.max(bottomY, lastLabelBottom) + FOOTER_H + 20;

  // Mapa id → Y visual do glifo (pilha no fundo)
  const compYById = new Map(
    compsSorted.map((c, i) => [c.id, compStackYs[i]] as const)
  );

  const sortedCasings = [...data.casings].sort(
    (a, b) => parseDiameterInches(b.diameter) - parseDiameterInches(a.diameter)
  );

  const outerW = sortedCasings.length
    ? diameterWidth(sortedCasings[0].diameter, 124)
    : 90;
  const prodCasing = sortedCasings[sortedCasings.length - 1];
  const prodW = prodCasing ? diameterWidth(prodCasing.diameter, 72) : 42;
  const tubingW = Math.max(12, prodW * 0.32);

  const formationLeft = wellCenterX - outerW / 2 - 42;
  const formationRight = wellCenterX + outerW / 2 + 42;
  const formationW = formationRight - formationLeft;

  // Left casing labels (few items — fit inside well span)
  const leftItems = sortedCasings.map((c) => ({
    casing: c,
    yDesired:
      num(c.depthBottom) < maxDepth * 0.18
        ? toY(num(c.depthBottom)) - 6
        : (toY(num(c.depthTop)) + toY(num(c.depthBottom))) / 2,
  }));
  leftItems.sort((a, b) => a.yDesired - b.yDesired);
  const leftYs = deconflict(
    leftItems.map((i) => i.yDesired),
    52,
    topY + 12,
    bottomY - 24
  );

  const scaleSteps = niceTicks(maxDepth, 8);

  // Coluna termina na extremidade
  const tubingBottomDepth = extremidade;

  const legendY = Math.max(bottomY + 28, lastLabelBottom + 20);

  return (
    <div className="schematic-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="schematic-svg"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Esquema mecânico ${data.wellName}`}
      >
        <defs>
          <linearGradient id="pageBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>

          <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="55%" stopColor="#0e7490" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          <linearGradient id="pipeMetal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="18%" stopColor="#e2e8f0" />
            <stop offset="45%" stopColor="#94a3b8" />
            <stop offset="70%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>

          <linearGradient id="tubingMetal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="25%" stopColor="#cbd5e1" />
            <stop offset="55%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          <linearGradient id="formationGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="40%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#fcd34d" />
          </linearGradient>

          <linearGradient id="cementGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a8a29e" />
            <stop offset="50%" stopColor="#d6d3d1" />
            <stop offset="100%" stopColor="#a8a29e" />
          </linearGradient>

          <linearGradient id="whMetal" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>

          <pattern id="fillHash" patternUnits="userSpaceOnUse" width="7" height="7">
            <rect width="7" height="7" fill="#fb923c" />
            <path d="M0 7L7 0M-1 2L2 -1M5 8L8 5" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
          </pattern>

          <pattern id="cementHatch" patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="#d6d3d1" fillOpacity="0.55" />
            <path d="M0 6L6 0" stroke="#78716c" strokeWidth="0.7" strokeOpacity="0.55" />
          </pattern>

          <pattern id="gridDots" patternUnits="userSpaceOnUse" width="24" height="24">
            <circle cx="1" cy="1" r="0.7" fill="#cbd5e1" fillOpacity="0.55" />
          </pattern>

          <filter id="cardShadow" x="-15%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.08" />
          </filter>

          <filter id="wellShadow" x="-30%" y="-5%" width="160%" height="110%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.12" />
          </filter>

          <clipPath id="wellClip">
            <rect
              x={formationLeft}
              y={topY - 12}
              width={formationW}
              height={bottomY - topY + 24}
              rx="16"
            />
          </clipPath>
        </defs>

        {/* Page */}
        <rect width={W} height={H} fill="url(#pageBg)" />
        <rect width={W} height={H} fill="url(#gridDots)" opacity="0.7" />

        {/* Header bar */}
        <rect x="0" y="0" width={W} height={headerH} fill="url(#headerGrad)" />
        <rect x="0" y={headerH - 1} width={W} height="1" fill="#0f172a" opacity="0.15" />

        <text
          x="36"
          y="36"
          fontFamily={FONT}
          fontSize="11"
          fontWeight="600"
          fill="#ccfbf1"
          letterSpacing="1.6"
        >
          ESQUEMA MECÂNICO DE POÇO
        </text>
        <text
          x="36"
          y="62"
          fontFamily={FONT}
          fontSize="22"
          fontWeight="700"
          fill="#ffffff"
        >
          {data.wellName}
        </text>

        {/* Header meta chips */}
        <HeaderChip
          x={W - 36}
          y={28}
          label="Última intervenção"
          value={data.lastIntervention}
          anchor="end"
        />
        <HeaderChip
          x={W - 36}
          y={54}
          label="TD / Sapata"
          value={`${fmt(data.totalDepth)} m`}
          anchor="end"
        />

        {/* Elevation pills under header */}
        <g transform={`translate(36, ${headerH + 16})`}>
          <MetaPill label="Elev. MR" value={`${fmt(data.elevacaoMR)} m`} />
          <g transform="translate(148, 0)">
            <MetaPill label="Elev. BAP" value={`${fmt(data.elevacaoBAP)} m`} />
          </g>
          <g transform="translate(296, 0)">
            <MetaPill label="Fundo" value={`${fmt(data.fundoEncontrado)} m`} />
          </g>
        </g>

        {/* Formation bed */}
        <g filter="url(#wellShadow)">
          <rect
            x={formationLeft}
            y={topY - 12}
            width={formationW}
            height={bottomY - topY + 24}
            rx="16"
            fill="url(#formationGrad)"
            stroke="#f59e0b"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        </g>

        {/* Subtle strata lines */}
        <g clipPath="url(#wellClip)" opacity="0.25">
          {Array.from({ length: 18 }).map((_, i) => {
            const y = topY + ((bottomY - topY) / 18) * i;
            return (
              <line
                key={i}
                x1={formationLeft}
                y1={y}
                x2={formationRight}
                y2={y + (i % 2 === 0 ? 3 : -2)}
                stroke="#b45309"
                strokeWidth="0.8"
              />
            );
          })}
        </g>

        {/* Cement sheaths (between outer formation and casing, near shoes) */}
        {sortedCasings.slice(0, -1).map((c, i) => {
          const w = diameterWidth(c.diameter, 124 - i * 14);
          const y1 = toY(num(c.depthBottom));
          const sheathH = Math.min(48, (bottomY - topY) * 0.06);
          return (
            <g key={`cem-${c.id}`} opacity={0.85}>
              <rect
                x={wellCenterX - w / 2 - 14}
                y={y1 - sheathH}
                width={14}
                height={sheathH}
                fill="url(#cementHatch)"
              />
              <rect
                x={wellCenterX + w / 2}
                y={y1 - sheathH}
                width={14}
                height={sheathH}
                fill="url(#cementHatch)"
              />
            </g>
          );
        })}

        {/* Casings outer → inner */}
        {sortedCasings.map((c, i) => {
          const w = diameterWidth(c.diameter, 124 - i * 14);
          const next = sortedCasings[i + 1];
          const innerW = next
            ? diameterWidth(next.diameter, 124 - (i + 1) * 14)
            : Math.max(20, w * 0.42);
          const wall = Math.max(5, (w - innerW) / 2);
          const y0 = toY(num(c.depthTop));
          const y1 = toY(num(c.depthBottom));
          const h = Math.max(6, y1 - y0);
          const isLast = i === sortedCasings.length - 1;
          return (
            <g key={c.id}>
              <rect
                x={wellCenterX - w / 2}
                y={y0}
                width={w}
                height={h}
                fill="url(#pipeMetal)"
                stroke="#334155"
                strokeWidth={1.15}
                rx={1}
              />
              <rect
                x={wellCenterX - w / 2 + wall}
                y={y0}
                width={w - wall * 2}
                height={h}
                fill={isLast ? '#f8fafc' : 'url(#formationGrad)'}
                stroke="#94a3b8"
                strokeWidth={0.5}
              />
              {/* highlight edge */}
              <line
                x1={wellCenterX - w / 2 + 1.5}
                y1={y0}
                x2={wellCenterX - w / 2 + 1.5}
                y2={y1}
                stroke="#fff"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
              {/* shoes */}
              <Shoe x={wellCenterX - w / 2} y={y1} side="left" />
              <Shoe x={wellCenterX + w / 2} y={y1} side="right" />
              {/* depth tick on shoe */}
              <circle
                cx={wellCenterX + w / 2 + 16}
                cy={y1}
                r={2.2}
                fill={C.shoe}
                opacity={0.5}
              />
            </g>
          );
        })}

        {/*
          Coluna de produção: sobe até a cabeça (tubing hangar / árvore).
          Desenhada antes da wellhead para “entrar” nela.
        */}
        {(() => {
          const tubingTopY = topY - 48; // entra no corpo da cabeça de produção
          const tubingBotY = toY(tubingBottomDepth);
          const h = Math.max(12, tubingBotY - tubingTopY);
          return (
            <g>
              <rect
                x={wellCenterX - tubingW / 2}
                y={tubingTopY}
                width={tubingW}
                height={h}
                fill="url(#tubingMetal)"
                stroke="#1e293b"
                strokeWidth={0.9}
                rx={1.5}
              />
              <rect
                x={wellCenterX - tubingW / 2 + 2}
                y={tubingTopY}
                width={Math.max(2, tubingW * 0.22)}
                height={h}
                fill="#fff"
                opacity={0.25}
                rx={1}
              />
            </g>
          );
        })()}

        {/* Cabeça de produção (por cima da coluna, com furo central) */}
        <Wellhead
          x={wellCenterX}
          y={topY}
          width={outerW * 0.78}
          tubingW={tubingW}
        />

        {/*
          Componentes da coluna: pilha compacta no FUNDO (sem escala).
          Tipo "tubo" NÃO ganha glifo — o tubo é a própria coluna central.
        */}
        {compsSorted.map((comp) => {
          if (comp.kind === 'tubing' || comp.kind === 'joint') return null;
          const y = compYById.get(comp.id) ?? stackAnchorY;
          return (
            <ComponentGlyph
              key={`g-${comp.id}`}
              kind={comp.kind}
              cx={wellCenterX}
              y={y}
              tubingW={tubingW}
              casingInnerW={prodW - 10}
            />
          );
        })}

        {/* Tampão opcional (após a coluna) — fecha o RV de produção */}
        {tampaoOn &&
          Number.isFinite(tampaoBot) &&
          (() => {
            const ri = rightItems.findIndex((r) => r.id === 'tampao');
            const y =
              ri >= 0 ? rightYs[ri] : stackAnchorY + COMP_SLOT;
            const plugH = COMP_SLOT * 0.85;
            return (
              <ComponentGlyph
                key="g-tampao"
                kind="plug"
                cx={wellCenterX}
                y={y}
                tubingW={tubingW}
                casingInnerW={prodW - 10}
                yTop={y - plugH / 2}
                yBot={y + plugH / 2}
              />
            );
          })()}

        {/* Perforations */}
        {data.perforations.map((p) => {
          const y0 = toY(num(p.top));
          const y1 = toY(num(p.bottom));
          const h = Math.max(8, y1 - y0);
          const open = p.status === 'aberto';
          const n = Math.max(4, Math.round(h / 4.5));
          return (
            <g key={`perf-${p.id}`}>
              {/* interval highlight on production casing */}
              <rect
                x={wellCenterX - prodW / 2 - 1}
                y={y0}
                width={prodW + 2}
                height={h}
                fill={open ? '#10b981' : '#94a3b8'}
                opacity={0.18}
                rx={2}
              />
              {Array.from({ length: n }).map((_, i) => {
                const yy = y0 + 2 + (h / n) * i;
                const col = open ? '#047857' : '#475569';
                return (
                  <g key={i}>
                    <line
                      x1={wellCenterX - prodW / 2}
                      y1={yy}
                      x2={wellCenterX - prodW / 2 - 12}
                      y2={yy - 4}
                      stroke={col}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                    <line
                      x1={wellCenterX + prodW / 2}
                      y1={yy}
                      x2={wellCenterX + prodW / 2 + 12}
                      y2={yy - 4}
                      stroke={col}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Fill below fundo */}
        {(() => {
          const yF = toY(num(data.fundoEncontrado));
          const ySap = toY(num(data.totalDepth));
          return (
            <rect
              x={wellCenterX - prodW / 2 + 3}
              y={yF}
              width={prodW - 6}
              height={Math.max(4, ySap - yF - 2)}
              fill="url(#fillHash)"
              opacity={0.95}
              rx={1}
            />
          );
        })()}

        {/* Left labels (casings) */}
        {leftItems.map((item, i) => {
          const c = item.casing;
          const y = leftYs[i];
          const w = diameterWidth(c.diameter, 124);
          const attachY = toY(num(c.depthBottom));
          const attachX = wellCenterX - w / 2;
          const cardX = 28;
          const cardW = 210;
          return (
            <g key={`left-${c.id}`}>
              <path
                d={`M ${cardX + cardW} ${y} H ${attachX - 18} L ${attachX - 2} ${attachY}`}
                fill="none"
                stroke={C.callout}
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={attachX - 2} cy={attachY} r={2.5} fill={C.steelDark} />
              <InfoCard
                x={cardX}
                y={y - CARD_H / 2}
                width={cardW}
                height={CARD_H}
                title={casingPrimary(c)}
                subtitle={casingSecondary(c)}
                accent="#0f766e"
              />
            </g>
          );
        })}

        {/* Right labels */}
        {rightItems.map((item, i) => {
          const y = rightYs[i];
          const cardX = wellCenterX + outerW / 2 + 52;
          const cardW = 300;
          // Componentes: attach no próprio glifo (mesma Y da tag)
          let attachX = wellCenterX + tubingW / 2 + 2;
          let attachY =
            item.kind === 'wh'
              ? topY - 6
              : item.kind === 'comp'
                ? y
                : toY(item.depth);

          if (item.kind === 'perf') {
            attachX = wellCenterX + prodW / 2 + 12;
          } else if (
            item.kind === 'fundo' ||
            item.kind === 'sapata' ||
            item.kind === 'extrem'
          ) {
            attachX = wellCenterX + prodW / 2 + 4;
          } else if (item.kind === 'wh') {
            attachX = wellCenterX + outerW * 0.4;
          } else if (item.kind === 'comp') {
            // Tag do tubo aponta para a coluna central (não para um “niple”)
            attachX = wellCenterX + tubingW / 2 + 2;
          }

          const accent =
            item.tone === 'open'
              ? C.open
              : item.tone === 'closed'
                ? C.closed
                : item.tone === 'warn'
                  ? '#ea580c'
                  : item.tone === 'extrem'
                    ? '#dc2626'
                    : item.tone === 'meta'
                      ? '#0369a1'
                      : '#475569';

          return (
            <g key={`right-${item.id}`}>
              <path
                d={
                  item.kind === 'comp'
                    ? `M ${attachX} ${attachY} H ${cardX - 8}`
                    : `M ${attachX} ${attachY} H ${attachX + 16} L ${cardX - 8} ${y}`
                }
                fill="none"
                stroke={C.callout}
                strokeWidth={1.15}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={attachX} cy={attachY} r={2.4} fill={accent} />
              <InfoCard
                x={cardX}
                y={y - CARD_H / 2}
                width={cardW}
                height={CARD_H}
                title={item.title}
                subtitle={item.subtitle}
                accent={accent}
                tone={item.tone}
              />
            </g>
          );
        })}

        {/* Depth scale */}
        <g>
          <line
            x1={W - 52}
            y1={topY}
            x2={W - 52}
            y2={bottomY}
            stroke={C.borderStrong}
            strokeWidth={1.5}
          />
          <text
            x={W - 52}
            y={topY - 14}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize="9"
            fontWeight="700"
            fill={C.inkMuted}
            letterSpacing="1"
          >
            MD
          </text>
          {scaleSteps.map((d) => {
            const y = toY(d);
            return (
              <g key={d}>
                <line
                  x1={W - 58}
                  y1={y}
                  x2={W - 46}
                  y2={y}
                  stroke={C.steelDark}
                  strokeWidth={1.2}
                />
                <text
                  x={W - 40}
                  y={y + 3.5}
                  fontFamily={FONT}
                  fontSize="10"
                  fontWeight="600"
                  fill={C.inkMuted}
                >
                  {Math.round(d)}
                </text>
              </g>
            );
          })}
          <text
            x={W - 36}
            y={bottomY + 22}
            fontFamily={FONT}
            fontSize="9"
            fill={C.inkSoft}
          >
            m
          </text>
        </g>

        {/* Footer legend — always below last label */}
        <g transform={`translate(36, ${legendY})`}>
          <LegendDot color="#94a3b8" label="Revestimento" />
          <g transform="translate(120, 0)">
            <LegendDot color="#334155" label="Coluna" />
          </g>
          <g transform="translate(210, 0)">
            <LegendDot color="#10b981" label="Canhoneado aberto" />
          </g>
          <g transform="translate(360, 0)">
            <LegendDot color="#fb923c" label="Preenchimento / fundo" />
          </g>
          <g transform="translate(540, 0)">
            <LegendDot color="#a8a29e" label="Cimentação" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function niceTicks(max: number, target: number): number[] {
  if (max <= 0) return [0];
  const raw = max / Math.max(1, target - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  let step = pow;
  if (frac > 5) step = 10 * pow;
  else if (frac > 2) step = 5 * pow;
  else if (frac > 1) step = 2 * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-6; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round(max));
  return ticks;
}

function HeaderChip({
  x,
  y,
  label,
  value,
  anchor = 'start',
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  anchor?: 'start' | 'end';
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={FONT}
      fontSize="12"
      fill="#ecfeff"
    >
      <tspan fill="#99f6e4" fontSize="10" fontWeight="600">
        {label.toUpperCase()} ·{' '}
      </tspan>
      <tspan fontWeight="700">{value}</tspan>
    </text>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <g>
      <rect
        width={136}
        height={28}
        rx={14}
        fill="#fff"
        stroke={C.border}
        filter="url(#cardShadow)"
      />
      <text x={12} y={18} fontFamily={FONT} fontSize="10" fontWeight="600" fill={C.inkMuted}>
        {label}
      </text>
      <text x={70} y={18} fontFamily={FONT} fontSize="11" fontWeight="700" fill={C.ink}>
        {value}
      </text>
    </g>
  );
}

function ellipsize(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function InfoCard({
  x,
  y,
  width,
  height = 40,
  title,
  subtitle,
  accent,
  tone = 'default',
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
  title: string;
  subtitle?: string;
  accent: string;
  tone?: 'default' | 'open' | 'closed' | 'warn' | 'meta' | 'extrem';
}) {
  const bg =
    tone === 'open'
      ? '#ecfdf5'
      : tone === 'closed'
        ? '#f1f5f9'
        : tone === 'extrem'
          ? '#fef2f2'
          : C.surface;
  const titleColor =
    tone === 'open'
      ? '#065f46'
      : tone === 'closed'
        ? '#334155'
        : tone === 'extrem'
          ? '#991b1b'
          : C.ink;

  // ~6.2px per char at 11px weight 700 — keep full text when possible
  const maxTitle = Math.floor((width - 22) / 6.2);
  const maxSub = Math.floor((width - 22) / 5.6);
  const t = ellipsize(title, maxTitle);
  const s = subtitle ? ellipsize(subtitle, maxSub) : '';

  return (
    <g filter="url(#cardShadow)">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill={bg}
        stroke={C.border}
        strokeWidth={1}
      />
      <rect x={x} y={y} width={4} height={height} rx={2} fill={accent} />
      <text
        x={x + 14}
        y={y + (subtitle ? 15 : height / 2 + 4)}
        fontFamily={FONT}
        fontSize="11"
        fontWeight="700"
        fill={titleColor}
      >
        {t}
      </text>
      {subtitle && (
        <text
          x={x + 14}
          y={y + 31}
          fontFamily={FONT}
          fontSize="10"
          fontWeight="500"
          fill={C.inkMuted}
        >
          {s}
        </text>
      )}
    </g>
  );
}

function Shoe({
  x,
  y,
  side,
}: {
  x: number;
  y: number;
  side: 'left' | 'right';
}) {
  const dir = side === 'left' ? -1 : 1;
  return (
    <polygon
      points={`${x},${y} ${x},${y - 14} ${x + dir * 9},${y}`}
      fill={C.shoe}
      opacity={0.9}
    />
  );
}

function Wellhead({
  x,
  y,
  width,
  tubingW = 14,
}: {
  x: number;
  y: number;
  width: number;
  tubingW?: number;
}) {
  const w = Math.max(56, width);
  const tw = Math.max(10, tubingW);
  return (
    <g>
      {/* Master valve / topo da árvore — coluna passa no centro */}
      <rect
        x={x - w * 0.22}
        y={y - 52}
        width={w * 0.44}
        height={18}
        rx={3}
        fill="url(#whMetal)"
        stroke="#334155"
        strokeWidth={1}
      />
      {/* Continuação do tubo dentro da cabeça (conexão visual) */}
      <rect
        x={x - tw / 2}
        y={y - 54}
        width={tw}
        height={58}
        fill="url(#tubingMetal)"
        stroke="#1e293b"
        strokeWidth={0.85}
        rx={1}
      />
      <rect
        x={x - tw / 2 + 2}
        y={y - 54}
        width={Math.max(2, tw * 0.22)}
        height={58}
        fill="#fff"
        opacity={0.28}
        rx={1}
      />
      {/* Top flange */}
      <rect
        x={x - w / 2 - 10}
        y={y - 36}
        width={w + 20}
        height={12}
        rx={3}
        fill="url(#pipeMetal)"
        stroke="#334155"
        strokeWidth={1}
      />
      {/* Bolts */}
      {[-0.78, -0.45, -0.15, 0.15, 0.45, 0.78].map((f, i) => (
        <circle
          key={i}
          cx={x + f * (w / 2 + 6)}
          cy={y - 30}
          r={2.2}
          fill="#1e293b"
          opacity={0.75}
        />
      ))}
      {/* Spool / tubing head */}
      <rect
        x={x - w / 2}
        y={y - 24}
        width={w}
        height={16}
        rx={2}
        fill="url(#pipeMetal)"
        stroke="#334155"
        strokeWidth={1}
      />
      {/* Bore do spool (mostra tubo passando) */}
      <rect
        x={x - tw / 2 - 1}
        y={y - 22}
        width={tw + 2}
        height={12}
        rx={1}
        fill="none"
        stroke="#1e293b"
        strokeWidth={0.7}
        opacity={0.35}
      />
      {/* Lower flange / adapter */}
      <rect
        x={x - w / 2 + 6}
        y={y - 10}
        width={w - 12}
        height={12}
        rx={2}
        fill="url(#whMetal)"
        stroke="#334155"
        strokeWidth={1}
      />
      {/* Side outlet */}
      <rect
        x={x + w / 2 - 4}
        y={y - 22}
        width={14}
        height={8}
        rx={2}
        fill="url(#pipeMetal)"
        stroke="#334155"
        strokeWidth={0.8}
      />
      {/* Hangar / encaixe do tubo na cabeça */}
      <rect
        x={x - tw / 2 - 4}
        y={y - 8}
        width={tw + 8}
        height={6}
        rx={1}
        fill="#475569"
        stroke="#1e293b"
        strokeWidth={0.7}
      />
    </g>
  );
}

function ComponentGlyph({
  kind,
  cx,
  y,
  tubingW,
  casingInnerW,
  yTop,
  yBot,
}: {
  kind: string;
  cx: number;
  y: number;
  tubingW: number;
  /** Diâmetro interno do revestimento de produção (âncora / tampão) */
  casingInnerW?: number;
  yTop?: number;
  yBot?: number;
}) {
  // kind "plug" só é usado para o tampão opcional (fora da lista da coluna)
  const half = tubingW / 2 + 3;
  const casingHalf = (casingInnerW ?? tubingW * 2.2) / 2;

  switch (kind) {
    case 'reducer':
      return (
        <polygon
          points={`${cx - half},${y - 11} ${cx + half},${y - 11} ${cx + half * 0.55},${y + 11} ${cx - half * 0.55},${y + 11}`}
          fill="url(#tubingMetal)"
          stroke="#0f172a"
          strokeWidth={0.9}
        />
      );
    case 'filter':
    case 'screen':
      return (
        <g>
          <rect
            x={cx - half - 2}
            y={y - 14}
            width={half * 2 + 4}
            height={28}
            rx={3}
            fill="url(#tubingMetal)"
            stroke="#0f172a"
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={cx - half + 1}
              y1={y - 10 + i * 5}
              x2={cx + half - 1}
              y2={y - 10 + i * 5}
              stroke="#0f172a"
              strokeOpacity={0.55}
              strokeWidth={0.8}
            />
          ))}
        </g>
      );
    case 'anchor': {
      // Slips: da parede do tubo até a face interna do revestimento (sem vão, sem ultrapassar)
      const bodyH = 22;
      const slipH = 14;
      const skew = 4;
      const tubeR = tubingW / 2;
      const casingR = Math.max(tubeR + 4, casingHalf);
      return (
        <g>
          <rect
            x={cx - tubeR}
            y={y - bodyH / 2}
            width={tubeR * 2}
            height={bodyH}
            rx={2}
            fill="url(#tubingMetal)"
            stroke="#0f172a"
          />
          {[-1, 1].map((s) => (
            <polygon
              key={s}
              points={[
                `${cx + s * tubeR},${y - slipH / 2}`,
                `${cx + s * casingR},${y - slipH / 2 + skew}`,
                `${cx + s * casingR},${y + slipH / 2 + skew}`,
                `${cx + s * tubeR},${y + slipH / 2}`,
              ].join(' ')}
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth={0.8}
            />
          ))}
        </g>
      );
    }
    case 'packer': {
      // Packer de esquema mecânico: mandril + elementos elastoméricos
      // (anéis/chevron) vedando o anular até a face interna do revestimento
      const tubeR = tubingW / 2;
      const casingR = Math.max(tubeR + 5, casingHalf);
      const bodyH = 26;
      const rings = 3;
      const ringH = 5;
      const gap = 2;
      const blockH = rings * ringH + (rings - 1) * gap;
      const y0 = y - blockH / 2;
      return (
        <g>
          {/* Mandril (corpo no tubo) */}
          <rect
            x={cx - tubeR}
            y={y - bodyH / 2}
            width={tubeR * 2}
            height={bodyH}
            rx={2}
            fill="url(#tubingMetal)"
            stroke="#0f172a"
          />
          {/* Elementos de borracha — preenchem o anular (clássico em wellbore diagrams) */}
          {Array.from({ length: rings }).map((_, i) => {
            const yy = y0 + i * (ringH + gap);
            // chevron / V invertido levemente: topo mais estreito no tubo, base larga no casing
            return (
              <g key={i}>
                <polygon
                  points={[
                    `${cx - tubeR},${yy + 1}`,
                    `${cx + tubeR},${yy + 1}`,
                    `${cx + casingR},${yy + ringH}`,
                    `${cx - casingR},${yy + ringH}`,
                  ].join(' ')}
                  fill="#1e293b"
                  stroke="#0f172a"
                  strokeWidth={0.7}
                />
                {/* “X” sutil no anular — símbolo comum de packer em diagramas */}
                {i === 1 && (
                  <g stroke="#94a3b8" strokeWidth={0.9} opacity={0.85}>
                    <line
                      x1={cx - (tubeR + casingR) / 2}
                      y1={yy + 1}
                      x2={cx - tubeR - 1}
                      y2={yy + ringH - 0.5}
                    />
                    <line
                      x1={cx + (tubeR + casingR) / 2}
                      y1={yy + 1}
                      x2={cx + tubeR + 1}
                      y2={yy + ringH - 0.5}
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      );
    }
    case 'plug': {
      // Fecha o espaço interno do revestimento de produção (topo → base)
      const top = yTop ?? y - 10;
      const bot = yBot ?? y + 10;
      const h = Math.max(8, bot - top);
      return (
        <g>
          <rect
            x={cx - casingHalf}
            y={top}
            width={casingHalf * 2}
            height={h}
            rx={2}
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth={1.1}
          />
          <rect
            x={cx - casingHalf + 3}
            y={top + 2}
            width={casingHalf * 2 - 6}
            height={Math.max(3, h - 4)}
            rx={1}
            fill="#475569"
            opacity={0.85}
          />
          {/* hachura de fechamento */}
          {Array.from({ length: Math.max(2, Math.floor(h / 5)) }).map((_, i) => (
            <line
              key={i}
              x1={cx - casingHalf + 4}
              y1={top + 4 + i * 5}
              x2={cx + casingHalf - 4}
              y2={top + 4 + i * 5}
              stroke="#94a3b8"
              strokeWidth={0.7}
              opacity={0.6}
            />
          ))}
        </g>
      );
    }
    case 'stator':
      return (
        <g>
          <ellipse
            cx={cx}
            cy={y}
            rx={half + 5}
            ry={15}
            fill="url(#tubingMetal)"
            stroke="#0f172a"
          />
          <ellipse
            cx={cx}
            cy={y}
            rx={half * 0.45}
            ry={8}
            fill="#0f172a"
            opacity={0.25}
          />
        </g>
      );
    case 'tubing':
    case 'joint':
      // Tubo = a coluna central; não desenha niple separado
      return null;
    default:
      return (
        <circle
          cx={cx}
          cy={y}
          r={3.5}
          fill="#0f766e"
          stroke="#fff"
          strokeWidth={1.2}
        />
      );
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <g>
      <rect x={0} y={0} width={12} height={12} rx={3} fill={color} />
      <text
        x={18}
        y={10}
        fontFamily={FONT}
        fontSize="10"
        fontWeight="600"
        fill={C.inkMuted}
      >
        {label}
      </text>
    </g>
  );
}
