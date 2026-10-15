import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '')
  const localBaseUrl = (env.VITE_DBKANG_LOCAL_BASE_URL || env.VITE_DBKANG_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
  const fallbackBaseUrl = (
    env.VITE_DBKANG_FALLBACK_BASE_URL ||
    env.DBKANG_PUBLIC_BASE_URL ||
    localBaseUrl
  ).replace(/\/$/, '')
  const localToolboxUrl = (
    env.VITE_DBKANG_TOOLBOX_URL || `${localBaseUrl}/toolbox`
  ).replace(/\/$/, '')
  const fallbackToolboxUrl = `${fallbackBaseUrl}/toolbox`
  const updateBaseUrl = (
    env.VITE_DBKANG_UPDATE_BASE_URL ||
    fallbackBaseUrl
  ).replace(/\/$/, '')
  const version = env.DBKANG_VERSION || '0.1.0'
  const connectHosts = [
    'chaoxing.com',
    'chaoxing.cn',
    new URL(localBaseUrl).hostname,
    new URL(fallbackBaseUrl).hostname,
    new URL(updateBaseUrl).hostname,
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
// @match        *://mooc2-ans.chaoxing.com/*
// @grant        GM_xmlhttpRequest
${connectMetadata}
// @run-at       document-idle
// @updateURL    ${updateBaseUrl}/updates/DBKangToolbox.user.js
// @downloadURL  ${updateBaseUrl}/updates/DBKangToolbox.user.js
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
      __DBKANG_LOCAL_BASE_URL__: JSON.stringify(localBaseUrl),
      __DBKANG_FALLBACK_BASE_URL__: JSON.stringify(fallbackBaseUrl),
      __DBKANG_LOCAL_TOOLBOX_URL__: JSON.stringify(localToolboxUrl),
      __DBKANG_FALLBACK_TOOLBOX_URL__: JSON.stringify(fallbackToolboxUrl),
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
