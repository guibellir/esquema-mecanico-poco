import { useEffect, useMemo, useState } from 'react';
import type { WellData } from '../types';
import {
  createProject,
  deleteProject,
  getProject,
  isCloudConfigured,
  listProjects,
  login,
  logout,
  me,
  register,
  updateProject,
  type CloudProjectSummary,
  type CloudUser,
} from '../utils/cloudApi';
import { resolveSaveName } from '../utils/projectName';

type LoadMeta = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  data: WellData;
  onLoadProject: (data: WellData, meta?: LoadMeta) => void;
  onMessage: (msg: string) => void;
  /** Projeto atualmente em edição na nuvem (controlado pelo App) */
  currentId: string | null;
  onCurrentIdChange: (id: string | null) => void;
  /** Opcional: resolve nome de salvamento (App pode sobrescrever) */
  onResolveSaveName?: (
    wellName: string,
    assigned: string | null
  ) => string;
};

export function CloudPanel({
  open,
  onClose,
  data,
  onLoadProject,
  onMessage,
  currentId,
  onCurrentIdChange,
  onResolveSaveName,
}: Props) {
  const configured = isCloudConfigured();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [query, setQuery] = useState('');
  /** Erro/sucesso visível DENTRO do painel (toast fica atrás do overlay) */
  const [authFeedback, setAuthFeedback] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);

  const refresh = async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const u = await me();
      setUser(u);
      if (u) {
        setProjects(await listProjects());
      } else {
        setProjects([]);
        // Não zera currentId só por abrir a biblioteca sem login —
        // o App controla o vínculo do autosave.
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro na nuvem');
    } finally {
      setLoading(false);
    }
  };

  const pickSaveName = async (): Promise<string> => {
    if (data.wellName?.trim()) return data.wellName.trim();
    let existing: string[] = projects.map((p) => p.name);
    try {
      existing = (await listProjects()).map((p) => p.name);
    } catch {
      // mantém lista em memória
    }
    if (onResolveSaveName) {
      return onResolveSaveName(data.wellName, null);
    }
    return resolveSaveName(data.wellName, null, existing);
  };

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const handleAuth = async () => {
    const mail = email.trim();
    const pass = password;
    if (!mail) {
      setAuthFeedback({ type: 'error', text: 'Informe o email.' });
      return;
    }
    if (!mail.includes('@')) {
      setAuthFeedback({ type: 'error', text: 'Email inválido.' });
      return;
    }
    if (pass.length < 6) {
      setAuthFeedback({
        type: 'error',
        text: 'A senha deve ter ao menos 6 caracteres.',
      });
      return;
    }

    setBusy(true);
    setAuthFeedback(null);
    try {
      if (mode === 'login') {
        const r = await login(mail, pass);
        setUser(r.user);
        setAuthFeedback({ type: 'ok', text: `Logado: ${r.user.email}` });
        onMessage(`Logado: ${r.user.email}`);
      } else {
        const r = await register(mail, pass);
        setUser(r.user);
        setAuthFeedback({ type: 'ok', text: `Conta criada: ${r.user.email}` });
        onMessage(`Conta criada: ${r.user.email}`);
      }
      setPassword('');
      setProjects(await listProjects());
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Falha no login';
      setAuthFeedback({ type: 'error', text });
      onMessage(text);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCloud = async () => {
    if (!user) {
      onMessage('Faça login para salvar na nuvem');
      return;
    }
    setBusy(true);
    try {
      const name = await pickSaveName();
      if (currentId) {
        await updateProject(currentId, name, data);
        onMessage(`Projeto atualizado na nuvem: ${name}`);
      } else {
        const p = await createProject(name, data);
        onCurrentIdChange(p.id);
        onMessage(`Projeto salvo na nuvem: ${name}`);
      }
      setProjects(await listProjects());
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro ao salvar na nuvem');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const base =
        data.wellName?.trim() ||
        (await pickSaveName()).replace(/\s*\(cópia\)\s*$/i, '');
      const name = `${base} (cópia)`;
      const p = await createProject(name, data);
      onCurrentIdChange(p.id);
      setProjects(await listProjects());
      onMessage(`Cópia salva na nuvem: ${name}`);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (id: string) => {
    setBusy(true);
    try {
      const p = await getProject(id);
      onLoadProject(p.data, { id: p.id, name: p.name });
      onCurrentIdChange(p.id);
      onMessage(`Aberto: ${p.name}`);
      onClose();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro ao abrir');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apagar este projeto da nuvem?')) return;
    setBusy(true);
    try {
      await deleteProject(id);
      if (currentId === id) onCurrentIdChange(null);
      setProjects(await listProjects());
      onMessage('Projeto apagado da nuvem');
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro ao apagar');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="library-overlay no-print" role="dialog" aria-modal="true">
      <button
        type="button"
        className="library-backdrop"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="library-panel">
        <header className="library-header">
          <div>
            <p className="library-kicker">Biblioteca</p>
            <h2>Projetos na nuvem</h2>
            <p className="library-sub">
              Esquemas salvos no seu servidor · separados da edição de parâmetros
            </p>
          </div>
          <button type="button" className="library-close" onClick={onClose}>
            Fechar
          </button>
        </header>

        {!configured ? (
          <div className="library-empty">
            <h3>API não configurada</h3>
            <p>
              Defina <code>VITE_API_URL</code> no ambiente de build (Vercel).
            </p>
          </div>
        ) : loading ? (
          <div className="library-empty">
            <p>Carregando biblioteca…</p>
          </div>
        ) : !user ? (
          <div className="library-auth">
            <form
              className="library-auth-card"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!busy) void handleAuth();
              }}
            >
              <h3>Acesse sua conta</h3>
              <p>Entre para ver e salvar esquemas no servidor.</p>
              <div className="cloud-auth-tabs">
                <button
                  type="button"
                  className={mode === 'login' ? 'active' : ''}
                  onClick={() => {
                    setMode('login');
                    setAuthFeedback(null);
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={mode === 'register' ? 'active' : ''}
                  onClick={() => {
                    setMode('register');
                    setAuthFeedback(null);
                  }}
                >
                  Criar conta
                </button>
              </div>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setAuthFeedback(null);
                  }}
                  disabled={busy}
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setAuthFeedback(null);
                  }}
                  disabled={busy}
                  minLength={6}
                />
              </label>
              <p className="library-auth-hint">Mínimo de 6 caracteres na senha</p>
              {authFeedback && (
                <div
                  className={
                    authFeedback.type === 'error'
                      ? 'library-auth-feedback is-error'
                      : 'library-auth-feedback is-ok'
                  }
                  role="alert"
                >
                  {authFeedback.text}
                </div>
              )}
              <button
                type="submit"
                className="library-primary"
                disabled={busy}
              >
                {busy
                  ? 'Aguarde…'
                  : mode === 'login'
                    ? 'Entrar'
                    : 'Criar conta'}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="library-toolbar">
              <div className="library-user">
                <span className="library-avatar">
                  {user.email.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{user.email}</strong>
                  <span>
                    {projects.length} projeto
                    {projects.length === 1 ? '' : 's'}
                    {currentId ? ' · editando na nuvem' : ''}
                  </span>
                </div>
              </div>
              <div className="library-toolbar-actions">
                <button
                  type="button"
                  className="library-primary"
                  disabled={busy}
                  onClick={() => void handleSaveCloud()}
                >
                  {currentId ? 'Atualizar projeto atual' : 'Salvar poço atual'}
                </button>
                {currentId && (
                  <button
                    type="button"
                    className="library-secondary"
                    disabled={busy}
                    onClick={() => void handleSaveAsNew()}
                  >
                    Salvar como novo
                  </button>
                )}
                <button
                  type="button"
                  className="library-ghost"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  Atualizar lista
                </button>
                <button
                  type="button"
                  className="library-ghost"
                  disabled={busy}
                  onClick={() => {
                    logout();
                    setUser(null);
                    setProjects([]);
                    onCurrentIdChange(null);
                    onMessage('Saiu da conta');
                  }}
                >
                  Sair
                </button>
              </div>
            </div>

            <div className="library-search-row">
              <input
                type="search"
                placeholder="Buscar por nome do poço…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="library-empty">
                <h3>Nenhum projeto encontrado</h3>
                <p>
                  {projects.length === 0
                    ? 'Salve o poço atual na nuvem para começar sua biblioteca.'
                    : 'Nenhum resultado para essa busca.'}
                </p>
              </div>
            ) : (
              <div className="library-grid">
                {filtered.map((p) => {
                  const active = p.id === currentId;
                  return (
                    <article
                      key={p.id}
                      className={`library-card ${active ? 'is-active' : ''}`}
                    >
                      <div className="library-card-top">
                        <div className="library-card-icon" aria-hidden>
                          ⛽
                        </div>
                        {active && <span className="library-badge">Aberto</span>}
                      </div>
                      <h3 title={p.name}>{p.name}</h3>
                      <p>
                        Atualizado{' '}
                        {new Date(p.updated_at).toLocaleString('pt-BR')}
                      </p>
                      <div className="library-card-actions">
                        <button
                          type="button"
                          className="library-primary"
                          disabled={busy}
                          onClick={() => void handleOpen(p.id)}
                        >
                          Abrir esquema
                        </button>
                        <button
                          type="button"
                          className="library-danger"
                          disabled={busy}
                          onClick={() => void handleDelete(p.id)}
                        >
                          Apagar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
