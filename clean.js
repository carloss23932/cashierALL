import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const nodeModulesPath = path.join(projectRoot, 'node_modules');
const packageLockPath = path.join(projectRoot, 'package-lock.json');

console.log('--- Starting Clean Script ---');

try {
    if (fs.existsSync(nodeModulesPath)) {
        console.log(`Deleting directory: ${nodeModulesPath}`);
        fs.rmSync(nodeModulesPath, { recursive: true, force: true });
        console.log('Deleted node_modules.');
    }
    if (fs.existsSync(packageLockPath)) {
        console.log(`Deleting file: ${packageLockPath}`);
        fs.unlinkSync(packageLockPath);
        console.log('Deleted package-lock.json.');
    }
} catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
}

console.log('--- Clean Script Finished ---');