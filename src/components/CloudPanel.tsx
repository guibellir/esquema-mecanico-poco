import { useEffect, useState } from 'react';
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

type Props = {
  data: WellData;
  onLoadProject: (data: WellData) => void;
  onMessage: (msg: string) => void;
};

export function CloudPanel({ data, onLoadProject, onMessage }: Props) {
  const configured = isCloudConfigured();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');

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
        const list = await listProjects();
        setProjects(list);
      } else {
        setProjects([]);
        setCurrentId(null);
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro na nuvem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuth = async () => {
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = await login(email.trim(), password);
        setUser(r.user);
        onMessage(`Logado: ${r.user.email}`);
      } else {
        const r = await register(email.trim(), password);
        setUser(r.user);
        onMessage(`Conta criada: ${r.user.email}`);
      }
      setPassword('');
      const list = await listProjects();
      setProjects(list);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Falha no login');
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
      const name = data.wellName?.trim() || 'Projeto sem nome';
      if (currentId) {
        await updateProject(currentId, name, data);
        onMessage('Projeto atualizado na nuvem');
      } else {
        const p = await createProject(name, data);
        setCurrentId(p.id);
        onMessage('Projeto salvo na nuvem');
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
      const name = `${data.wellName?.trim() || 'Projeto'} (cópia)`;
      const p = await createProject(name, data);
      setCurrentId(p.id);
      setProjects(await listProjects());
      onMessage('Cópia salva na nuvem');
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
      onLoadProject(p.data);
      setCurrentId(p.id);
      onMessage(`Aberto da nuvem: ${p.name}`);
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
      if (currentId === id) setCurrentId(null);
      setProjects(await listProjects());
      onMessage('Projeto apagado da nuvem');
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Erro ao apagar');
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <section className="form-section cloud-panel">
        <h2>Nuvem</h2>
        <p className="field-hint">
          API não configurada neste ambiente. No Vercel, defina{' '}
          <code>VITE_API_URL</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="form-section cloud-panel">
      <h2>Nuvem (VPS)</h2>
      {loading ? (
        <p className="field-hint">Conectando…</p>
      ) : !user ? (
        <>
          <p className="field-hint">
            Entre para salvar e abrir projetos no seu servidor.
          </p>
          <div className="cloud-auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Entrar
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Criar conta
            </button>
          </div>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-sm cloud-btn"
            disabled={busy || !email || password.length < 6}
            onClick={() => void handleAuth()}
          >
            {busy
              ? 'Aguarde…'
              : mode === 'login'
                ? 'Entrar'
                : 'Criar conta'}
          </button>
        </>
      ) : (
        <>
          <p className="field-hint">
            Logado como <strong>{user.email}</strong>
            {currentId ? ' · projeto em edição na nuvem' : ''}
          </p>
          <div className="cloud-actions">
            <button
              type="button"
              className="btn-sm cloud-btn"
              disabled={busy}
              onClick={() => void handleSaveCloud()}
            >
              {currentId ? 'Atualizar na nuvem' : 'Salvar na nuvem'}
            </button>
            {currentId && (
              <button
                type="button"
                className="btn-sm"
                disabled={busy}
                onClick={() => void handleSaveAsNew()}
              >
                Salvar como novo
              </button>
            )}
            <button
              type="button"
              className="btn-danger-sm"
              disabled={busy}
              onClick={() => {
                logout();
                setUser(null);
                setProjects([]);
                setCurrentId(null);
                onMessage('Saiu da conta');
              }}
            >
              Sair
            </button>
          </div>

          <div className="section-head" style={{ marginTop: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Meus projetos</h2>
            <button
              type="button"
              className="btn-sm"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Atualizar
            </button>
          </div>
          {projects.length === 0 ? (
            <p className="field-hint">Nenhum projeto na nuvem ainda.</p>
          ) : (
            <ul className="cloud-project-list">
              {projects.map((p) => (
                <li key={p.id} className={p.id === currentId ? 'current' : ''}>
                  <div>
                    <strong>{p.name}</strong>
                    <span>
                      {new Date(p.updated_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="cloud-project-btns">
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={busy}
                      onClick={() => void handleOpen(p.id)}
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="btn-danger-sm"
                      disabled={busy}
                      onClick={() => void handleDelete(p.id)}
                    >
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
