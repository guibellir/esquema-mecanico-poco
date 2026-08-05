/** Contador local de "Projeto sem nome NN" (independente da nuvem). */
const UNTITLED_SEQ_KEY = 'well-schematic:untitled-seq';

const UNTITLED_RE = /^projeto\s+sem\s+nome\s+(\d+)$/i;

/**
 * Extrai o maior índice de nomes no padrão "Projeto sem nome 01".
 */
export function maxUntitledIndex(names: string[]): number {
  let max = 0;
  for (const name of names) {
    const m = name.trim().match(UNTITLED_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return max;
}

function readLocalUntitledSeq(): number {
  try {
    const raw = localStorage.getItem(UNTITLED_SEQ_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLocalUntitledSeq(n: number): void {
  try {
    localStorage.setItem(UNTITLED_SEQ_KEY, String(n));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Nome usado no salvamento (nuvem / arquivo).
 * - Se o poço tem nome (ex.: 1-CAU-xxxxx) → usa esse nome.
 * - Senão → "Projeto sem nome 01", "Projeto sem nome 02", …
 *
 * `existingNames` deve incluir nomes já existentes na nuvem (e/ou locais)
 * para não colidir com projetos anteriores.
 */
export function nextUntitledProjectName(existingNames: string[] = []): string {
  const fromNames = maxUntitledIndex(existingNames);
  const fromLocal = readLocalUntitledSeq();
  const next = Math.max(fromNames, fromLocal) + 1;
  writeLocalUntitledSeq(next);
  return `Projeto sem nome ${String(next).padStart(2, '0')}`;
}

/**
 * Resolve o nome de salvamento a partir do wellName e do nome já atribuído na sessão.
 * Só gera um novo "sem nome" se ainda não houver nome de sessão e o poço estiver sem nome.
 */
export function resolveSaveName(
  wellName: string | undefined | null,
  sessionAssignedName: string | null,
  existingNames: string[] = []
): string {
  const trimmed = wellName?.trim() ?? '';
  if (trimmed) return trimmed;
  if (sessionAssignedName?.trim()) return sessionAssignedName.trim();
  return nextUntitledProjectName(existingNames);
}
