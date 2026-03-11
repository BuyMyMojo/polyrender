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

/**
 * Plugin that provides empty shims for Node.js built-in modules when bundling
 * for the browser. Some WASM-based packages (e.g. 7z-wasm) include conditional
 * Node code paths that are never reached in a browser, but esbuild still tries
 * to resolve the `require("fs")` / `require("crypto")` calls at bundle time.
 */
const shimNodeBuiltins = {
    name: "shim-node-builtins",
    setup(build) {
        const builtins =
            /^(fs|crypto|path|os|module|stream|util|events|buffer|assert|http|https|net|tls|url|zlib|readline|child_process|worker_threads|perf_hooks)$/;
        build.onResolve({ filter: builtins }, (args) => ({
            path: args.path,
            namespace: "node-builtin-shim",
        }));
        build.onLoad({ filter: /.*/, namespace: "node-builtin-shim" }, () => ({
            contents: "module.exports = {}",
            loader: "js",
        }));
    },
};

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
                    "node-unrar-js",
                    "@jsquash/jxl",
                    "utif",
                ];
                // 7z-wasm's default ESM build imports Node's 'module' built-in,
                // so we redirect to its UMD build which is browser-safe.
                const sevenZipCase = `      case '7z-wasm': return import('7z-wasm/7zz.umd.js').then(m => m.default || m);`;
                const cases = peerDeps
                    .map(
                        (d) =>
                            `      case '${d}': return import('${d}').then(m => m.default || m);`,
                    )
                    .join("\n");

                const replacement = [
                    "(async (name) => { switch(name) {",
                    cases,
                    sevenZipCase,
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
    platform: "browser",
    outdir: distDir,
    sourcemap: true,
    target: "es2022",
    plugins: [shimNodeBuiltins, resolvePeerDeps],
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
