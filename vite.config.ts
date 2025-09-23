import { promises as fs } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const PUBLIC_MANIFEST_VIRTUAL_ID = "virtual:public-manifest";
const RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID = `\0${PUBLIC_MANIFEST_VIRTUAL_ID}`;

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

function publicManifestPlugin() {
  let publicDir: string | null = null;

  return {
    name: "astrocat-public-manifest",
    configResolved(config) {
      publicDir = config.publicDir ? path.resolve(config.root, config.publicDir) : null;
    },
    resolveId(id: string) {
      if (id === PUBLIC_MANIFEST_VIRTUAL_ID) {
        return RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID;
      }
      return null;
    },
    async load(id: string) {
      if (id !== RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID) {
        return null;
      }

      const manifest = await createPublicManifest(publicDir);
      return `const manifest = ${JSON.stringify(manifest, null, 2)};\nexport default manifest;\n`;
    },
    configureServer(server) {
      const invalidate = () => {
        const module = server.moduleGraph.getModuleById(
          RESOLVED_PUBLIC_MANIFEST_VIRTUAL_ID
        );
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };

      const handleChange = (file: string) => {
        if (isInsidePublicDir(file, publicDir)) {
          invalidate();
        }
      };

      server.watcher.on("add", handleChange);
      server.watcher.on("change", handleChange);
      server.watcher.on("unlink", handleChange);
      server.watcher.on("addDir", handleChange);
      server.watcher.on("unlinkDir", handleChange);
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
