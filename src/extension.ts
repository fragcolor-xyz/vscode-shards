// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';

var outputChannel: vscode.OutputChannel;

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

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel("Shards", "shards");
	vscode.languages.registerDocumentFormattingEditProvider('shards', { provideDocumentFormattingEdits });
}

// This method is called when your extension is deactivated
export function deactivate() { }
