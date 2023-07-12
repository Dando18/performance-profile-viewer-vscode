import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { ProfileDataProvider, ProfileColorProvider, ProfileTreeItem } from './tree';


function viewProfile(source: string, expectsDir: boolean, treeData: ProfileDataProvider): void  {
	/* prompt user to select path to profile */
	vscode.window.showOpenDialog({
		canSelectFiles: !expectsDir,
		canSelectFolders: expectsDir,
		canSelectMany: false,
		openLabel: 'Select Profile',
		title: 'Select Profile',
	}).then((fileUris: vscode.Uri[] | undefined) => {
		if (fileUris && fileUris.length > 0) {
			const filePath = fileUris[0].fsPath;

			/* call the external python script */
			const pythonScriptPath = path.join(__dirname, '..', 'src', 'parse_profile.py');
			const pythonProcess = execFile('python3', [pythonScriptPath, "--profile", filePath, "--type", source, "--hot-path"],
				(error: Error | null, stdout: string, stderr: string) => {
					if (error) {
						console.log("Failed to start python script: " + error.message);
						return;
					}

					if (stdout) {
						const parseData = JSON.parse(stdout);
						treeData.setProfileData(parseData);
					}
				});
		}
	});
} 


export function activate(context: vscode.ExtensionContext) {

	/* create decoration provider */
	new ProfileColorProvider();

	/* register tree view */
	let profileDataProvider = new ProfileDataProvider();
	vscode.window.registerTreeDataProvider('profileViewer', profileDataProvider);

	/* tree view commands */
	vscode.commands.registerCommand('profileviewer.viewNodeSource', async (node: ProfileTreeItem) => node.open());

	/* register commands */
	let hpctoolkitCommand = vscode.commands.registerCommand('profileviewer.viewHPCToolkitProfile', () => {
		viewProfile("hpctoolkit", true, profileDataProvider);
	});
	context.subscriptions.push(hpctoolkitCommand);

	let caliperCommand = vscode.commands.registerCommand('profileviewer.viewCaliperProfile', () => {
		viewProfile("caliper", false, profileDataProvider);
	});
	context.subscriptions.push(caliperCommand);

	let tauCommand = vscode.commands.registerCommand('profileviewer.viewTauProfile', () => {
		viewProfile("tau", false, profileDataProvider);
	});
	context.subscriptions.push(tauCommand);

	let pyinstrumentCommand = vscode.commands.registerCommand('profileviewer.viewPyInstrumentProfile', () => {
		viewProfile("pyinstrument", false, profileDataProvider);
	});
	context.subscriptions.push(pyinstrumentCommand);
}

export function deactivate() {}
