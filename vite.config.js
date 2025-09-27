import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .envファイルを読み込む
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      // Cloudflare Tunnelからのアクセスを許可する
      allowedHosts: [
        env.VITE_ALLOWED_HOSTS,
      ],
      // ポート番号を5173に固定
      port: 5173, 
      historyApiFallback: true,
    },
  };
});
