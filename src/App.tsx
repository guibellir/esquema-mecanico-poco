import { useCallback, useEffect, useRef, useState } from 'react';
import { WellForm } from './components/WellForm';
import { WellSchematic } from './components/WellSchematic';
import { ColumnDetailSchematic } from './components/ColumnDetailSchematic';
import { CloudPanel } from './components/CloudPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { emptyWell } from './data/defaultWell';
import type { WellData } from './types';
import {
  clearProject,
  normalizeWellData,
  saveProjectLocal,
  saveProjectToDisk,
} from './utils/storage';
import {
  createProject,
  getToken,
  isCloudConfigured,
  listProjects,
  updateProject,
} from './utils/cloudApi';
import { resolveSaveName } from './utils/projectName';
import { svgElementToPngDataUrl } from './utils/svgToPng';
import './App.css';

type ViewTab = 'well' | 'column';
/** Fluxo mobile: primeiro parâmetros, depois o desenho */
type MobileStep = 'params' | 'scheme';
type CloudSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'need-login';

const MOBILE_MQ = '(max-width: 900px)';
/** Debounce do autosave na nuvem (ms) */
const CLOUD_AUTOSAVE_MS = 900;

function isWellDirty(data: WellData): boolean {
  if (data.wellName.trim()) return true;
  if (data.lastIntervention.trim()) return true;
  if (data.elevacaoMR != null) return true;
  if (data.elevacaoBAP != null) return true;
  if (data.totalDepth != null) return true;
  if (data.fundoEncontrado != null) return true;
  if (data.fundoData.trim()) return true;
  if (data.wellhead.trim()) return true;
  if (data.donut.trim()) return true;
  if (data.tubingSize.trim()) return true;
  if (data.extremidadeColuna != null) return true;
  if (data.tampao?.enabled) return true;
  if (data.casings.length > 0) return true;
  if (data.components.length > 0) return true;
  if (data.perforations.length > 0) return true;
  return false;
}

function App() {
  // Abre sempre limpo — sem restaurar poço anterior do localStorage
  const [data, setData] = useState<WellData>(() => emptyWell());
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
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] =
    useState<CloudSaveStatus>('idle');
  const [sessionStarted, setSessionStarted] = useState(false);
  const openFileRef = useRef<HTMLInputElement>(null);

  /** Nome já atribuído na nuvem nesta sessão (ex.: "Projeto sem nome 01") */
  const saveNameRef = useRef<string | null>(null);
  const cloudProjectIdRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveSeqRef = useRef(0);
  /** Evita autosave no momento em que o poço é carregado da nuvem/JSON */
  const suppressAutosaveRef = useRef(false);

  useEffect(() => {
    cloudProjectIdRef.current = cloudProjectId;
  }, [cloudProjectId]);

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

  const beginSession = useCallback(() => {
    setWelcomeOpen(false);
    setSessionStarted(true);
  }, []);

  const resetToNewWell = useCallback(
    (opts?: { confirm?: boolean; showWelcome?: boolean }) => {
      if (opts?.confirm !== false && isWellDirty(data)) {
        const ok = window.confirm(
          'Descartar o poço atual e começar um novo? As alterações já salvas na nuvem permanecem.'
        );
        if (!ok) return;
      }
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      suppressAutosaveRef.current = true;
      saveNameRef.current = null;
      cloudProjectIdRef.current = null;
      setCloudProjectId(null);
      setData(emptyWell());
      clearProject();
      setCloudSaveStatus('idle');
      setTab('well');
      setMobileStep('params');
      setMoreOpen(false);
      if (opts?.showWelcome) {
        setWelcomeOpen(true);
        setSessionStarted(false);
      } else {
        setWelcomeOpen(false);
        setSessionStarted(true);
        flashSave('Novo poço em branco');
      }
      window.setTimeout(() => {
        suppressAutosaveRef.current = false;
      }, 0);
    },
    [data, flashSave]
  );

  /**
   * Autosave no banco da nuvem (create/update no Postgres via API).
   * Nome = wellName (ex. 1-CAU-xxxxx) ou "Projeto sem nome 01", 02…
   */
  const persistToCloud = useCallback(
    async (
      well: WellData,
      opts?: { silent?: boolean; force?: boolean }
    ): Promise<boolean> => {
      if (!isCloudConfigured()) {
        setCloudSaveStatus('error');
        if (!opts?.silent) flashSave('API da nuvem não configurada');
        return false;
      }
      if (!getToken()) {
        setCloudSaveStatus('need-login');
        if (!opts?.silent) {
          setLibraryOpen(true);
          flashSave('Faça login para salvar na nuvem');
        }
        return false;
      }
      if (!opts?.force && !isWellDirty(well) && !cloudProjectIdRef.current) {
        setCloudSaveStatus('idle');
        return true;
      }

      setCloudSaving(true);
      setCloudSaveStatus('saving');
      try {
        let existingNames: string[] = [];
        if (!well.wellName?.trim() && !saveNameRef.current) {
          try {
            const projects = await listProjects();
            existingNames = projects.map((p) => p.name);
          } catch {
            existingNames = [];
          }
        }

        const name = resolveSaveName(
          well.wellName,
          saveNameRef.current,
          existingNames
        );
        saveNameRef.current = name;

        if (cloudProjectIdRef.current) {
          await updateProject(cloudProjectIdRef.current, name, well);
        } else {
          const p = await createProject(name, well);
          cloudProjectIdRef.current = p.id;
          setCloudProjectId(p.id);
        }

        // Cache local só como backup da sessão (não restaura na abertura)
        saveProjectLocal(well);
        setCloudSaveStatus('saved');
        if (!opts?.silent) flashSave(`Salvo na nuvem: ${name}`);
        return true;
      } catch (e) {
        setCloudSaveStatus('error');
        if (!opts?.silent) {
          flashSave(e instanceof Error ? e.message : 'Erro ao salvar na nuvem');
        }
        return false;
      } finally {
        setCloudSaving(false);
      }
    },
    [flashSave]
  );

  const handleSaveToCloud = useCallback(async () => {
    await persistToCloud(data, { silent: false, force: true });
  }, [data, persistToCloud]);

  // Autosave na nuvem a cada alteração (debounced)
  useEffect(() => {
    if (!sessionStarted || welcomeOpen) return;
    if (suppressAutosaveRef.current) return;

    setCloudSaveStatus((s) => (s === 'saving' ? s : 'pending'));

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    const seq = ++autosaveSeqRef.current;
    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        if (seq !== autosaveSeqRef.current) return;
        await persistToCloud(data, { silent: true });
      })();
    }, CLOUD_AUTOSAVE_MS);

    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [data, sessionStarted, welcomeOpen, persistToCloud]);

  const handleSaveToDisk = useCallback(async () => {
    const result = await saveProjectToDisk(data);
    if (!result.ok) {
      flashSave('Salvamento cancelado');
      return;
    }
    if (result.method === 'picker') {
      flashSave(`Salvo no disco: ${result.name}`);
    } else {
      flashSave(`Arquivo baixado: ${result.name}`);
    }
  }, [data, flashSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveToCloud();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSaveToCloud]);

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
    const safeName = (data.wellName || 'poco').replace(/\s+/g, '_');
    a.download = `esquema-${safeName}-${suffix}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyLoadedWell = useCallback(
    (
      well: WellData,
      opts?: { cloudId?: string | null; saveName?: string | null }
    ) => {
      suppressAutosaveRef.current = true;
      setData(well);
      saveProjectLocal(well);
      if (opts?.cloudId !== undefined) {
        cloudProjectIdRef.current = opts.cloudId;
        setCloudProjectId(opts.cloudId);
      }
      if (opts?.saveName !== undefined) {
        saveNameRef.current = opts.saveName;
      } else if (well.wellName?.trim()) {
        saveNameRef.current = well.wellName.trim();
      }
      setCloudSaveStatus(opts?.cloudId ? 'saved' : 'idle');
      beginSession();
      window.setTimeout(() => {
        suppressAutosaveRef.current = false;
      }, 0);
    },
    [beginSession]
  );

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
        // Import JSON vira um novo registro na nuvem (sem id)
        applyLoadedWell(norm, { cloudId: null, saveName: null });
        const name =
          sourceName ||
          (typeof source !== 'string' ? source.name : '') ||
          norm.wellName;
        flashSave(`Projeto importado: ${name}`);
        // Dispara autosave na nuvem em seguida
        window.setTimeout(() => {
          void persistToCloud(norm, { silent: true });
        }, CLOUD_AUTOSAVE_MS);
      } catch {
        alert('Não foi possível importar o JSON. Verifique o arquivo.');
      }
    },
    [applyLoadedWell, flashSave, persistToCloud]
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

      const root = document.querySelector('.print-root') as HTMLElement | null;
      if (root) {
        root.classList.add('print-root-prepare');
        void root.offsetHeight;
      }

      const titles = [
        `Esquema do poço — ${data.wellName || 'sem nome'}`,
        `Detalhe da coluna — ${data.wellName || 'sem nome'}`,
      ];

      const pngs: string[] = [];
      for (const svg of svgs) {
        pngs.push(await svgElementToPngDataUrl(svg, 2));
      }

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

      window.print();
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

  const showForm = isMobile ? mobileStep === 'params' : panelOpen;
  const showScheme = isMobile ? mobileStep === 'scheme' : true;

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

  const cloudStatusLabel = (() => {
    switch (cloudSaveStatus) {
      case 'pending':
        return 'Alterações pendentes…';
      case 'saving':
        return 'Salvando na nuvem…';
      case 'saved':
        return cloudProjectId
          ? `Nuvem · ${saveNameRef.current || data.wellName || 'ok'}`
          : 'Salvo na nuvem';
      case 'error':
        return 'Falha ao salvar na nuvem';
      case 'need-login':
        return 'Login necessário para autosave';
      default:
        return null;
    }
  })();

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
          {cloudStatusLabel && (
            <span
              className={`cloud-save-status status-${cloudSaveStatus}`}
              title="Autosave no banco da nuvem a cada alteração"
            >
              {cloudSaving ? 'Salvando…' : cloudStatusLabel}
            </span>
          )}
          <button
            type="button"
            className="btn-new-well"
            onClick={() => resetToNewWell({ confirm: true })}
            title="Limpa o formulário e inicia um poço novo"
          >
            Novo poço
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSaveToCloud()}
            disabled={cloudSaving}
            title="Salva agora no servidor (autosave já grava a cada alteração)"
          >
            {cloudSaving
              ? 'Salvando…'
              : cloudProjectId
                ? 'Atualizar na nuvem'
                : 'Salvar na nuvem'}
          </button>
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            title="Biblioteca de esquemas na nuvem"
          >
            Projetos
          </button>
          <button type="button" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? 'Ocultar painel' : 'Mostrar painel'}
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
            className="btn-new-well"
            onClick={() => {
              setMoreOpen(false);
              resetToNewWell({ confirm: true });
            }}
          >
            Novo
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={cloudSaving}
            onClick={() => {
              setMoreOpen(false);
              void handleSaveToCloud();
            }}
          >
            {cloudSaving ? '…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              setLibraryOpen(true);
            }}
          >
            Projetos
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
              setMoreOpen(false);
              resetToNewWell({ confirm: true });
            }}
          >
            Novo poço
          </button>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              void handleSaveToCloud();
            }}
          >
            Salvar na nuvem
          </button>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              setLibraryOpen(true);
            }}
          >
            Biblioteca de projetos
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

      {welcomeOpen && (
        <WelcomeScreen
          cloudAvailable={isCloudConfigured()}
          onNewWell={() => {
            resetToNewWell({ confirm: false, showWelcome: false });
          }}
          onLoadCloud={() => {
            beginSession();
            setLibraryOpen(true);
          }}
          onImportJson={() => {
            beginSession();
            void handleOpenProject();
          }}
        />
      )}

      {/* Stepper mobile */}
      {isMobile && !welcomeOpen && (
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
                Autosave na nuvem · <kbd>Ctrl</kbd>+<kbd>S</kbd> salva agora
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

      {isMobile && mobileStep === 'params' && !welcomeOpen && (
        <div className="mobile-cta no-print">
          <button type="button" className="btn-generate" onClick={goToScheme}>
            Gerar esquema
          </button>
          <p className="mobile-cta-hint">
            Você poderá voltar e editar os parâmetros a qualquer momento
          </p>
        </div>
      )}

      {isMobile && mobileStep === 'scheme' && !welcomeOpen && (
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
        onClose={() => {
          setLibraryOpen(false);
          // Se o autosave falhou por falta de login e o usuário entrou na biblioteca
          if (
            sessionStarted &&
            getToken() &&
            isCloudConfigured() &&
            cloudSaveStatus === 'need-login' &&
            isWellDirty(data)
          ) {
            void persistToCloud(data, { silent: true });
          }
        }}
        data={data}
        currentId={cloudProjectId}
        onCurrentIdChange={(id) => {
          cloudProjectIdRef.current = id;
          setCloudProjectId(id);
        }}
        onLoadProject={(well, meta) => {
          applyLoadedWell(well, {
            cloudId: meta?.id ?? null,
            saveName: meta?.name ?? (well.wellName?.trim() || null),
          });
        }}
        onMessage={flashSave}
      />

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
