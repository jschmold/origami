import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { copyFolder, getFilesWithExt } from './file-util';
import { warn } from './log';
import { getPackageJson } from './package-util';

export const ES5_DIR_NAME = '_origami-es5';
export const ES2015_DIR_NAME = '_origami-es2015';

export function getEs5Dir(packagePath: string): string {
  return path.join(packagePath, ES5_DIR_NAME);
}

export function getEs2015Dir(packagePath: string): string {
  return path.join(packagePath, ES2015_DIR_NAME);
}

export interface CompileOptions {
  force?: boolean;
}

export async function compile(
  packagePath: string,
  opts: CompileOptions = {}
): Promise<boolean> {
  try {
    if (
      !needsCompile(packagePath) ||
      (isCompiled(packagePath) && !opts.force)
    ) {
      return false;
    }

    const jsFiles = await getFilesWithExt('.js', packagePath, {
      excludeDir: [ES5_DIR_NAME, ES2015_DIR_NAME]
    });
    if (!jsFiles.length) {
      return false;
    }

    await copyFolder(packagePath, getEs2015Dir(packagePath), {
      include: jsFiles,
      excludeDir: [ES5_DIR_NAME, ES2015_DIR_NAME]
    });
    const program = ts.createProgram(jsFiles, {
      allowJs: true,
      importHelpers: true,
      module: ts.ModuleKind.ES2015,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      noEmitOnError: true,
      outDir: getEs5Dir(packagePath),
      skipLibCheck: true,
      target: ts.ScriptTarget.ES5
    });

    const emitResult = program.emit();
    if (emitResult.emitSkipped) {
      const allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics);
      let errorMessage = '';
      allDiagnostics.forEach(diag => {
        const message = ts.flattenDiagnosticMessageText(
          diag.messageText,
          ts.sys.newLine
        );
        if (diag.file) {
          const pos = ts.getLineAndCharacterOfPosition(diag.file, diag.start!);
          errorMessage += `${diag.file.fileName}:${pos.line +
            1}:${pos.character + 1} ${message}`;
        } else {
          errorMessage += message;
        }
      });

      throw new Error(errorMessage);
    }

    return true;
  } catch (error) {
    warn('Failed to compile()');
    throw error;
  }
}

function needsCompile(packagePath: string): boolean {
  const packageJson = getPackageJson(packagePath);
  return ![
    'es2015',
    'esm2015',
    'esm5',
    'fesm2015',
    'fesm5',
    'esm2015',
    'module'
  ].some(key => key in packageJson);
}

function isCompiled(packagePath: string): boolean {
  return fs.existsSync(getEs5Dir(packagePath));
}