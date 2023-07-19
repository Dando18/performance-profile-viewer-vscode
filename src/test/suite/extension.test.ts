import * as assert from 'assert';
import * as path from 'path';

import { execSync } from 'child_process';

import * as vscode from 'vscode';
import { ProfilerOutput } from '../../profileroutput';
import { getPythonPath } from '../../util';

suite('ProfileViewer Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Run External Python', async () => {
		const pythonPath = await getPythonPath();
		assert.doesNotThrow(() => {
			execSync(`${pythonPath} --version`);
		});
	});

	test('Open PyInstrument Profile', async () => {
		assert.notEqual(vscode.workspace.workspaceFolders, undefined);

		const fpath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'pyinstrument', 'pyinstrument.json');
		console.log(fpath);
		let profile = new ProfilerOutput(fpath, "pyinstrument", false);

		assert.strictEqual(profile.type, "pyinstrument");
		assert.strictEqual(profile.isDirectory, false);

		let tree = await profile.getTree();
		assert.strictEqual(tree.roots.length, 1);
		assert.ok(Math.abs(tree.getMaxInclusiveTime() - 0.1705) < 0.0001);
	});
});
