import * as vscode from 'vscode';
import { PROFILER_OUTPUT_TYPES } from './profileroutput';
import { ProfileTreeEditor } from './profiletree';
import { FlameGraphView } from './flamegraph';

function selectPathAndOpen(source: string, expectsDir: boolean, scheme: string): void  {
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
			let profileUri = getProfileUri(filePath, source, scheme);
			vscode.commands.executeCommand('vscode.open', profileUri, vscode.ViewColumn.One);
		}
	});
}


function openProfile(scheme: string): void {
	/* prompt for the type of profile to open */
	vscode.window.showQuickPick(Object.keys(PROFILER_OUTPUT_TYPES), {title: "Select Profile Type", placeHolder: "Open profile from..."})
		.then((profileType: string | undefined) => {
			if (profileType) {
				const isDirectory = PROFILER_OUTPUT_TYPES[profileType as keyof typeof PROFILER_OUTPUT_TYPES].isDirectory;
				selectPathAndOpen(profileType, isDirectory, scheme);
			}
		});
}


function getProfileUri(fpath: string | vscode.Uri, profileType: string, scheme: string): vscode.Uri {
	return vscode.Uri.from({
		scheme: scheme,
		path: fpath.toString(),
		query: JSON.stringify({type: profileType})
	});
}

export function activate(context: vscode.ExtensionContext) {

	/* register tree editor */
	let profileTreeEditor = new ProfileTreeEditor(context);
	vscode.window.registerCustomEditorProvider('profileviewer.profileTreeEditor', profileTreeEditor, {
			webviewOptions: {
				retainContextWhenHidden: true,
			}
		});

	/* register commands */
	for (const [profileType, profileInfo] of Object.entries(PROFILER_OUTPUT_TYPES)) {
		const commandName = `profileviewer.open${profileInfo.name}Profile`;
		let command = vscode.commands.registerCommand(commandName, () => selectPathAndOpen(profileType, profileInfo.isDirectory, "profile-tree"));
		context.subscriptions.push(command);
	}

	let openProfileCommand = vscode.commands.registerCommand('profileviewer.openProfile', () => openProfile("profile-tree"));
	context.subscriptions.push(openProfileCommand);

	/* flame graph commands */
	let flameGraphView = new FlameGraphView();
	let flameGraphCommand = vscode.commands.registerCommand('profileviewer.openFlameGraph', () => {
		flameGraphView.show(context, null);
	});
	context.subscriptions.push(flameGraphCommand);

}

export function deactivate() {}
