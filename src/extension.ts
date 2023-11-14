// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import path from 'node:path';
import * as net from 'net';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	StreamInfo,
	TransportKind
} from 'vscode-languageclient/node';
import { Socket } from 'dgram';

var outputChannel: vscode.OutputChannel;
let client: LanguageClient;

function connectToSocket(): Promise<StreamInfo> {
	let port = 7777;
	return new Promise((resolve, reject) => {
		outputChannel.appendLine(`Connecting to server on port ${port}`);
		const client = net.connect({ port: port }, () => {
			resolve({
				writer: client,
				reader: client,
				detached: true, // Assuming you want to detach the spawned process
			});
		});

		client.on('error', (err) => {
			reject(err);
		});
	});
}

export async function start_language_client() {
	let shardsPath = vscode.workspace.getConfiguration("shards").get<string>("path");
	if (shardsPath) {
		outputChannel.appendLine(`Using shards path: ${shardsPath}`);

		// If the extension is launched in debug mode then the debug server options are used
		// Otherwise the run options are used
		let serverOptions: ServerOptions = () => connectToSocket();

		// Options to control the language client
		let clientOptions: LanguageClientOptions = {
			// Register the server for plain text documents
			documentSelector: [{ scheme: 'file', language: 'shards' }],
			synchronize: {
				// Notify the server about file changes to '.clientrc files contained in the workspace
				fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
			},
			outputChannel: outputChannel,
		};

		// Create the language client and start the client.
		client = new LanguageClient(
			'shards',
			'Shards Language Server',
			serverOptions,
			clientOptions
		);

		// Start the client. This will also launch the server
		client.start();
	}
}

async function provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions): Promise<vscode.TextEdit[]> {
	let shardsPath = vscode.workspace.getConfiguration("shards").get<string>("path");
	if (shardsPath) {
		outputChannel.appendLine(`Using shards path: ${shardsPath}`);

		// Spawn the child process
		const child = cp.spawn(shardsPath, ['format', '--', '-']);

		// Handle stdout
		let output = "";
		let haveErrors = false;
		child.stdout.on('data', (data) => {
			console.log('Program output: ' + data);
			output += data.toString();
		});

		// Handle stderr
		child.stderr.on('data', (data) => {
			const errorOutput = data.toString();
			console.error('Program error: ' + errorOutput);
		});

		// Handle errors and exit
		child.on('error', (err) => {
			console.error('Error: ' + err.message);
			haveErrors = true;
		});

		// Write data to the child process's stdin
		child.stdin.write(document.getText());
		child.stdin.end(); // Close stdin when you're done writing

		await new Promise((resolve, reject) => child.on('exit', (code) => {
			outputChannel.appendLine(`Child process exited with code ${code}`);
			if (code === 0) {
				resolve(0);
			} else {
				reject();
			}
		}));

		return [vscode.TextEdit.replace(new vscode.Range(0, 0, document.lineCount, 0), output)];
	} else {
		outputChannel.appendLine(`Formatter path not set, please set 'shards.path'`);
	}

	outputChannel.appendLine(`Formatting failed`);
	return [];
}

async function restartServer() {
	try {
		if (client)
			await client.stop();
	} catch (e) {
		outputChannel.appendLine(`Failed to stop language server: ${e}`);
	}
	outputChannel.appendLine(`Restarting language server`);
	await start_language_client();
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// Setup the output channel
	outputChannel = vscode.window.createOutputChannel("Shards", "shards");

	// Register formatting provider
	vscode.languages.registerDocumentFormattingEditProvider('shards', { provideDocumentFormattingEdits });

	// Start lsp and add restart command
	await start_language_client();
	context.subscriptions.push(
		vscode.commands.registerCommand('shards.restartLangServer', restartServer)
	);
}

// This method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
	if (client) {
		await client.stop();
	}
}
