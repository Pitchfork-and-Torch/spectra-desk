import { contextBridge, ipcRenderer } from "electron";

const SUBSCRIBE_URL =
  process.env.SPECTRA_SUBSCRIBE_URL || "https://spectra-desk-license.pitchfork-and-torch.workers.dev/subscribe";

contextBridge.exposeInMainWorld("spectraLicense", {
  activate: (email: string, licenseKey: string) =>
    ipcRenderer.invoke("license:activate", { email, licenseKey }),
  cancel: () => ipcRenderer.send("license:cancel"),
  openSubscribe: () => ipcRenderer.invoke("license:open-subscribe"),
  subscribeUrl: SUBSCRIBE_URL,
});