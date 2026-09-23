/// <reference types="vite/client" />

import type { Station } from "./App"

declare global {
  interface Window {
    __ENERLUTION_DATA__?: {
      getStations: () => Station[]
      replaceStations: (stations: Station[]) => void
      patchStation: (id: string, patch: Partial<Station>) => void
    }
  }
}

export {}
