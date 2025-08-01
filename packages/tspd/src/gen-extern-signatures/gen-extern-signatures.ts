import { OutputFile, traverseOutput } from "@alloy-js/core";
import {
  CompilerHost,
  Decorator,
  Diagnostic,
  Namespace,
  type PackageJson,
  Program,
  SemanticNodeListener,
  type SourceLocation,
  compile,
  createDiagnosticCollector,
  createSourceFile,
  getLocationContext,
  getTypeName,
  joinPaths,
  navigateProgram,
  navigateTypesInNamespace,
  resolvePath,
} from "@typespec/compiler";
import prettier from "prettier";
import { createDiagnostic } from "../ref-doc/lib.js";
import { generateSignatures } from "./components/decorators-signatures.js";
import { DecoratorSignature } from "./types.js";

function createSourceLocation(path: string): SourceLocation {
  return { file: createSourceFile("", path), pos: 0, end: 0 };
}
export async function generateExternSignatures(
  host: CompilerHost,
  libraryPath: string,
): Promise<readonly Diagnostic[]> {
  const diagnostics = createDiagnosticCollector();
  const pkgJson = await readPackageJson(host, libraryPath);
  if (!pkgJson.exports) {
    return [
      createDiagnostic({
        code: "exports-missing",
        target: createSourceLocation(resolvePath(libraryPath, "package.json")),
      }),
    ];
  }

  const exportsMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(pkgJson.exports)) {
    if (typeof value === "object" && "typespec" in value && typeof value.typespec === "string") {
      exportsMap[key] = resolvePath(libraryPath, value.typespec);
    }
  }

  const exports = Object.values(exportsMap);
  if (exports.length > 0) {
    diagnostics.pipe(await generateExternSignatureForExports(host, libraryPath, pkgJson, exports));
  } else {
    diagnostics.add(
      createDiagnostic({
        code: "exports-missing",
        messageId: "missingCondition",
        target: createSourceLocation(resolvePath(libraryPath, "package.json")),
      }),
    );
  }

  return diagnostics.diagnostics;
}

export async function generateExternSignatureForExports(
  host: CompilerHost,
  libraryPath: string,
  pkgJson: PackageJson,
  exports: string[],
): Promise<[undefined, readonly Diagnostic[]]> {
  const [main, ...additionalImports] = exports;
  const diagnostics = createDiagnosticCollector();
  const program = await compile(host, main, {
    additionalImports,
    parseOptions: { comments: true, docs: true },
  });
  const prettierConfig = await prettier.resolveConfig(libraryPath);

  const outDir = resolvePath(libraryPath, "generated-defs");
  try {
    await host.rm(outDir, { recursive: true });
  } catch (e) {}
  await host.mkdirp(outDir);

  const files = await generateExternDecorators(program, pkgJson.name, {
    prettierConfig: prettierConfig ?? undefined,
  });
  for (const [name, content] of Object.entries(files)) {
    await host.writeFile(resolvePath(outDir, name), content);
  }
  return [undefined, diagnostics.diagnostics];
}

async function readPackageJson(host: CompilerHost, libraryPath: string): Promise<PackageJson> {
  const file = await host.readFile(joinPaths(libraryPath, "package.json"));
  return JSON.parse(file.text);
}

export interface GenerateExternDecoratorOptions {
  /** Render those namespaces only(exclude sub namespaces as well). By default it will include all namespaces. */
  readonly namespaces?: Namespace[];
  readonly prettierConfig?: prettier.Options;
}
export async function generateExternDecorators(
  program: Program,
  packageName: string,
  options?: GenerateExternDecoratorOptions,
): Promise<Record<string, string>> {
  const decorators = new Map<string, DecoratorSignature[]>();

  const listener: SemanticNodeListener = {
    decorator(dec) {
      if (
        packageName !== "@typespec/compiler" &&
        getLocationContext(program, dec).type !== "project"
      ) {
        return;
      }
      const namespaceName = getTypeName(dec.namespace);
      let decoratorForNamespace = decorators.get(namespaceName);
      if (!decoratorForNamespace) {
        decoratorForNamespace = [];
        decorators.set(namespaceName, decoratorForNamespace);
      }
      decoratorForNamespace.push(resolveDecoratorSignature(dec));
    },
  };
  if (options?.namespaces) {
    for (const namespace of options.namespaces) {
      navigateTypesInNamespace(namespace, listener, { skipSubNamespaces: true });
    }
  } else {
    navigateProgram(program, listener);
  }

  function format(value: string) {
    try {
      const formatted = prettier.format(value, {
        ...options?.prettierConfig,
        parser: "typescript",
      });
      return formatted;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Error formatting", e);
      return value;
    }
  }

  const files: Record<string, string> = {};
  for (const [ns, nsDecorators] of decorators.entries()) {
    const output = generateSignatures(program, nsDecorators, packageName, ns);
    const rawFiles: OutputFile[] = [];
    traverseOutput(output, {
      visitDirectory: () => {},
      visitFile: (file) => rawFiles.push(file),
    });

    for (const file of rawFiles) {
      if ("contents" in file) {
        files[file.path] = await format(file.contents);
      }
    }
  }
  return files;
}

function resolveDecoratorSignature(decorator: Decorator): DecoratorSignature {
  return {
    decorator,
    name: decorator.name,
    jsName: "$" + decorator.name.slice(1),
    typeName: decorator.name[1].toUpperCase() + decorator.name.slice(2) + "Decorator",
  };
}
