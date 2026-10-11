import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("spectraDesktop", {
  openCasesFolder: () => ipcRenderer.invoke("open-cases-folder"),
  getVersion: () => ipcRenderer.invoke("get-version"),
});