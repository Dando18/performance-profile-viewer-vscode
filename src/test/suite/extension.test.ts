import * as assert from 'assert';
import * as path from 'path';

import { execSync } from 'child_process';

import * as vscode from 'vscode';
import { ProfilerOutput } from '../../profileroutput';

suite('ProfileViewer Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Run External Python', () => {
		console.log(execSync("which python3").toString());

		const pythonPath = execSync("python3 --version").toString();
		assert.ok(pythonPath.startsWith("Python 3"));
	});

	test('Open PyInstrument Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'pyinstrument', 'pyinstrument.json');
		let profile = new ProfilerOutput(fpath, "pyinstrument", false);

		assert.strictEqual(profile.type, "pyinstrument");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0.1705) < 0.0001);
	});
});
