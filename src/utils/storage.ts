import type { ProjectFile, WellData } from '../types';

const KEY = 'well-schematic:project:v1';

export function saveProject(data: WellData): ProjectFile {
  const project: ProjectFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    data,
  };
  localStorage.setItem(KEY, JSON.stringify(project));
  return project;
}

export function loadProject(): ProjectFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectFile;
    if (parsed?.version === 1 && parsed.data?.wellName !== undefined) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearProject(): void {
  localStorage.removeItem(KEY);
}

export function downloadProject(data: WellData, filename?: string): void {
  const project: ProjectFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ||
    `projeto-${data.wellName.replace(/\s+/g, '_') || 'poco'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function normalizeWellData(raw: unknown): WellData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<WellData> & { data?: WellData };
  // Aceita ProjectFile ou WellData puro
  const well = d.data && typeof d.data === 'object' ? d.data : (d as WellData);
  if (!well || typeof well !== 'object') return null;
  if (!Array.isArray(well.casings)) return null;

  return {
    wellName: well.wellName ?? '',
    lastIntervention: well.lastIntervention ?? '',
    elevacaoMR: well.elevacaoMR ?? null,
    elevacaoBAP: well.elevacaoBAP ?? null,
    totalDepth: well.totalDepth ?? null,
    fundoEncontrado: well.fundoEncontrado ?? null,
    fundoData: well.fundoData ?? '',
    wellhead: well.wellhead ?? '',
    donut: well.donut ?? '',
    tubingSize: well.tubingSize ?? '',
    extremidadeColuna:
      well.extremidadeColuna ??
      // migração: pegar do antigo componente EXTREM se existir
      findExtremFromComponents(well.components) ??
      null,
    casings: well.casings ?? [],
    components: (well.components ?? [])
      .filter((c) => !/^extrem/i.test(c.label ?? ''))
      .map((c) => ({
        ...c,
        depthTop: c.depthTop ?? null,
      })),
    perforations: well.perforations ?? [],
  };
}

function findExtremFromComponents(
  comps: WellData['components'] | undefined
): number | null {
  if (!comps) return null;
  const hit = comps.find((c) => /^extrem/i.test(c.label ?? ''));
  return hit?.depth ?? null;
}
