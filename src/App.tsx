import { useCallback, useEffect, useState } from 'react';
import { WellForm } from './components/WellForm';
import { WellSchematic } from './components/WellSchematic';
import { ColumnDetailSchematic } from './components/ColumnDetailSchematic';
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

  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const norm = normalizeWellData(parsed);
        if (norm) {
          setData(norm);
          saveProjectLocal(norm);
          flashSave('Projeto aberto · use Salvar projeto para gravar no disco');
        } else {
          alert('JSON inválido: faltam campos obrigatórios.');
        }
      } catch {
        alert('Não foi possível ler o arquivo JSON.');
      }
    };
    reader.readAsText(file);
  };

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

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">
          <span className="brand-mark">⛽</span>
          <div>
            <h1>Esquema Mecânico de Poço</h1>
            <p>
              Gere diagramas a partir de profundidade, sapatas, fases e
              canhoneado
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? 'Ocultar painel' : 'Mostrar painel'}
          </button>
          <button type="button" onClick={() => setData(defaultWell)}>
            Exemplo CAU-07
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSaveToDisk()}
            title="Salva um arquivo .json no disco (pode reabrir depois)"
          >
            Salvar projeto
          </button>
          <label
            className="btn-file"
            title="Abre um arquivo .json de projeto salvo no disco"
          >
            Abrir projeto
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportJson(f);
                e.target.value = '';
              }}
            />
          </label>
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
      </header>

      {saveMsg && <div className="save-toast no-print">{saveMsg}</div>}

      <main
        className={`app-main no-print ${panelOpen ? '' : 'panel-collapsed'}`}
      >
        {panelOpen && (
          <aside className="sidebar">
            <WellForm data={data} onChange={setData} />
          </aside>
        )}
        <section className="canvas">
          <div className="canvas-toolbar">
            <div className="view-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'well'}
                className={tab === 'well' ? 'tab active' : 'tab'}
                onClick={() => setTab('well')}
              >
                Esquema do poço
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'column'}
                className={tab === 'column' ? 'tab active' : 'tab'}
                onClick={() => setTab('column')}
              >
                Detalhe da coluna
              </button>
            </div>
            <span className="hint">
              {tab === 'well'
                ? 'Visão completa · componentes na base do revestimento de produção'
                : 'Escala ampliada · trechos da coluna sem sobreposição'}
              {' · '}
              <kbd>Ctrl</kbd>+<kbd>S</kbd> salva · PDF com 2 páginas coloridas
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
      </main>

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
