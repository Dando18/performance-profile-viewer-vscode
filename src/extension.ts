import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { PROFILE_TYPES } from './profiletypes';
import { ProfileDataProvider, ProfileColorProvider, ProfileTreeItem } from './tree';
import { FlameGraphView } from './flamegraph';


function selectPathAndOpen(source: string, expectsDir: boolean, treeData: ProfileDataProvider): void  {
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


function openProfile(treeData: ProfileDataProvider): void {
	/* prompt for the type of profile to open */
	vscode.window.showQuickPick(Object.keys(PROFILE_TYPES), {title: "Select Profile Type", placeHolder: "Open profile from..."})
		.then((profileType: string | undefined) => {
			if (profileType) {
				selectPathAndOpen(profileType, PROFILE_TYPES[profileType as keyof typeof PROFILE_TYPES].isDirectory, treeData);
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
	for (const [profileType, profileInfo] of Object.entries(PROFILE_TYPES)) {
		const commandName = `profileviewer.open${profileInfo.name}Profile`;
		let command = vscode.commands.registerCommand(commandName, () => selectPathAndOpen(profileType, profileInfo.isDirectory, profileDataProvider));
		context.subscriptions.push(command);
	}

	let openProfileCommand = vscode.commands.registerCommand('profileviewer.openProfile', () => openProfile(profileDataProvider));
	context.subscriptions.push(openProfileCommand);

	/* flame graph commands */
	let flameGraphView = new FlameGraphView();
	let flameGraphCommand = vscode.commands.registerCommand('profileviewer.openFlameGraph', () => {
		flameGraphView.show(context, profileDataProvider.profileData);
	});
	context.subscriptions.push(flameGraphCommand);

}

export function deactivate() {}
