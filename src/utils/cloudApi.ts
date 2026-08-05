import type { WellData } from '../types';

const TOKEN_KEY = 'well-schematic:auth-token';

export type CloudUser = { id: string; email: string };
export type CloudProjectSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};
export type CloudProject = CloudProjectSummary & {
  data: WellData;
};

/**
 * Em desenvolvimento o browser SEMPRE fala com o proxy do Vite (/cloud-api),
 * que repassa para o EasyPanel — assim não há CORS com localhost.
 * Em produção usa VITE_API_URL (URL absoluta da API).
 */
function apiBase(): string {
  if (import.meta.env.DEV) {
    return '/cloud-api';
  }
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!base) {
    throw new Error(
      'VITE_API_URL não configurada. Defina a URL da API no .env / Vercel.'
    );
  }
  return base.replace(/\/$/, '');
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isCloudConfigured(): boolean {
  if (import.meta.env.DEV) return true;
  return Boolean((import.meta.env.VITE_API_URL as string | undefined)?.trim());
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error('Faça login para continuar');
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Não foi possível conectar à API. Verifique se o servidor local (proxy) está no ar.'
    );
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error || `Erro HTTP ${res.status}`
    );
  }
  return body as T;
}

export async function register(
  email: string,
  password: string
): Promise<{ token: string; user: CloudUser }> {
  const data = await request<{ token: string; user: CloudUser }>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
  setToken(data.token);
  return data;
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: CloudUser }> {
  const data = await request<{ token: string; user: CloudUser }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
  setToken(data.token);
  return data;
}

export async function me(): Promise<CloudUser | null> {
  if (!getToken() || !isCloudConfigured()) return null;
  try {
    const data = await request<{ user: CloudUser }>('/auth/me', {}, true);
    return data.user;
  } catch {
    setToken(null);
    return null;
  }
}

export function logout(): void {
  setToken(null);
}

export async function listProjects(): Promise<CloudProjectSummary[]> {
  const data = await request<{ projects: CloudProjectSummary[] }>(
    '/projects',
    {},
    true
  );
  return data.projects;
}

export async function getProject(id: string): Promise<CloudProject> {
  const data = await request<{ project: CloudProject }>(
    `/projects/${id}`,
    {},
    true
  );
  return data.project;
}

export async function createProject(
  name: string,
  well: WellData
): Promise<CloudProject> {
  const data = await request<{ project: CloudProject }>(
    '/projects',
    {
      method: 'POST',
      body: JSON.stringify({ name, data: well }),
    },
    true
  );
  return data.project;
}

export async function updateProject(
  id: string,
  name: string,
  well: WellData
): Promise<CloudProject> {
  const data = await request<{ project: CloudProject }>(
    `/projects/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify({ name, data: well }),
    },
    true
  );
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }, true);
}
