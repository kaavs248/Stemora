const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export type UserRole = 'ADMIN' | 'DONOR' | 'RESEARCHER';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

interface AuthResponse {
  message: string;
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'stemora_token';

export const getToken = (): string | null =>
  sessionStorage.getItem(TOKEN_KEY);

export const logout = (): void => {
  sessionStorage.removeItem(TOKEN_KEY);
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (authenticated) {
    const token = getToken();

    if (!token) {
      throw new Error('Please sign in to continue.');
    }

    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Unable to reach the STEMORA API. Check that the backend is running.',
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Request failed (${response.status}).`;

    const reason =
      typeof data.reason === 'string' ? `: ${data.reason}` : '';

    throw new Error(`${message}${reason}`);
  }

  return data as T;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const result = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  sessionStorage.setItem(TOKEN_KEY, result.token);
  return result;
}

export async function register(
  email: string,
  password: string,
  role: 'DONOR' | 'RESEARCHER',
): Promise<AuthResponse> {
  const result = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });

  sessionStorage.setItem(TOKEN_KEY, result.token);
  return result;
}

export async function getMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me', {}, true);
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, {}, true);
}

export async function apiPatch<T>(
  path: string,
  body: unknown = {},
): Promise<T> {
  return request<T>(
    path,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    true,
  );
}
