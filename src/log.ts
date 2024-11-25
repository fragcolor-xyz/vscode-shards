import * as vscode from 'vscode';

export var outputChannel: vscode.OutputChannel;
export function initOutputChannel() {
	outputChannel = vscode.window.createOutputChannel("Shards", "shards");
}
export function log(...args: any[]) {
	outputChannel.appendLine(args.join(" "));
}