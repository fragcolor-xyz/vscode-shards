import * as vscode from 'vscode';
import * as Net from 'net';

class ShardsRemoteDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {

		// Get port and address from session configuration, with defaults
		const port = session.configuration.port || 57427;
		const address = session.configuration.address || "127.0.0.1";

		// Make VS Code connect to debug server
		return new vscode.DebugAdapterServer(port, address);
	}
}

export { ShardsRemoteDebugAdapterServerDescriptorFactory };