/**
 * Minimal esbuild build script — replaces Vite entirely.
 *
 * The only "magic" is an esbuild plugin that rewrites the variable-based
 * dynamic `import(moduleName)` in @polyrender/core's `requirePeerDep` into
 * static import() calls that esbuild can bundle.
 *
 * This is the same fundamental fix needed in Vite, webpack, or any other
 * bundler — browsers cannot resolve bare specifiers from `import(variable)`.
 */
import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

/** Plugin to resolve @polyrender/core's dynamic peer-dep imports. */
const resolvePeerDeps = {
    name: "resolve-peer-deps",
    setup(build) {
        build.onLoad({ filter: /packages[\\/]core.*\.(js|ts)$/ }, async (args) => {
            const fs = await import("fs");
            let contents = fs.readFileSync(args.path, "utf8");

            if (
                contents.includes("moduleName") &&
                contents.includes("import(")
            ) {
                // Map of peer dep names → static imports
                const peerDeps = [
                    "pdfjs-dist",
                    "epubjs",
                    "docx-preview",
                    "papaparse",
                    "highlight.js",
                    "jszip",
                    "xlsx",
                ];
                const cases = peerDeps
                    .map(
                        (d) =>
                            `      case '${d}': return import('${d}').then(m => m.default || m);`,
                    )
                    .join("\n");

                const replacement = [
                    "(async (name) => { switch(name) {",
                    cases,
                    "      default: throw new Error(`Unknown peer dep: ${name}`);",
                    "    }})(moduleName)",
                ].join("\n");

                contents = contents.replace(
                    /await\s+import\(\s*(?:\/\*.*?\*\/\s*)?moduleName\s*\)/g,
                    `await ${replacement}`,
                );
            }

            return {
                contents,
                loader: args.path.endsWith(".ts") ? "ts" : "js",
            };
        });
    },
};

// Ensure dist directory exists
const distDir = resolve(__dirname, "dist");
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

// Copy index.html to dist
cpSync(resolve(__dirname, "index.html"), resolve(distDir, "index.html"));

// Copy styles.css to dist
const stylesPath = resolve(__dirname, "../../packages/core/src/styles.css");
if (existsSync(stylesPath)) {
    cpSync(stylesPath, resolve(distDir, "styles.css"));
}

// Copy pdfjs worker to dist
const workerGlob = resolve(__dirname, "node_modules/pdfjs-dist/build");
if (existsSync(workerGlob)) {
    const workerFiles = [
        "pdf.worker.min.mjs",
        "pdf.worker.mjs",
        "pdf.worker.min.js",
    ];
    for (const wf of workerFiles) {
        const src = resolve(workerGlob, wf);
        if (existsSync(src)) {
            cpSync(src, resolve(distDir, wf));
            break;
        }
    }
}

const buildOptions = {
    entryPoints: [resolve(__dirname, "src/main.ts")],
    bundle: true,
    format: "esm",
    outdir: distDir,
    sourcemap: true,
    target: "es2022",
    plugins: [resolvePeerDeps],
    logLevel: "info",
};

if (isWatch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
} else {
    await build(buildOptions);
    console.log(`\nBuild complete! Serve with:\n  npx serve dist\n`);
}
