export type CasingPhase = {
  id: string;
  name: string;
  diameter: string;
  grade: string;
  weight: string;
  depthTop: number | null;
  depthBottom: number | null;
  color?: string;
};

export type TubingComponent = {
  id: string;
  label: string;
  /** Base (fim) do trecho em m — início = base do componente anterior (ou 0) */
  depth: number | null;
  kind:
    | 'tubing'
    | 'reducer'
    | 'stator'
    | 'screen'
    | 'anchor'
    | 'filter'
    | 'packer'
    | 'joint'
    | 'other';
};

/** Tampão / tampa — opcional, DEPOIS da coluna (não faz parte da coluna) */
export type TampaoConfig = {
  enabled: boolean;
  label: string;
  /** Topo do fechamento (m) */
  depthTop: number | null;
  /** Base do fechamento (m) */
  depthBottom: number | null;
};

export type Perforation = {
  id: string;
  top: number | null;
  bottom: number | null;
  status: 'aberto' | 'fechado';
};

export type WellData = {
  wellName: string;
  lastIntervention: string;
  elevacaoMR: number | null;
  elevacaoBAP: number | null;
  totalDepth: number | null;
  fundoEncontrado: number | null;
  fundoData: string;
  wellhead: string;
  donut: string;
  tubingSize: string;
  /** Extremidade da coluna de produção (m) — componentes da coluna ficam acima */
  extremidadeColuna: number | null;
  /** Tampão opcional após a coluna */
  tampao: TampaoConfig;
  casings: CasingPhase[];
  components: TubingComponent[];
  perforations: Perforation[];
};

export type ProjectFile = {
  version: 1;
  savedAt: string;
  data: WellData;
};

export const defaultTampao = (): TampaoConfig => ({
  enabled: false,
  label: 'Tampão',
  depthTop: null,
  depthBottom: null,
});
