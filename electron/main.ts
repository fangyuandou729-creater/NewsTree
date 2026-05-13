import { app, BrowserWindow, shell } from "electron";
import path from "node:path";

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, "../public/assets/app-icon.png")
    : path.join(__dirname, "../dist/assets/app-icon.png");

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "NewsTree",
    icon: iconPath,
    backgroundColor: "#f7f4ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
