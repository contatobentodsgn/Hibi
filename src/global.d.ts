declare global { interface Window { hibiDesktop?: { info: () => Promise<{ name: string; version: string; localOnly: boolean }>; setOpenAtLogin?: (enabled: boolean) => Promise<boolean> } } }
export {};
