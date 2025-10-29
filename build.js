const { packager } = require('@electron/packager');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

async function createZipWithArchiver(sourceDir, zipPath) {
    console.log('Using archiver (Node.js) for compression...');

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets compression level to max
    });

    return new Promise((resolve, reject) => {
        output.on('close', function() {
            console.log(`Archive size: ${archive.pointer()} total bytes`);
            resolve();
        });

        archive.on('error', function(err) {
            reject(err);
        });

        // Pipe archive data to the file
        archive.pipe(output);

        // Append the entire packaged directory contents
        // This ensures the structure inside the zip is correct (e.g., just the app files)
        const sourcePath = path.join('dist', sourceDir);
        archive.directory(sourcePath, false); // 'false' means don't include the root folder itself

        archive.finalize();
    });
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
    const distDir = path.basename(appPaths[0]); // e.g., 'BPSR PSO-win32-x64'
    const zipName = `BPSR-PSO-win32-x64.zip`;
    const zipPath = path.join('dist', zipName);

    console.log('Creating ZIP archive...');

    // CALL THE NEW FUNCTION
    try {
        await createZipWithArchiver(distDir, zipPath);
    } catch (error) {
        console.error('ZIP creation failed:', error);
        process.exit(1);
    }

    console.log(`Created ZIP: ${zipPath}`);
    console.log('Build completed successfully!');

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
