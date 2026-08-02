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
  /**
   * Topo do trecho (m). Obrigatório p/ tampão/tampa (fecha o furo do
   * revestimento de produção entre topo e base). Opcional nos demais.
   */
  depthTop?: number | null;
  kind:
    | 'tubing'
    | 'reducer'
    | 'stator'
    | 'screen'
    | 'anchor'
    | 'filter'
    | 'plug'
    | 'joint'
    | 'other';
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
  /** Extremidade da coluna de produção (m) — componentes ficam acima */
  extremidadeColuna: number | null;
  casings: CasingPhase[];
  components: TubingComponent[];
  perforations: Perforation[];
};

export type ProjectFile = {
  version: 1;
  savedAt: string;
  data: WellData;
};
