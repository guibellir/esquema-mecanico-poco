import { useCallback, useEffect, useRef, useState } from 'react';
import { WellForm } from './components/WellForm';
import { WellSchematic } from './components/WellSchematic';
import { ColumnDetailSchematic } from './components/ColumnDetailSchematic';
import { CloudPanel } from './components/CloudPanel';
import { defaultWell } from './data/defaultWell';
import type { WellData } from './types';
import {
  loadProject,
  normalizeWellData,
  saveProjectLocal,
  saveProjectToDisk,
} from './utils/storage';
import { svgElementToPngDataUrl } from './utils/svgToPng';
import './App.css';

type ViewTab = 'well' | 'column';
/** Fluxo mobile: primeiro parâmetros, depois o desenho */
type MobileStep = 'params' | 'scheme';

const MOBILE_MQ = '(max-width: 900px)';

function App() {
  const [data, setData] = useState<WellData>(() => {
    const saved = loadProject();
    if (saved) {
      const norm = normalizeWellData(saved);
      if (norm) return norm;
    }
    return defaultWell;
  });
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<ViewTab>('well');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false
  );
  const [mobileStep, setMobileStep] = useState<MobileStep>('params');
  const [moreOpen, setMoreOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const openFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) {
        setMobileStep('params');
        setMoreOpen(false);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const flashSave = useCallback((msg: string) => {
    setSaveMsg(msg);
    window.setTimeout(() => setSaveMsg(null), 2200);
  }, []);

  const handleSaveToDisk = useCallback(async () => {
    const result = await saveProjectToDisk(data);
    if (!result.ok) {
      flashSave('Salvamento cancelado');
      return;
    }
    if (result.method === 'picker') {
      flashSave(`Salvo no disco: ${result.name}`);
    } else {
      flashSave(`Arquivo baixado: ${result.name} (use Abrir projeto para reabrir)`);
    }
  }, [data, flashSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveToDisk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSaveToDisk]);

  const handleExportSvg = () => {
    const sel =
      tab === 'column'
        ? '.print-page-column .schematic-svg, .canvas-scroll .schematic-svg'
        : '.print-page-well .schematic-svg, .canvas-scroll .schematic-svg';
    const svg =
      document.querySelector(sel) ?? document.querySelector('.schematic-svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob(
      ['<?xml version="1.0" encoding="UTF-8"?>\n', source],
      { type: 'image/svg+xml;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = tab === 'column' ? 'coluna' : 'poco';
    a.download = `esquema-${data.wellName.replace(/\s+/g, '_')}-${suffix}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProjectJson = useCallback(
    async (source: File | string, sourceName?: string) => {
      try {
        const text =
          typeof source === 'string' ? source : await source.text();
        const parsed = JSON.parse(text) as unknown;
        const norm = normalizeWellData(parsed);
        if (!norm) {
          alert(
            'JSON inválido: esperado um projeto de poço (com revestimentos/casings).'
          );
          return;
        }
        setData(norm);
        saveProjectLocal(norm);
        const name =
          sourceName ||
          (typeof source !== 'string' ? source.name : '') ||
          norm.wellName;
        flashSave(`Projeto importado: ${name}`);
      } catch {
        alert('Não foi possível importar o JSON. Verifique o arquivo.');
      }
    },
    [flashSave]
  );

  /** Abre seletor de arquivo .json e importa o projeto */
  const handleOpenProject = useCallback(async () => {
    const w = window as Window & {
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle[]>;
    };

    // Chrome/Edge: diálogo nativo “Abrir”
    if (typeof w.showOpenFilePicker === 'function') {
      try {
        const [handle] = await w.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Projeto JSON',
              accept: {
                'application/json': ['.json'],
                'text/json': ['.json'],
              },
            },
          ],
        });
        const file = await handle.getFile();
        await importProjectJson(file, file.name);
        return;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'AbortError') return;
        // fallback para <input type="file">
      }
    }

    openFileRef.current?.click();
  }, [importProjectJson]);

  /**
   * Impressão na MESMA página: rasteriza os SVGs em PNG (cores iguais à tela)
   * e manda imprimir 2 páginas. Sem popup.
   */
  const handlePrint = async () => {
    if (printing) return;
    setPrinting(true);
    flashSave('Preparando PDF com cores…');

    try {
      const svgs = Array.from(
        document.querySelectorAll('.print-root .schematic-svg')
      ) as SVGElement[];

      if (svgs.length === 0) {
        alert('Nenhum esquema encontrado para imprimir.');
        return;
      }

      // Garante layout calculado (print-root fica off-screen mas com tamanho real)
      const root = document.querySelector('.print-root') as HTMLElement | null;
      if (root) {
        root.classList.add('print-root-prepare');
        void root.offsetHeight;
      }

      const titles = [
        `Esquema do poço — ${data.wellName}`,
        `Detalhe da coluna — ${data.wellName}`,
      ];

      const pngs: string[] = [];
      for (const svg of svgs) {
        pngs.push(await svgElementToPngDataUrl(svg, 2));
      }

      // Remove raster anterior
      document.getElementById('print-raster')?.remove();

      const holder = document.createElement('div');
      holder.id = 'print-raster';
      holder.setAttribute('aria-hidden', 'true');

      pngs.forEach((src, i) => {
        const page = document.createElement('div');
        page.className = 'print-raster-page';
        const h = document.createElement('div');
        h.className = 'print-raster-title';
        h.textContent = titles[i] ?? `Página ${i + 1}`;
        const img = document.createElement('img');
        img.src = src;
        img.alt = titles[i] ?? '';
        img.className = 'print-raster-img';
        page.appendChild(h);
        page.appendChild(img);
        holder.appendChild(page);
      });

      document.body.appendChild(holder);

      // Espera as imagens decodificarem
      await Promise.all(
        Array.from(holder.querySelectorAll('img')).map(
          (img) =>
            img.decode?.().catch(() => undefined) ??
            new Promise<void>((res) => {
              if (img.complete) res();
              else {
                img.onload = () => res();
                img.onerror = () => res();
              }
            })
        )
      );

      const cleanup = () => {
        document.getElementById('print-raster')?.remove();
        root?.classList.remove('print-root-prepare');
        setPrinting(false);
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);

      // Fallback se afterprint não disparar (alguns browsers)
      window.setTimeout(() => {
        if (document.getElementById('print-raster')) {
          // ainda no diálogo — não limpa cedo demais
        }
      }, 0);

      window.print();

      // Safari / alguns Chromes: limpa após delay se afterprint falhar
      window.setTimeout(cleanup, 60_000);
    } catch (err) {
      console.error(err);
      alert(
        'Não foi possível preparar a impressão. Tente novamente ou use Baixar SVG.'
      );
      document.getElementById('print-raster')?.remove();
      document
        .querySelector('.print-root')
        ?.classList.remove('print-root-prepare');
      setPrinting(false);
    }
  };

  const showForm = isMobile
    ? mobileStep === 'params'
    : panelOpen;
  const showScheme = isMobile
    ? mobileStep === 'scheme'
    : true;

  const goToScheme = () => {
    setMobileStep('scheme');
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToParams = () => {
    setMobileStep('params');
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      className={`app ${isMobile ? `app-mobile app-mobile-${mobileStep}` : 'app-desktop'}`}
    >
      <header className="app-header no-print">
        <div className="brand">
          <span className="brand-mark">⛽</span>
          <div>
            <h1>Esquema Mecânico de Poço</h1>
            <p className="brand-sub">
              {isMobile
                ? mobileStep === 'params'
                  ? '1/2 · Preencha os parâmetros do poço'
                  : '2/2 · Esquema gerado'
                : 'Gere diagramas a partir de profundidade, sapatas, fases e canhoneado'}
            </p>
          </div>
        </div>

        {/* Desktop: todas as ações */}
        <div className="header-actions header-actions-desktop">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setLibraryOpen(true)}
            title="Biblioteca de esquemas na nuvem"
          >
            Projetos na nuvem
          </button>
          <button type="button" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? 'Ocultar painel' : 'Mostrar painel'}
          </button>
          <button type="button" onClick={() => setData(defaultWell)}>
            Exemplo CAU-07
          </button>
          <button
            type="button"
            onClick={() => void handleSaveToDisk()}
            title="Salva um arquivo .json no disco"
          >
            Salvar JSON
          </button>
          <button
            type="button"
            onClick={() => void handleOpenProject()}
            title="Importa um arquivo .json de projeto salvo"
          >
            Importar JSON
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleExportSvg}
          >
            Baixar SVG
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handlePrint()}
            disabled={printing}
          >
            {printing ? 'Preparando…' : 'Imprimir / PDF'}
          </button>
        </div>

        {/* Mobile: ações compactas por etapa */}
        <div className="header-actions header-actions-mobile">
          {mobileStep === 'scheme' && (
            <button type="button" className="btn-ghost" onClick={goToParams}>
              ← Parâmetros
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setMoreOpen(false);
              setLibraryOpen(true);
            }}
          >
            Nuvem
          </button>
          <button
            type="button"
            className="btn-more"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            Mais
          </button>
        </div>
      </header>

      {moreOpen && isMobile && (
        <div className="mobile-more no-print">
          <button
            type="button"
            onClick={() => {
              setData(defaultWell);
              setMoreOpen(false);
            }}
          >
            Exemplo CAU-07
          </button>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              setLibraryOpen(true);
            }}
          >
            Projetos na nuvem
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSaveToDisk();
              setMoreOpen(false);
            }}
          >
            Salvar JSON (disco)
          </button>
          <button
            type="button"
            onClick={() => {
              void handleOpenProject();
              setMoreOpen(false);
            }}
          >
            Importar JSON
          </button>
          {mobileStep === 'scheme' && (
            <>
              <button
                type="button"
                onClick={() => {
                  handleExportSvg();
                  setMoreOpen(false);
                }}
              >
                Baixar SVG
              </button>
              <button
                type="button"
                disabled={printing}
                onClick={() => {
                  void handlePrint();
                  setMoreOpen(false);
                }}
              >
                {printing ? 'Preparando…' : 'Imprimir / PDF'}
              </button>
            </>
          )}
        </div>
      )}

      <input
        ref={openFileRef}
        type="file"
        accept="application/json,.json,text/json,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importProjectJson(f, f.name);
          e.target.value = '';
        }}
      />

      {saveMsg && <div className="save-toast no-print">{saveMsg}</div>}

      {/* Stepper mobile */}
      {isMobile && (
        <nav className="mobile-stepper no-print" aria-label="Etapas">
          <button
            type="button"
            className={mobileStep === 'params' ? 'active' : ''}
            onClick={goToParams}
          >
            <span className="step-num">1</span>
            Parâmetros
          </button>
          <span className="step-sep" aria-hidden>
            →
          </span>
          <button
            type="button"
            className={mobileStep === 'scheme' ? 'active' : ''}
            onClick={goToScheme}
          >
            <span className="step-num">2</span>
            Esquema
          </button>
        </nav>
      )}

      <main
        className={[
          'app-main',
          'no-print',
          !showForm && !isMobile ? 'panel-collapsed' : '',
          isMobile ? `mobile-step-${mobileStep}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {showForm && (
          <aside className="sidebar">
            <WellForm data={data} onChange={setData} />
          </aside>
        )}

        {showScheme && (
          <section className="canvas">
            <div className="canvas-toolbar">
              {isMobile && (
                <button
                  type="button"
                  className="btn-back-params"
                  onClick={goToParams}
                >
                  ← Editar parâmetros
                </button>
              )}
              <div className="view-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'well'}
                  className={tab === 'well' ? 'tab active' : 'tab'}
                  onClick={() => setTab('well')}
                >
                  Poço
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'column'}
                  className={tab === 'column' ? 'tab active' : 'tab'}
                  onClick={() => setTab('column')}
                >
                  Coluna
                </button>
              </div>
              <span className="hint hint-desktop">
                {tab === 'well'
                  ? 'Visão completa · componentes na base do revestimento de produção'
                  : 'Escala ampliada · trechos da coluna sem sobreposição'}
                {' · '}
                <kbd>Ctrl</kbd>+<kbd>S</kbd> salva · PDF com 2 páginas
              </span>
            </div>
            <div className="canvas-scroll">
              {tab === 'well' ? (
                <WellSchematic data={data} />
              ) : (
                <ColumnDetailSchematic data={data} />
              )}
            </div>
          </section>
        )}
      </main>

      {/* CTA mobile: gerar esquema a partir dos parâmetros */}
      {isMobile && mobileStep === 'params' && (
        <div className="mobile-cta no-print">
          <button type="button" className="btn-generate" onClick={goToScheme}>
            Gerar esquema
          </button>
          <p className="mobile-cta-hint">
            Você poderá voltar e editar os parâmetros a qualquer momento
          </p>
        </div>
      )}

      {/* Ações rápidas no esquema (mobile) */}
      {isMobile && mobileStep === 'scheme' && (
        <div className="mobile-cta mobile-cta-scheme no-print">
          <button type="button" className="btn-ghost-wide" onClick={goToParams}>
            Editar parâmetros
          </button>
          <button
            type="button"
            className="btn-generate btn-generate-secondary"
            onClick={() => void handlePrint()}
            disabled={printing}
          >
            {printing ? 'Preparando…' : 'PDF'}
          </button>
        </div>
      )}

      <CloudPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        data={data}
        onLoadProject={(well) => {
          setData(well);
          saveProjectLocal(well);
        }}
        onMessage={flashSave}
      />

      {/* Fonte dos SVGs para rasterizar (fora da tela, com tamanho real) */}
      <div className="print-root" aria-hidden="true">
        <div className="print-page print-page-well">
          <WellSchematic data={data} />
        </div>
        <div className="print-page print-page-column">
          <ColumnDetailSchematic data={data} />
        </div>
      </div>
    </div>
  );
}

export default App;
