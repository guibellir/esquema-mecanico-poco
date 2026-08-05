type Props = {
  onNewWell: () => void;
  onLoadCloud: () => void;
  onImportJson: () => void;
  cloudAvailable: boolean;
};

/**
 * Tela inicial: app abre limpo e a pessoa escolhe o caminho.
 */
export function WelcomeScreen({
  onNewWell,
  onLoadCloud,
  onImportJson,
  cloudAvailable,
}: Props) {
  return (
    <div className="welcome-overlay no-print" role="dialog" aria-modal="true">
      <div className="welcome-card">
        <div className="welcome-mark" aria-hidden>
          ⛽
        </div>
        <p className="welcome-kicker">Esquema mecânico de poço</p>
        <h2>Como deseja começar?</h2>
        <p className="welcome-sub">
          O sistema abre sem dados do poço anterior. Escolha criar um poço novo
          ou carregar um esquema já salvo.
        </p>

        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-btn welcome-btn-primary"
            onClick={onNewWell}
          >
            <span className="welcome-btn-title">Novo poço</span>
            <span className="welcome-btn-desc">
              Começar do zero com formulário em branco
            </span>
          </button>

          <button
            type="button"
            className="welcome-btn"
            onClick={onLoadCloud}
            disabled={!cloudAvailable}
            title={
              cloudAvailable
                ? 'Abrir biblioteca de projetos na nuvem'
                : 'API da nuvem não configurada'
            }
          >
            <span className="welcome-btn-title">Carregar da nuvem</span>
            <span className="welcome-btn-desc">
              {cloudAvailable
                ? 'Abrir um esquema salvo no servidor'
                : 'Nuvem indisponível neste ambiente'}
            </span>
          </button>

          <button
            type="button"
            className="welcome-btn welcome-btn-ghost"
            onClick={onImportJson}
          >
            <span className="welcome-btn-title">Importar JSON</span>
            <span className="welcome-btn-desc">
              Carregar arquivo .json do computador
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
