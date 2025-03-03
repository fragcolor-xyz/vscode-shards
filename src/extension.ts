// src/extension.ts

import * as vscode from 'vscode';
import { SymbolProvider } from './symbolProvider';
import { DefinitionProvider } from './definitionProvider';
import { provideDocumentFormattingEdits } from './formattingProvider';
import { initOutputChannel, log } from './log';

// Debounce utility to prevent rapid consecutive calls
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Add this function near the top, after imports
function shouldProcessDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && document.languageId === 'shards';
}

export async function activate(context: vscode.ExtensionContext) {
  initOutputChannel();
  log('Shards Extension is now active!');

  // Register the formatting provider
	vscode.languages.registerDocumentFormattingEditProvider('shards', { provideDocumentFormattingEdits });

  // Initialize the symbol provider
  const symbolProvider = new SymbolProvider();

  // Initialize providers
  const documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider(
    { scheme: 'file', language: 'shards' },
    symbolProvider,
    { label: 'Shards' }
  );

  // Add workspace symbol provider
  const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider({
    provideWorkspaceSymbols: async (query: string): Promise<vscode.SymbolInformation[]> => {
      const allSymbols = symbolProvider.getAllSymbols();
      const filteredSymbols = allSymbols.filter(symbol => 
        symbol.name.toLowerCase().includes(query.toLowerCase())
      );
      
      return filteredSymbols.map(symbol => new vscode.SymbolInformation(
        symbol.name,
        symbol.kind,
        '',
        new vscode.Location(
          vscode.Uri.file(symbol.path),
          symbol.range
        )
      ));
    }
  });

  const definitionProvider = new DefinitionProvider(symbolProvider);
  const defProviderDisposable = vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'shards' },
    definitionProvider
  );

  // Register the reload command
  const reloadCommand = vscode.commands.registerCommand('shards.reload', async () => {
    symbolProvider.clearCache();
    // Reparse all open documents
    for (const document of vscode.workspace.textDocuments) {
      if (shouldProcessDocument(document)) {
        await symbolProvider.updateDocumentSymbols(document);
      }
    }
    vscode.window.showInformationMessage('Shards Extension reloaded.');
  });

  // Listen to document changes and trigger AST parsing
  const debouncedParse = debounce(async (document: vscode.TextDocument) => {
    if (!shouldProcessDocument(document)) return;
    log('Parsing document:', document.fileName);
    try {
      await symbolProvider.updateDocumentSymbols(document);
    } catch (error) {
      console.error('Error updating document symbols', document.fileName);
    }
  }, 500);

  // Parse all open documents immediately
  const parseOpenDocuments = async () => {
    log("Parsing all open documents...");
    const docs = vscode.workspace.textDocuments;
    for (const doc of docs) {
      if (shouldProcessDocument(doc)) {
        log("Initial parse of:", doc.fileName);
        await symbolProvider.updateDocumentSymbols(doc);
      }
    }
  };

  // Call it immediately
  parseOpenDocuments();

  // Also parse when workspace folders change
  const workspaceFoldersChange = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
    await parseOpenDocuments();
  });

  // Listen to document open events - parse immediately without debounce
  const openSubscription = vscode.workspace.onDidOpenTextDocument(async (document) => {
    if (shouldProcessDocument(document)) {
      log('Document opened, parsing immediately:', document.fileName);
      await symbolProvider.updateDocumentSymbols(document);
    }
  });

  // Save events - parse immediately without debounce
  const saveSubscription = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (shouldProcessDocument(document)) {
      log('Document saved, parsing immediately:', document.fileName);
      await symbolProvider.updateDocumentSymbols(document);
    }
  });

  // Changes can remain debounced
  const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    if(event.contentChanges.length > 0) {
      debouncedParse(event.document);
    }
  });

  // Add workspaceFoldersChange to subscriptions
  context.subscriptions.push(
    documentSymbolProvider,
    workspaceSymbolProvider,
    defProviderDisposable,
    reloadCommand,
    changeSubscription,
    saveSubscription,
    openSubscription,
    workspaceFoldersChange,
    symbolProvider
  );
}

export function deactivate() {
  log('Shards Extension is now deactivated.');
}