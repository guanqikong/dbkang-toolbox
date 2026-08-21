import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '')
  const apiBaseUrl = (env.VITE_DBKANG_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
  const toolboxUrl = (env.VITE_DBKANG_TOOLBOX_URL || 'http://localhost:8000/toolbox').replace(/\/$/, '')
  const version = env.DBKANG_VERSION || '0.1.3'
  const connectHosts = [
    'chaoxing.com',
    new URL(apiBaseUrl).hostname,
  ]
  const connectMetadata = [...new Set(connectHosts)]
    .map((host) => `// @connect      ${host}`)
    .join('\n')
  const metadata = `// ==UserScript==
// @name         DBKang Toolbox
// @namespace    https://dbkang.example
// @version      ${version}
// @description  在已启用的学习通课程中加载阿康工具箱
// @match        *://*.chaoxing.com/*
// @match        *://*.chaoxing.cn/*
// @grant        GM_xmlhttpRequest
${connectMetadata}
// @run-at       document-idle
// @updateURL    ${apiBaseUrl}/updates/DBKangToolbox.user.js
// @downloadURL  ${apiBaseUrl}/updates/DBKangToolbox.user.js
// ==/UserScript==`

  return {
    plugins: [
      {
        name: 'dbkang-userscript-metadata',
        generateBundle(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type === 'chunk') output.code = `${metadata}\n${output.code}`
          }
        },
      },
    ],
    define: {
      __DBKANG_API_BASE_URL__: JSON.stringify(apiBaseUrl),
      __DBKANG_TOOLBOX_URL__: JSON.stringify(toolboxUrl),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
      lib: {
        entry: 'src/index.ts',
        name: 'DBKangToolboxUserscript',
        formats: ['iife'],
        fileName: () => 'DBKangToolbox.user.js',
      },
    },
  }
})
