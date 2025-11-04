import { dialog, app } from 'electron';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Checks if NpCap is installed by querying the Windows Registry for its service key.
 * @private
 * @returns {Promise<boolean>} A promise that resolves to true if NpCap is installed, false otherwise.
 */
function isNpcapInstalled() {
    return new Promise((resolve) => {
        // This registry key for the Npcap service is a more reliable indicator of installation.
        const command = 'reg query HKLM\\SYSTEM\\CurrentControlSet\\Services\\npcap';
        exec(command, (error, stdout, stderr) => {
            resolve(!error);
        });
    });
}

/**
 * Checks for the NpCap dependency on Windows. If it's not found,
 * it prompts the user to install it. The app will only proceed if NpCap is installed.
 * @returns {Promise<boolean>} A promise that resolves to true if the app can proceed, false otherwise.
 */
export async function checkForNpcap() {
    if (process.platform !== 'win32') {
        return true;
    }

    let installed = await isNpcapInstalled();
    if (installed) {
        return true;
    }

    const userResponse = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Exit'],
        defaultId: 0,
        cancelId: 1,
        title: 'Required Software Missing',
        message: 'NpCap is not installed',
        detail: 'This application requires NpCap (in API compatibility mode) to function.\n\nPlease visit https://npcap.com/#download to download it',
    });

    if (userResponse.response === 0) {
        try {
            await runInstaller();
            installed = await isNpcapInstalled();
            if (!installed) {
                dialog.showErrorBox(
                    'Installation Not Detected',
                    'NpCap was not detected after installation. Please follow the readme to install npcap in the right mode'
                );
                app.quit();
                return false;
            }
            return true;
        } catch (err) {
            app.quit();
            return false;
        }
    } else {
        app.quit();
        return false;
    }
}
