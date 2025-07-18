// src/symbolProvider.ts

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { log } from './log';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Interface for symbol information
interface ShardsSymbol {
  name: string;
  kind: vscode.SymbolKind;
  range: vscode.Range;
  selectionRange: vscode.Range;
  path: string;
}

// Interface for error information
interface ShardsError {
  message: string;
  line?: number;
  column?: number;
}

// Mapping of custom kinds to VS Code SymbolKind
const KIND_MAP: { [key: string]: vscode.SymbolKind } = {
  wire: vscode.SymbolKind.Function,
  template: vscode.SymbolKind.Object,
  define: vscode.SymbolKind.Constant,
  macro: vscode.SymbolKind.TypeParameter,
  mesh: vscode.SymbolKind.Struct,
  // Add more mappings as needed
};

export class SymbolProvider implements vscode.DocumentSymbolProvider {
  private symbolCache: Map<string, ShardsSymbol[]> = new Map();
  private _onDidChangeSymbols = new vscode.EventEmitter<void>();
  readonly onDidChangeSymbols = this._onDidChangeSymbols.event;

  // Add diagnostic collection for reporting errors
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('shards');
  }

  // Clears the symbol cache
  clearCache() {
    this.symbolCache.clear();
    this.diagnosticCollection.clear(); // Also clear diagnostics
  }

  // Updates symbols for a given document
  async updateDocumentSymbols(document: vscode.TextDocument): Promise<void> {
    const filePath = document.fileName;
    log(`Updating symbols for ${filePath}`);

    // Clear existing diagnostics for this file
    this.diagnosticCollection.delete(document.uri);

    try {
      const ast = await this.generateAST(filePath);
      const symbols = this.extractSymbols(ast, filePath);
      this.symbolCache.set(filePath, symbols);
      log(`Updated cache for ${filePath}, total symbols: ${symbols.length}`);
      this._onDidChangeSymbols.fire();
    } catch (error) {
      console.error('Error generating AST:', error);

      // Parse the error and add it to the problems panel
      this.reportError(document, error);
    }
  }

  // Parse error message and report to problems panel
  private reportError(document: vscode.TextDocument, error: any): void {
    const diagnostics: vscode.Diagnostic[] = [];

    // Try to extract meaningful error information
    const errorInfo = this.parseErrorMessage(error.toString());

    // Create a diagnostic
    const range = errorInfo.line !== undefined && errorInfo.column !== undefined
      ? new vscode.Range(
        errorInfo.line - 1,
        errorInfo.column - 1,
        errorInfo.line - 1,
        (errorInfo.column - 1) + 10
      )
      : new vscode.Range(0, 0, 0, 0);

    const diagnostic = new vscode.Diagnostic(
      range,
      errorInfo.message,
      vscode.DiagnosticSeverity.Error
    );

    diagnostic.source = 'Shards';
    diagnostics.push(diagnostic);

    // Update the diagnostics for this document
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  // Parse error messages to extract line and column information
  private parseErrorMessage(errorMessage: string): ShardsError {
    log(`Parsing error message: ${errorMessage}`);

    // Default error info
    const errorInfo: ShardsError = {
      message: "Parsing error in Shards file"
    };

    // Parse ShardsError format
    // Match pattern like: ShardsError { message: "error message", loc: LineInfo { line: 123, column: 45 } }
    const messageMatch = errorMessage.match(/ShardsError\s*{\s*message:\s*"([^"]+)"/);
    if (messageMatch && messageMatch[1]) {
      errorInfo.message = messageMatch[1];
    }

    const lineMatch = errorMessage.match(/line:\s*(\d+)/);
    if (lineMatch && lineMatch[1]) {
      errorInfo.line = parseInt(lineMatch[1], 10);
    }

    const columnMatch = errorMessage.match(/column:\s*(\d+)/);
    if (columnMatch && columnMatch[1]) {
      errorInfo.column = parseInt(columnMatch[1], 10);
    }

    log(`Parsed error: Line ${errorInfo.line}, Column ${errorInfo.column}, Message: ${errorInfo.message}`);
    return errorInfo;
  }

  // Retrieves symbols from the cache
  getDocumentSymbols(document: vscode.TextDocument): ShardsSymbol[] {
    return this.symbolCache.get(document.fileName) || [];
  }

  // Generates AST using the external shards CLI
  private async generateAST(filePath: string): Promise<any> {
    const config = vscode.workspace.getConfiguration('shards');
    const shardsPath = config.get<string>('shardsPath') || 'shards';
    const includePaths = config.get<string[]>('includePaths') || [];

    const tmpDir = os.tmpdir();
    const astFilePath = path.join(tmpDir, `ast-${Date.now()}.json`);
    const astLogFilePath = path.join(tmpDir, `shards-ast.log`);

    // Build include path arguments
    const includeArgs = includePaths
      .map(p => `-I "${p}"`)
      .join(' ');

    const cmd = `${shardsPath} ast "${filePath}" ${includeArgs} -o "${astFilePath}"`;
    console.log('Executing command:', cmd); // Debug log

    // Get workspace folder for the current file
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    let cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);

    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: cwd, env: { LOG_FORMAT: '%v', SHARDS_LOG_FILE: astLogFilePath } });

      if (stderr && stderr.trim().length > 0) {
        log(`Command stderr: ${stderr}`);
      }
    } catch (error: any) {
      console.error('Error executing shards command:', error);
      // Capture both the error message and any stderr output
      const errorMessage = error.message || 'Unknown error';
      const stderr = error.stderr || '';
      throw new Error(`${errorMessage}\n${stderr}`);
    }

    if (!fs.existsSync(astFilePath)) {
      throw new Error(`AST file not generated at ${astFilePath}`);
    }

    const astContent = fs.readFileSync(astFilePath, 'utf8');
    fs.unlinkSync(astFilePath); // Clean up

    return JSON.parse(astContent);
  }

  // Extracts symbols from the AST
  private extractSymbols(ast: any, filePath: string): ShardsSymbol[] {
    const symbols: ShardsSymbol[] = [];

    if (!ast || !ast.sequence) return symbols;

    // Helper function to process function nodes
    const processFuncNode = (node: any) => {
      if (!node.func) return;

      const funcName = node.func.name;
      log('Processing node:', funcName); // Debug log

      // Handle wire definitions
      if (funcName === 'wire' || funcName === 'template' || funcName === 'define' || funcName === 'macro') {
        const nameParam = node.func.params?.[0]?.id?.name;
        if (!nameParam) {
          log('Wire found but no name parameter');
          return;
        }

        const line = (node.line_info?.line || 1) - 1;
        const column = (node.line_info?.column || 1) - 1;

        log(`Found wire: ${nameParam} at line ${line}`); // Debug log

        const range = new vscode.Range(
          new vscode.Position(line, column),
          new vscode.Position(line, column + nameParam.length)
        );

        symbols.push({
          name: nameParam,
          kind: KIND_MAP[funcName],
          range,
          selectionRange: range,
          path: filePath,
        });
      }
    };

    // Recursively process the AST
    const visitNode = (node: any) => {
      if (Array.isArray(node)) {
        node.forEach(visitNode);
        return;
      }

      if (typeof node !== 'object' || !node) return;

      processFuncNode(node);

      // Visit all properties of the node
      Object.values(node).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          visitNode(value);
        }
      });
    };

    // Start visiting from the sequence
    visitNode(ast.sequence);

    log(`Extracted ${symbols.length} symbols from ${filePath}`); // Debug log
    return symbols;
  }

  // Implementation of DocumentSymbolProvider interface
  async provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    const symbols = this.getDocumentSymbols(document);

    return symbols.map(symbol => {
      return new vscode.DocumentSymbol(
        symbol.name,
        '', // Detail can be empty or provide additional info
        symbol.kind,
        symbol.range,
        symbol.selectionRange
      );
    });
  }

  // Add this method to the SymbolProvider class
  getAllSymbols(): ShardsSymbol[] {
    const allSymbols: ShardsSymbol[] = [];
    for (const symbols of this.symbolCache.values()) {
      allSymbols.push(...symbols);
    }
    return allSymbols;
  }

  // Cleanup method to dispose resources
  dispose() {
    this.diagnosticCollection.dispose();
  }
}