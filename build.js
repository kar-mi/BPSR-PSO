const { packager } = require('@electron/packager');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function check7zInstalled() {
  try {
    execSync('7z --help', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function createZipWith7z(sourceDir, zipPath) {
  console.log('Using 7z for compression...');
  // Delete existing zip if it exists
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const command = `7z a -tzip "${zipPath}" ".\\dist\\${sourceDir}\\*" -mx9`;
  execSync(command, { stdio: 'inherit' });
}

function createZipWithPowerShell(sourceDir, zipPath) {
  console.log('Using PowerShell Compress-Archive...');
  const psCommand = `Compress-Archive -Path "dist\\${sourceDir}\\*" -DestinationPath "${zipPath}" -Force`;
  execSync(psCommand, { stdio: 'inherit', shell: 'powershell.exe' });
}

async function build() {
  console.log('Building BPSR PSO with @electron/packager...');

  try {
    const appPaths = await packager({
      dir: '.',
      out: 'dist',
      platform: 'win32',
      arch: 'x64',
      name: 'BPSR PSO',
      appVersion: require('./package.json').version,
      executableName: 'BPSR PSO',
      overwrite: true,
      ignore: [
        /^\/dist($|\/)/,
        /^\/\.git($|\/)/,
        /^\/\.github($|\/)/,
        /^\/node_modules\/\.cache($|\/)/,
        /^\/build\.js$/,
        /^\/\.nvmrc$/,
        /^\/\.prettierrc$/,
        /^\/\.prettierignore$/,
      ],
      extraResource: [
        'README.md'
      ]
    });

    console.log(`Built application to: ${appPaths[0]}`);

    // Create ZIP file
    const distDir = path.basename(appPaths[0]);
    const zipName = `BPSR-PSO-win32-x64.zip`;
    const zipPath = path.join('dist', zipName);

    console.log('Creating ZIP archive...');

    // Use 7z if available, otherwise fall back to PowerShell
    const has7z = check7zInstalled();

    if (has7z) {
      createZipWith7z(distDir, zipPath);
    } else {
      console.log('7z not found, falling back to PowerShell...');
      createZipWithPowerShell(distDir, zipPath);
    }

    console.log(`Created ZIP: ${zipPath}`);
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
