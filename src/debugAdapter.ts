import * as vscode from 'vscode';
import * as Net from 'net';

class ShardsRemoteDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {

		// make VS Code connect to debug server
    let testAddress = "127.0.0.1";
    // Using 57427 (SHARD on a phone keypad)
    let testPort = 57427;

    // _session.configuration.

		return new vscode.DebugAdapterServer(testPort, testAddress);
	}
}

export { ShardsRemoteDebugAdapterServerDescriptorFactory };