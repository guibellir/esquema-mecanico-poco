import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Destino real da API (EasyPanel). Usado só no proxy de desenvolvimento.
  const apiTarget =
    env.VITE_API_PROXY_TARGET ||
    'https://scan-esquema-poco.evu7va.easypanel.host'

  return {
    plugins: [react()],
    server: {
      // Browser → localhost/cloud-api → EasyPanel (sem CORS no browser).
      // Importante: a API remota rejeita Origin=localhost; por isso apagamos
      // Origin/Referer na ida (o proxy simula chamada server-to-server).
      proxy: {
        '/cloud-api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/cloud-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Sem Origin a API trata como chamada server-side (isAllowedOrigin permite null)
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('Origin')
              proxyReq.removeHeader('referer')
              proxyReq.removeHeader('Referer')
            })
          },
        },
      },
    },
  }
})
