import { promises as fs } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

type PublicManifest = Record<string, string>;

async function readPublicDirectory(
  directory: string,
  root: string,
  manifest: PublicManifest
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
      await readPublicDirectory(entryPath, root, manifest);
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
    manifest[normalized] = `/${normalized.replace(/^\/+/, "")}`;
  }
}

async function createPublicManifest(publicDir: string | null): Promise<PublicManifest> {
  if (!publicDir) {
    return {};
  }

  const manifest: PublicManifest = {};
  await readPublicDirectory(publicDir, publicDir, manifest);
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

  const getManifest = async () => {
    if (cachedManifest) {
      return cachedManifest;
    }

    const manifest = await createPublicManifest(publicDir);
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
            injectTo: "head"
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
    target: "esnext"
  }
});
