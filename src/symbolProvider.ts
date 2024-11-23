// src/symbolProvider.ts

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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

// Mapping of custom kinds to VS Code SymbolKind
const KIND_MAP: { [key: string]: vscode.SymbolKind } = {
  wire: vscode.SymbolKind.Function,
  template: vscode.SymbolKind.Function,
  define: vscode.SymbolKind.Function,
  macro: vscode.SymbolKind.Function,
  mesh: vscode.SymbolKind.Struct,
  // Add more mappings as needed
};

export class SymbolProvider implements vscode.DocumentSymbolProvider {
  private symbolCache: Map<string, ShardsSymbol[]> = new Map();
  private _onDidChangeSymbols = new vscode.EventEmitter<void>();
  readonly onDidChangeSymbols = this._onDidChangeSymbols.event;

  // Clears the symbol cache
  clearCache() {
    this.symbolCache.clear();
  }

  // Updates symbols for a given document
  async updateDocumentSymbols(document: vscode.TextDocument): Promise<void> {
    const filePath = document.fileName;
    console.log(`Updating symbols for ${filePath}`);

    try {
      const ast = await this.generateAST(filePath);
      const symbols = this.extractSymbols(ast, filePath);
      this.symbolCache.set(filePath, symbols);
      console.log(`Updated cache for ${filePath}, total symbols: ${symbols.length}`);
      this._onDidChangeSymbols.fire();
    } catch (error) {
      console.error('Error generating AST:', error);
      vscode.window.showErrorMessage('Shards Extension: Failed to update symbols.');
    }
  }

  // Retrieves symbols from the cache
  getDocumentSymbols(document: vscode.TextDocument): ShardsSymbol[] {
    return this.symbolCache.get(document.fileName) || [];
  }

  // Generates AST using the external shards CLI
  private async generateAST(filePath: string): Promise<any> {
    const shardsPath = vscode.workspace.getConfiguration('shards').get<string>('shardsPath') || 'shards';
    const tmpDir = os.tmpdir();
    const astFilePath = path.join(tmpDir, `ast-${Date.now()}.json`);

    const cmd = `${shardsPath} ast "${filePath}" -o "${astFilePath}"`;

    await execAsync(cmd, { cwd: tmpDir });

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
      console.log('Processing node:', funcName); // Debug log

      // Handle wire definitions
      if (funcName === 'wire') {
        const nameParam = node.func.params?.[0]?.id?.name;
        if (!nameParam) {
          console.log('Wire found but no name parameter');
          return;
        }

        const line = (node.line_info?.line || 1) - 1;
        const column = (node.line_info?.column || 1) - 1;

        console.log(`Found wire: ${nameParam} at line ${line}`); // Debug log

        const range = new vscode.Range(
          new vscode.Position(line, column),
          new vscode.Position(line, column + nameParam.length)
        );

        symbols.push({
          name: nameParam,
          kind: KIND_MAP.wire,
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

    console.log(`Extracted ${symbols.length} symbols from ${filePath}`); // Debug log
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
}