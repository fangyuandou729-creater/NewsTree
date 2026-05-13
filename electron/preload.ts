import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("newsTree", {
  platform: process.platform
});
