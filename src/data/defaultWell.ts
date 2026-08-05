import type { WellData } from '../types';
import { defaultTampao } from '../types';

/**
 * Poço em branco — estado inicial do app e de "Novo poço".
 * Não carrega dados do poço anterior nem o exemplo CAU-07.
 */
export const emptyWell = (): WellData => ({
  wellName: '',
  lastIntervention: '',
  elevacaoMR: null,
  elevacaoBAP: null,
  totalDepth: null,
  fundoEncontrado: null,
  fundoData: '',
  wellhead: '',
  donut: '',
  tubingSize: '',
  extremidadeColuna: null,
  tampao: defaultTampao(),
  casings: [],
  components: [],
  perforations: [],
});

/** @deprecated Preferir emptyWell(); mantido só como referência de estrutura completa */
export const defaultWell: WellData = emptyWell();
