// src/definitionProvider.ts

import * as vscode from 'vscode';
import { SymbolProvider } from './symbolProvider';

export class DefinitionProvider implements vscode.DefinitionProvider {
  constructor(private symbolProvider: SymbolProvider) { }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_-]*/);
    const word = wordRange ? document.getText(wordRange) : '';

    if (!word) return undefined;

    // Search for the symbol in all workspace documents
    const allSymbols = this.symbolProvider.getAllSymbols();
    console.log('Looking for definition of:', word);
    console.log('Available symbols:', allSymbols.map(s => ({ name: s.name, path: s.path })));

    // Find all matching symbols (there might be multiple wire definitions)
    const targetSymbols = allSymbols.filter(symbol => symbol.name === word);
    console.log('Found matching symbols:', targetSymbols.length);

    if (targetSymbols.length === 0) return undefined;

    // Convert symbols to locations
    return targetSymbols.map(symbol => {
      const targetUri = vscode.Uri.file(symbol.path);
      const targetPosition = new vscode.Position(
        symbol.range.start.line,
        symbol.range.start.character
      );
      return new vscode.Location(targetUri, new vscode.Range(targetPosition, targetPosition));
    });
  }
}