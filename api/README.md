# API — Esquema Mecânico de Poço

API Node/Express + PostgreSQL para salvar projetos na nuvem.

## Variáveis de ambiente (EasyPanel)

| Variável | Exemplo |
|----------|---------|
| `DATABASE_URL` | `postgres://esquema:***@scan_postgres-esquema:5432/esquema_poco?sslmode=disable` |
| `JWT_SECRET` | string longa e aleatória |
| `CORS_ORIGIN` | `https://esquema-mecanico-poco.vercel.app` |
| `PORT` | `3000` |

## Endpoints

- `GET /health`
- `POST /auth/register` `{ email, password }`
- `POST /auth/login` `{ email, password }`
- `GET /auth/me` (Bearer)
- `GET /projects` (Bearer)
- `GET /projects/:id` (Bearer)
- `POST /projects` (Bearer) `{ name, data }`
- `PUT /projects/:id` (Bearer)
- `DELETE /projects/:id` (Bearer)
