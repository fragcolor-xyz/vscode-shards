import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import { log } from './log';
export async function provideDocumentFormattingEdits(document: vscode.TextDocument, _options: vscode.FormattingOptions): Promise<vscode.TextEdit[]> {
	let shardsPath = vscode.workspace.getConfiguration("shards").get<string>("path");
	if (shardsPath) {
		log(`Using shards path: ${shardsPath}`);

		// Spawn the child process
		// let wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		let cwd = /* wsFolder ? wsFolder.uri.fsPath : */ os.tmpdir();
		const child = cp.spawn(shardsPath, ['format', '--', '-'], {
			cwd: cwd,
		});

		// Handle stdout
		let output = "";
		let haveErrors = false;
		child.stdout.on('data', (data) => {
			log('Program output: ' + data);
			output += data.toString();
		});

		// Handle stderr
		child.stderr.on('data', (data) => {
			const errorOutput = data.toString();
			log('Program error: ' + errorOutput);
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
			log(`Child process exited with code ${code}`);
			if (code === 0) {
				resolve(0);
			} else {
				reject();
			}
		}));

		return [vscode.TextEdit.replace(new vscode.Range(0, 0, document.lineCount, 0), output)];
	} else {
		log(`Formatter path not set, please set 'shards.path'`);
	}

	log(`Formatting failed`);
	return [];
}