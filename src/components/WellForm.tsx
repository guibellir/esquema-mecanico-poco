import type {
  CasingPhase,
  Perforation,
  TubingComponent,
  WellData,
} from '../types';
import { n } from '../utils/num';
import { uid } from '../utils/id';
import { NumInput } from './NumInput';

type Props = {
  data: WellData;
  onChange: (data: WellData) => void;
};

export function WellForm({ data, onChange }: Props) {
  const set = <K extends keyof WellData>(key: K, value: WellData[K]) => {
    onChange({ ...data, [key]: value });
  };

  const updateCasing = (id: string, patch: Partial<CasingPhase>) => {
    set(
      'casings',
      data.casings.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const addCasing = () => {
    set('casings', [
      ...data.casings,
      {
        id: uid('casing'),
        name: 'Novo revestimento',
        diameter: '9.5/8"',
        grade: 'K-55',
        weight: '40 lb/ft',
        depthTop: 0,
        depthBottom: 300,
      },
    ]);
  };

  const removeCasing = (id: string) => {
    set(
      'casings',
      data.casings.filter((c) => c.id !== id)
    );
  };

  const updateComp = (id: string, patch: Partial<TubingComponent>) => {
    set(
      'components',
      data.components.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const extrem = n(data.extremidadeColuna, n(data.totalDepth, 600));

  const addComp = () => {
    const depths = data.components
      .map((c) => c.depth)
      .filter((d): d is number => d != null);
    const maxComp = depths.length ? Math.max(...depths) : 0;
    const next = Math.min(maxComp + 20, Math.max(0, extrem - 1));
    set('components', [
      ...data.components,
      {
        id: uid('comp'),
        label: 'Novo componente',
        depth: next,
        kind: 'other',
      },
    ]);
  };

  const removeComp = (id: string) => {
    set(
      'components',
      data.components.filter((c) => c.id !== id)
    );
  };

  const updatePerf = (id: string, patch: Partial<Perforation>) => {
    set(
      'perforations',
      data.perforations.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };

  const addPerf = () => {
    set('perforations', [
      ...data.perforations,
      {
        id: uid('perf'),
        top: 500,
        bottom: 510,
        status: 'aberto',
      },
    ]);
  };

  const removePerf = (id: string) => {
    set(
      'perforations',
      data.perforations.filter((p) => p.id !== id)
    );
  };

  const belowExtrem = data.components.filter(
    (c) => c.depth != null && data.extremidadeColuna != null && c.depth > data.extremidadeColuna
  );

  return (
    <form className="well-form" onSubmit={(e) => e.preventDefault()}>
      <section className="form-section">
        <h2>Identificação</h2>
        <label>
          Nome do poço
          <input
            value={data.wellName}
            onChange={(e) => set('wellName', e.target.value)}
          />
        </label>
        <label>
          Última intervenção
          <input
            value={data.lastIntervention}
            onChange={(e) => set('lastIntervention', e.target.value)}
            placeholder="DD-MM-AAAA"
          />
        </label>
        <div className="row">
          <label>
            Elevação MR (m)
            <NumInput
              step="0.001"
              value={data.elevacaoMR}
              onChange={(v) => set('elevacaoMR', v)}
            />
          </label>
          <label>
            Elevação BAP (m)
            <NumInput
              step="0.001"
              value={data.elevacaoBAP}
              onChange={(v) => set('elevacaoBAP', v)}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Profundidade / Sapata (m)
            <NumInput
              step="0.01"
              value={data.totalDepth}
              onChange={(v) => set('totalDepth', v)}
            />
          </label>
          <label>
            Fundo encontrado (m)
            <NumInput
              step="0.01"
              value={data.fundoEncontrado}
              onChange={(v) => set('fundoEncontrado', v)}
            />
          </label>
        </div>
        <label>
          Data do fundo
          <input
            value={data.fundoData}
            onChange={(e) => set('fundoData', e.target.value)}
          />
        </label>
        <label>
          Cabeça de produção
          <input
            value={data.wellhead}
            onChange={(e) => set('wellhead', e.target.value)}
          />
        </label>
        <label>
          Donut / Árvore
          <input
            value={data.donut}
            onChange={(e) => set('donut', e.target.value)}
          />
        </label>
      </section>

      <section className="form-section">
        <div className="section-head">
          <h2>Fases / Revestimentos (Sapatas)</h2>
          <button type="button" className="btn-sm" onClick={addCasing}>
            + Fase
          </button>
        </div>
        {data.casings.map((c) => (
          <div key={c.id} className="card">
            <div className="card-head">
              <strong>{c.diameter || 'Fase'}</strong>
              <button
                type="button"
                className="btn-danger-sm"
                onClick={() => removeCasing(c.id)}
              >
                Remover
              </button>
            </div>
            <label>
              Nome
              <input
                value={c.name}
                onChange={(e) => updateCasing(c.id, { name: e.target.value })}
              />
            </label>
            <div className="row">
              <label>
                Diâmetro
                <input
                  value={c.diameter}
                  onChange={(e) =>
                    updateCasing(c.id, { diameter: e.target.value })
                  }
                />
              </label>
              <label>
                Grau
                <input
                  value={c.grade}
                  onChange={(e) =>
                    updateCasing(c.id, { grade: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="row">
              <label>
                Peso
                <input
                  value={c.weight}
                  onChange={(e) =>
                    updateCasing(c.id, { weight: e.target.value })
                  }
                />
              </label>
              <label>
                Sapata (m)
                <NumInput
                  step="0.01"
                  value={c.depthBottom}
                  onChange={(v) => updateCasing(c.id, { depthBottom: v })}
                />
              </label>
            </div>
          </div>
        ))}
      </section>

      <section className="form-section">
        <div className="section-head">
          <h2>Canhoneado</h2>
          <button type="button" className="btn-sm" onClick={addPerf}>
            + Intervalo
          </button>
        </div>
        {data.perforations.map((p) => (
          <div key={p.id} className="card">
            <div className="row">
              <label>
                Topo (m)
                <NumInput
                  step="0.01"
                  value={p.top}
                  onChange={(v) => updatePerf(p.id, { top: v })}
                />
              </label>
              <label>
                Base (m)
                <NumInput
                  step="0.01"
                  value={p.bottom}
                  onChange={(v) => updatePerf(p.id, { bottom: v })}
                />
              </label>
            </div>
            <div className="row">
              <label>
                Status
                <select
                  value={p.status}
                  onChange={(e) =>
                    updatePerf(p.id, {
                      status: e.target.value as Perforation['status'],
                    })
                  }
                >
                  <option value="aberto">Aberto</option>
                  <option value="fechado">Fechado</option>
                </select>
              </label>
              <button
                type="button"
                className="btn-danger-sm"
                onClick={() => removePerf(p.id)}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="form-section">
        <div className="section-head">
          <h2>Coluna / Componentes</h2>
          <button type="button" className="btn-sm" onClick={addComp}>
            + Componente
          </button>
        </div>

        <label>
          Extremidade da coluna (m)
          <NumInput
            step="0.01"
            value={data.extremidadeColuna}
            onChange={(v) => set('extremidadeColuna', v)}
            placeholder="ex: 600,11"
          />
        </label>
        <p className="field-hint">
          A coluna termina na extremidade. Cada componente é um{' '}
          <strong>trecho</strong>: a profundidade é a <strong>base</strong>{' '}
          (onde ele termina e o próximo começa). O 1º começa em 0 m no topo.
          Diferenças em cm são mostradas sem sobrepor na aba Detalhe da coluna.
        </p>

        {belowExtrem.length > 0 && (
          <div className="form-warn">
            {belowExtrem.length} componente(s) abaixo da extremidade (
            {data.extremidadeColuna} m). Ajuste as profundidades.
          </div>
        )}

        {data.components.map((c) => {
          const invalid =
            c.depth != null &&
            data.extremidadeColuna != null &&
            c.depth > data.extremidadeColuna;
          return (
            <div key={c.id} className={`card ${invalid ? 'card-invalid' : ''}`}>
              <label>
                Descrição
                <input
                  value={c.label}
                  onChange={(e) => updateComp(c.id, { label: e.target.value })}
                />
              </label>
              <label>
                Tipo
                <select
                  value={c.kind}
                  onChange={(e) =>
                    updateComp(c.id, {
                      kind: e.target.value as TubingComponent['kind'],
                    })
                  }
                >
                  <option value="tubing">Tubo</option>
                  <option value="reducer">Redução</option>
                  <option value="stator">Estator / BCP</option>
                  <option value="screen">Crivo</option>
                  <option value="anchor">Âncora</option>
                  <option value="filter">Filtro</option>
                  <option value="plug">Tampão / Tampa</option>
                  <option value="joint">Junta</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              {c.kind === 'plug' ? (
                <div className="row">
                  <label>
                    Topo da tampa (m)
                    <NumInput
                      step="0.001"
                      value={c.depthTop ?? null}
                      onChange={(v) => updateComp(c.id, { depthTop: v })}
                      placeholder="início do fechamento"
                    />
                  </label>
                  <label>
                    Base da tampa (m)
                    <NumInput
                      step="0.001"
                      value={c.depth}
                      onChange={(v) => updateComp(c.id, { depth: v })}
                      placeholder="fim do fechamento"
                    />
                  </label>
                </div>
              ) : (
                <label>
                  Base do trecho (m)
                  <NumInput
                    step="0.001"
                    value={c.depth}
                    onChange={(v) => updateComp(c.id, { depth: v })}
                    placeholder="fim do componente"
                  />
                </label>
              )}
              {c.kind === 'plug' && (
                <p className="field-hint">
                  A tampa fecha o interior do revestimento de produção entre
                  topo e base.
                </p>
              )}
              {invalid && (
                <p className="field-hint warn">
                  Deve ser ≤ extremidade ({data.extremidadeColuna} m)
                </p>
              )}
              <button
                type="button"
                className="btn-danger-sm"
                onClick={() => removeComp(c.id)}
              >
                Remover
              </button>
            </div>
          );
        })}
      </section>
    </form>
  );
}
