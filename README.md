# Esquema Mecânico de Poço

Webapp para gerar esquemas mecânicos de poços de petróleo a partir de parâmetros (profundidade, sapatas, fases, canhoneado e coluna de produção).

## Stack

- React + TypeScript + Vite
- Deploy estático (Vercel)

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

O output de produção fica em `dist/`.

## Deploy na Vercel

1. Importe este repositório em [vercel.com/new](https://vercel.com/new)
2. Framework: **Vite** (detectado automaticamente)
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Deploy

Ou via CLI:

```bash
npx vercel
```

## Funcionalidades

- Esquema completo do poço (revestimentos, canhoneado, coluna)
- Aba de detalhe da coluna (escala visual)
- Salvar/abrir projeto (localStorage + JSON)
- Exportar SVG
- Imprimir / PDF (2 páginas coloridas)
