const fs = require('fs').promises;
const path = require('path');

const SEARCH_DIRECTORIES = ['.']; // Start from the project root
const IGNORE_DIRECTORIES = ['node_modules', '.git', '.github'];
const FILE_EXTENSION = '.js';
const ESM_KEYWORDS = /\b(import|export)\b/;

async function findEsmFiles(dir) {
    let esmFiles = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!IGNORE_DIRECTORIES.includes(entry.name)) {
                    const nestedEsmFiles = await findEsmFiles(fullPath);
                    esmFiles = esmFiles.concat(nestedEsmFiles);
                }
            } else if (entry.isFile() && entry.name.endsWith(FILE_EXTENSION)) {
                try {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    if (ESM_KEYWORDS.test(content)) {
                        esmFiles.push(fullPath);
                    }
                } catch (readErr) {
                    console.error(`Error reading file ${fullPath}:`, readErr);
                }
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
    }
    return esmFiles;
}

async function main() {
    console.log('Searching for files with ES Module syntax...');
    let allEsmFiles = [];

    for (const startDir of SEARCH_DIRECTORIES) {
        const files = await findEsmFiles(path.resolve(startDir));
        allEsmFiles = allEsmFiles.concat(files);
    }

    if (allEsmFiles.length > 0) {
        console.log('\nFound the following files using ESM syntax:');
        // Use relative paths for cleaner output
        const root = path.resolve('.');
        allEsmFiles.forEach(file => console.log(path.relative(root, file)));
    } else {
        console.log('\nNo files using ESM syntax were found.');
    }
}

main().catch(console.error);
