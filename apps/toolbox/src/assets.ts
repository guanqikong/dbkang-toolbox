const inlineSvgAssets: Record<string, string> = {
  'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#2f6fe4"/><path d="M41.7 11.3a15 15 0 0 0-17.9 19.2L10.5 43.8a5.2 5.2 0 0 0 7.4 7.4l13.3-13.3a15 15 0 0 0 19.3-18l-8.7 8.7-7.2-1.9-1.9-7.2 9-8.2Z" fill="#fff"/><circle cx="16.5" cy="45.2" r="2.8" fill="#2f6fe4"/></svg>',
  'default-avatar.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#7d899a"/><circle cx="128" cy="94" r="48" fill="#fff"/><path d="M43 232c8-57 38-86 85-86s77 29 85 86" fill="#fff"/></svg>',
  'default-achievement.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="24" fill="#eef3fa"/><path d="M77 42h102v62c0 39-22 65-51 65s-51-26-51-65V42Z" fill="#5e7fae"/><path d="M77 62H48v24c0 31 18 49 45 49M179 62h29v24c0 31-18 49-45 49" fill="none" stroke="#5e7fae" stroke-width="16" stroke-linecap="round"/><path d="M128 169v27M89 220h78" stroke="#5e7fae" stroke-width="16" stroke-linecap="round"/></svg>',
  'default-music.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="24" fill="#edf1f7"/><circle cx="128" cy="128" r="82" fill="#cbd6e5"/><circle cx="128" cy="128" r="34" fill="#fff"/><circle cx="128" cy="128" r="10" fill="#6e7b91"/><path d="M128 46a82 82 0 0 1 76 51l-76 31Z" fill="#91a6c2"/></svg>',
}

export function publicAsset(name: string): string {
  const normalizedName = name.replace(/^\//, '')
  const inlineSvg = inlineSvgAssets[normalizedName]
  if (inlineSvg) return `data:image/svg+xml,${encodeURIComponent(inlineSvg)}`
  return `${import.meta.env.BASE_URL}${normalizedName}`
}
