import type { ProjectFile, TampaoConfig, TubingComponent, WellData } from '../types';
import { defaultTampao } from '../types';

const KEY = 'well-schematic:project:v1';

export function buildProject(data: WellData): ProjectFile {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    data,
  };
}

export function projectFilename(data: WellData): string {
  const safe = (data.wellName || 'poco')
    .replace(/[^\w.\-À-ÿ]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `projeto-${safe || 'poco'}.json`;
}

/** Cache local (reabre no mesmo navegador). */
export function saveProjectLocal(data: WellData): ProjectFile {
  const project = buildProject(data);
  localStorage.setItem(KEY, JSON.stringify(project));
  return project;
}

/** @deprecated use saveProjectLocal */
export function saveProject(data: WellData): ProjectFile {
  return saveProjectLocal(data);
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

/**
 * Salva o projeto em arquivo no disco.
 * - Chrome/Edge: diálogo "Salvar como…" (File System Access API)
 * - Outros: download do .json (pasta Downloads)
 * Também atualiza o cache localStorage.
 */
export async function saveProjectToDisk(
  data: WellData
): Promise<{ ok: true; method: 'picker' | 'download'; name: string } | { ok: false; cancelled: true }> {
  const project = buildProject(data);
  const json = JSON.stringify(project, null, 2);
  const name = projectFilename(data);

  // Cache local sempre
  localStorage.setItem(KEY, json);

  // File System Access API (escolher pasta/arquivo no disco)
  const w = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle>;
  };

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'Projeto de esquema de poço',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return { ok: true, method: 'picker', name: handle.name || name };
    } catch (err) {
      // Usuário cancelou o diálogo
      const nameErr = err instanceof DOMException ? err.name : '';
      if (nameErr === 'AbortError') {
        return { ok: false, cancelled: true };
      }
      // API falhou — cai no download
      console.warn('showSaveFilePicker falhou, usando download:', err);
    }
  }

  // Fallback: download forçado
  downloadProjectBlob(json, name);
  return { ok: true, method: 'download', name };
}

function downloadProjectBlob(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadProject(data: WellData, filename?: string): void {
  const project = buildProject(data);
  downloadProjectBlob(
    JSON.stringify(project, null, 2),
    filename || projectFilename(data)
  );
  localStorage.setItem(KEY, JSON.stringify(project));
}

export function normalizeWellData(raw: unknown): WellData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<WellData> & { data?: WellData };
  // Aceita ProjectFile ou WellData puro
  const well = d.data && typeof d.data === 'object' ? d.data : (d as WellData);
  if (!well || typeof well !== 'object') return null;
  if (!Array.isArray(well.casings)) return null;

  type LegacyComp = {
    id: string;
    label: string;
    depth?: number | null;
    depthTop?: number | null;
    kind?: string;
  };
  const rawComps = (well.components ?? []) as LegacyComp[];

  // Migração: tampão que vinha como componente da coluna
  const plugComp = rawComps.find(
    (c) => c.kind === 'plug' || /^tamp/i.test(c.label ?? '')
  );
  const migratedTampao: TampaoConfig | null = plugComp
    ? {
        enabled: true,
        label: plugComp.label || 'Tampão',
        depthTop: plugComp.depthTop ?? null,
        depthBottom: plugComp.depth ?? null,
      }
    : null;

  const tampao: TampaoConfig = well.tampao
    ? {
        enabled: Boolean(well.tampao.enabled),
        label: well.tampao.label || 'Tampão',
        depthTop: well.tampao.depthTop ?? null,
        depthBottom: well.tampao.depthBottom ?? null,
      }
    : migratedTampao ?? defaultTampao();

  const validKinds = new Set<string>([
    'tubing',
    'reducer',
    'stator',
    'screen',
    'anchor',
    'packer',
    'filter',
    'joint',
    'other',
  ]);

  const components: TubingComponent[] = rawComps
    .filter(
      (c) =>
        !/^extrem/i.test(c.label ?? '') &&
        c.kind !== 'plug' &&
        !/^tamp/i.test(c.label ?? '')
    )
    .map((c) => ({
      id: c.id,
      label: c.label,
      depth: c.depth ?? null,
      kind: (validKinds.has(c.kind ?? '')
        ? c.kind
        : 'other') as TubingComponent['kind'],
    }));

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
      findExtremFromComponents(well.components) ??
      null,
    tampao,
    casings: well.casings ?? [],
    components,
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
