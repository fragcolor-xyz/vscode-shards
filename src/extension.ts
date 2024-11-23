// src/extension.ts

import * as vscode from 'vscode';
import { SymbolProvider } from './symbolProvider';
import { DefinitionProvider } from './definitionProvider';

// Debounce utility to prevent rapid consecutive calls
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('Shards Extension is now active!');

  // Initialize the symbol provider
  const symbolProvider = new SymbolProvider();

  // Initialize providers
  const documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider(
    { scheme: 'file', language: 'shards' },
    symbolProvider,
    { label: 'Shards' }
  );

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
      if (document.languageId === 'shards') {
        await symbolProvider.updateDocumentSymbols(document);
      }
    }
    vscode.window.showInformationMessage('Shards Extension reloaded.');
  });

  // Listen to document changes and trigger AST parsing
  const debouncedParse = debounce(async (document: vscode.TextDocument) => {
    if (document.languageId !== 'shards') return;
    console.log('Parsing document:', document.fileName); // Debug log
    try {
      await symbolProvider.updateDocumentSymbols(document);
    } catch (error) {
      console.error('Error updating document symbols:', error);
      vscode.window.showErrorMessage('Shards Extension: Failed to update symbols.');
    }
  }, 500);

  // Parse all open documents immediately
  const parseOpenDocuments = async () => {
    console.log("Parsing all open documents...");
    const docs = vscode.workspace.textDocuments;
    for (const doc of docs) {
      if (doc.languageId === 'shards') {
        console.log("Initial parse of:", doc.fileName);
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
    if (document.languageId === 'shards') {
      console.log('Document opened, parsing immediately:', document.fileName);
      await symbolProvider.updateDocumentSymbols(document);
    }
  });

  // Save events - parse immediately without debounce
  const saveSubscription = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (document.languageId === 'shards') {
      console.log('Document saved, parsing immediately:', document.fileName);
      await symbolProvider.updateDocumentSymbols(document);
    }
  });

  // Changes can remain debounced
  const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    debouncedParse(event.document);
  });

  // Add workspaceFoldersChange to subscriptions
  context.subscriptions.push(
    documentSymbolProvider,
    defProviderDisposable,
    reloadCommand,
    changeSubscription,
    saveSubscription,
    openSubscription,
    workspaceFoldersChange
  );
}

export function deactivate() {
  console.log('Shards Extension is now deactivated.');
}