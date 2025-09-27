import { promises as fs } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

type PublicManifest = Record<string, string>;

function applyBaseToPublicPath(relativePath: string, base: string): string {
  const trimmed = relativePath.replace(/^[/\\]+/, "");

  if (!base || base === "/") {
    return `/${trimmed}`;
  }

  if (base === "./") {
    return trimmed;
  }

  try {
    const parsedBase = new URL(base, "http://localhost/");
    if (base.startsWith("http://") || base.startsWith("https://")) {
      return new URL(trimmed, base).toString();
    }

    const pathname = parsedBase.pathname.replace(/\/*$/, "");
    return `${pathname}/${trimmed}`.replace(/^\/*/, "/");
  } catch (error) {
    return `${base.replace(/\/*$/, "")}/${trimmed}`;
  }
}

async function readPublicDirectory(
  directory: string,
  root: string,
  manifest: PublicManifest,
  base: string
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await readPublicDirectory(entryPath, root, manifest, base);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = path.relative(root, entryPath);
    if (!relativePath) {
      continue;
    }

    const normalized = relativePath.split(path.sep).join("/");
    manifest[normalized] = applyBaseToPublicPath(normalized, base);
  }
}

async function createPublicManifest(
  publicDir: string | null,
  base: string
): Promise<PublicManifest> {
  if (!publicDir) {
    return {};
  }

  const manifest: PublicManifest = {};
  await readPublicDirectory(publicDir, publicDir, manifest, base);
  return manifest;
}

function isInsidePublicDir(file: string, publicDir: string | null): boolean {
  if (!publicDir) {
    return false;
  }

  const relative = path.relative(publicDir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function escapeForInlineScript(source: string): string {
  return source.replace(/<\//g, "\\u003C/");
}

const PUBLIC_MANIFEST_VIRTUAL_ID = "virtual:astrocat-public-manifest";
const LEGACY_PUBLIC_MANIFEST_VIRTUAL_ID = "virtual:public-manifest";
const RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID = `\0${PUBLIC_MANIFEST_VIRTUAL_ID}`;

function publicManifestPlugin() {
  let publicDir: string | null = null;
  let command: "build" | "serve" = "serve";
  let cachedManifest: PublicManifest | null = null;
  let base = "/";

  const getManifest = async () => {
    if (cachedManifest) {
      return cachedManifest;
    }

    const manifest = await createPublicManifest(publicDir, base);
    cachedManifest = manifest;
    return manifest;
  };

  const invalidateManifest = () => {
    cachedManifest = null;
  };

  return {
    name: "astrocat-public-manifest",
    configResolved(config) {
      publicDir = config.publicDir ? path.resolve(config.root, config.publicDir) : null;
      command = config.command;
      base = config.base ?? "/";
    },
    async transformIndexHtml() {
      const manifest = await getManifest();
      const serialized = escapeForInlineScript(
        JSON.stringify(manifest, null, command === "build" ? 0 : 2)
      );

      return {
        tags: [
          {
            tag: "script",
            attrs: { id: "astrocat-public-manifest" },
            children: `window.__ASTROCAT_PUBLIC_MANIFEST__ = ${serialized};`,
            injectTo: "head-prepend"
          }
        ]
      } satisfies import("vite").IndexHtmlTransformResult;
    },
    resolveId(id) {
      if (id === PUBLIC_MANIFEST_VIRTUAL_ID || id === LEGACY_PUBLIC_MANIFEST_VIRTUAL_ID) {
        return RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID;
      }
      return null;
    },
    async load(id) {
      if (id === RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID) {
        const manifest = await getManifest();
        const serialized = JSON.stringify(manifest, null, command === "build" ? 0 : 2);
        return `export default ${serialized};`;
      }
      return null;
    },
    configureServer(server) {
      const handleChange = (file: string) => {
        if (isInsidePublicDir(file, publicDir)) {
          invalidateManifest();
          server.ws.send({ type: "full-reload" });
        }
      };

      server.watcher.on("add", handleChange);
      server.watcher.on("change", handleChange);
      server.watcher.on("unlink", handleChange);
      server.watcher.on("addDir", handleChange);
      server.watcher.on("unlinkDir", handleChange);
    },
    buildStart() {
      invalidateManifest();
    }
  } satisfies import("vite").Plugin;
}

export default defineConfig({
  base: "./",
  plugins: [publicManifestPlugin()],
  build: {
    target: ["es2018", "safari13"],
    cssTarget: ["chrome61", "safari13"],
    modulePreload: { polyfill: true }
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2018"
    }
  }
});
