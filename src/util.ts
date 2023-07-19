import * as vscode from 'vscode';
import * as process from 'child_process';


/** A helper function to find the correct python to use in the shell.
 * First checks if the Python extension is installed, and if so, uses the
 * python.interpreterPath. 
 * If not, it checks the python.pythonPath setting.
 * Then try running `python3 --version` in shell. If it is successful, use that.
 * Otherwise, return "python"
 * @returns the path to the python executable
 */
export async function getPythonPath(): Promise<string | vscode.Uri> {

    // check if the Python extension is installed
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (pythonExtension) {
        const python = await pythonExtension.activate();
        if (python && python.interpreterPath) {
            return python.interpreterPath;
        }
    }

    // check if the python.pythonPath setting is set
    const pythonPath = vscode.workspace.getConfiguration("python").get("pythonPath");
    if (pythonPath) {
        console.log(pythonPath);
        return pythonPath.toString();
    }

    // check if python3 is available
    try {
        let output = process.execSync("python3 --version");
        if (output) {
            return "python3";
        }
    } catch (e) {}

    return "python";
}