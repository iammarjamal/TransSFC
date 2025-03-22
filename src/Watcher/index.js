// Import required modules.
const chokidar = require("chokidar"); // For watching file changes.
const fs = require("fs-extra"); // For file system operations.
const path = require("path"); // For working with file paths.
const crypto = require("crypto"); // For generating file hashes.

// Define paths for Blade views and translation files.
const viewsPath = path.join(__dirname, "../../../resources/views");
const langPath = path.join(__dirname, "../../../lang");

console.log(
    "🔍 Starting async watch on Blade files for translation updates..."
);

// Caches for file content and extracted translations.
const fileHashCache = {};
const fileTranslationCache = {};

/**
 * Parses a PHP array string (from a translation file) into a JavaScript object.
 * Converts the PHP array format to a valid JSON object.
 *
 * @param {string} content - The content of the PHP file.
 * @returns {Object} - The resulting object.
 */
function parsePhpArray(content) {
    let trimmed = content.replace(/<\?php\s+return\s+/g, "").trim();
    if (trimmed.endsWith(";")) {
        trimmed = trimmed.slice(0, -1).trim();
    }
    // Convert PHP array syntax to JSON object syntax.
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        trimmed = "{" + trimmed.slice(1, -1) + "}";
    }
    let jsonStr = trimmed.replace(/=>/g, ":").replace(/'/g, '"');
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("❌ Error parsing PHP array to JSON:", e);
        console.error("Generated JSON string:", jsonStr);
        return {};
    }
}

/**
 * Recursively converts a JavaScript object into a PHP array string.
 * Supports converting nested objects.
 *
 * @param {Object} obj - The object to convert.
 * @param {number} indentLevel - The indentation level.
 * @returns {string} - The PHP array string representation.
 */
function convertToPHPArray(obj, indentLevel = 1) {
    const indent = "    ".repeat(indentLevel);
    const entries = Object.entries(obj).map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
            const nested = convertToPHPArray(value, indentLevel + 1);
            return `${indent}'${key}' => ${nested}`;
        }
        return `${indent}'${key}' => '${value.replace(/'/g, "\\'")}'`;
    });
    return (
        "[\n" +
        entries.join(",\n") +
        "\n" +
        "    ".repeat(indentLevel - 1) +
        "]"
    );
}

/**
 * Extracts translations from a Blade file content.
 * Looks for blocks between @TransSFC('lang') and @endTransSFC.
 *
 * @param {string} content - The content of the Blade file.
 * @param {string} filePath - The absolute path of the file.
 * @returns {Object} - An object containing translations organized by language.
 */
function extractTranslations(content, filePath) {
    const blockRegex = /@TransSFC\(['"](\w+)['"]\)([\s\S]*?)@endTransSFC/g;
    const translations = {};
    // Build the key prefix from the file's relative path.
    const relativePath = path
        .relative(viewsPath, filePath)
        .replace(/\\/g, "/")
        .replace(".blade.php", "");
    const prefix = relativePath.split("/").join(".");

    let match;
    while ((match = blockRegex.exec(content)) !== null) {
        const lang = match[1].trim();
        const arrayContent = match[2].trim();
        if (!arrayContent.startsWith("[") || !arrayContent.endsWith("]")) {
            console.error(
                `❌ ${filePath}: Block for '${lang}' must be enclosed in square brackets.`
            );
            continue;
        }
        const keyValueRegex = /["']([^"']+)["']\s*=>\s*["']([^"']+)["']/g;
        if (!translations[lang]) {
            translations[lang] = {};
        }
        let pair;
        while ((pair = keyValueRegex.exec(arrayContent)) !== null) {
            const key = pair[1].trim();
            const value = pair[2].trim();
            // Build the final key with the "sfc." prefix.
            const finalKey = `sfc.${prefix}.${key}`;
            translations[lang][finalKey] = value;
        }
    }
    return translations;
}

/**
 * Updates the translation file for a given language.
 * The file is updated only if changes are detected.
 *
 * @param {string} lang - The language code.
 * @param {string} prefix - The prefix derived from the Blade file path.
 * @param {Object} newTranslations - The new translations for the language.
 */
async function updateTranslationForFile(lang, prefix, newTranslations) {
    const filePrefix = `sfc.${prefix}`;
    const langFile = path.join(langPath, lang, "app.php");
    let existingData = {};

    if (await fs.pathExists(langFile)) {
        try {
            const fileContent = await fs.readFile(langFile, "utf-8");
            existingData = parsePhpArray(fileContent);
        } catch (error) {
            console.error(`⚠️ Error parsing ${langFile}:`, error);
        }
    }
    // Remove old translations related to this Blade file.
    Object.keys(existingData).forEach((key) => {
        if (key.startsWith(filePrefix + ".")) {
            delete existingData[key];
        }
    });
    const mergedData = { ...existingData, ...newTranslations };
    if (JSON.stringify(existingData) === JSON.stringify(mergedData)) {
        console.log(`🔄 No changes for ${lang} in ${langFile}.`);
        return;
    }
    const phpArray = convertToPHPArray(mergedData);
    const phpContent = `<?php\n\nreturn ${phpArray};\n`;
    try {
        await fs.outputFile(langFile, phpContent, "utf-8");
        console.log(`✅ Updated translations for ${lang} in ${langFile}`);
    } catch (error) {
        console.error(`❌ Failed to update ${langFile}:`, error);
    }
}

/**
 * Removes translations associated with a deleted Blade file.
 *
 * @param {string} filePath - The absolute path of the deleted file.
 */
async function removeTranslationsForFile(filePath) {
    const relativePath = path
        .relative(viewsPath, filePath)
        .replace(/\\/g, "/")
        .replace(".blade.php", "");
    const prefix = relativePath.split("/").join(".");
    const filePrefix = `sfc.${prefix}`;

    try {
        const languages = await fs.readdir(langPath);
        for (const lang of languages) {
            const langFile = path.join(langPath, lang, "app.php");
            if (await fs.pathExists(langFile)) {
                let data = {};
                try {
                    const fileContent = await fs.readFile(langFile, "utf-8");
                    data = parsePhpArray(fileContent);
                } catch (error) {
                    console.error(`⚠️ Error parsing ${langFile}:`, error);
                }
                let modified = false;
                Object.keys(data).forEach((key) => {
                    if (key.startsWith(filePrefix + ".")) {
                        delete data[key];
                        modified = true;
                    }
                });
                if (modified) {
                    const phpArray = convertToPHPArray(data);
                    const phpContent = `<?php\n\nreturn ${phpArray};\n`;
                    await fs.outputFile(langFile, phpContent, "utf-8");
                    console.log(
                        `🗑️ Removed translations for prefix ${filePrefix} in ${langFile}`
                    );
                }
            }
        }
    } catch (error) {
        console.error(
            `❌ Error removing translations for file ${filePath}:`,
            error
        );
    }
}

/**
 * Processes a single Blade file:
 * - Reads the file content.
 * - Checks for changes using a hash.
 * - Compares new extracted translations with cached ones.
 * - Updates translation files only for the language blocks that have changed.
 *
 * @param {string} filePath - The absolute path of the Blade file.
 */
async function processBladeFile(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        const newExtracted = extractTranslations(content, filePath);
        const hash = crypto.createHash("md5").update(content).digest("hex");

        // Skip processing if the file content is unchanged.
        if (fileHashCache[filePath] === hash) {
            return;
        }
        fileHashCache[filePath] = hash;

        // Determine file prefix for translation keys.
        const relativePath = path
            .relative(viewsPath, filePath)
            .replace(/\\/g, "/")
            .replace(".blade.php", "");
        const prefix = relativePath.split("/").join(".");

        // Merge the language keys from previous and new extraction.
        const previousExtracted = fileTranslationCache[filePath] || {};
        const languages = new Set([
            ...Object.keys(newExtracted),
            ...Object.keys(previousExtracted),
        ]);
        for (const lang of languages) {
            const newData = newExtracted[lang] || {};
            const oldData = previousExtracted[lang] || {};
            if (JSON.stringify(newData) !== JSON.stringify(oldData)) {
                await updateTranslationForFile(lang, prefix, newData);
            }
        }
        // Update cache with new extraction.
        fileTranslationCache[filePath] = newExtracted;
    } catch (error) {
        console.error(`❌ Error processing file ${filePath}:`, error);
    }
}

/**
 * Debounces file processing to prevent rapid repeated executions.
 *
 * @param {string} filePath - The file path to process.
 * @param {number} delay - The delay in milliseconds (default is 300).
 */
const debounceMap = {};
function debounceProcess(filePath, delay = 300) {
    if (debounceMap[filePath]) {
        clearTimeout(debounceMap[filePath]);
    }
    debounceMap[filePath] = setTimeout(() => {
        processBladeFile(filePath);
        delete debounceMap[filePath];
    }, delay);
}

/**
 * Recursively scans all Blade files in a directory and processes them asynchronously.
 *
 * @param {string} dir - The directory to scan.
 */
async function scanAllBladeFiles(dir) {
    try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                await scanAllBladeFiles(fullPath);
            } else if (item.isFile() && fullPath.endsWith(".blade.php")) {
                await processBladeFile(fullPath);
            }
        }
    } catch (error) {
        console.error(`❌ Error scanning directory ${dir}:`, error);
    }
}

// Initial scan: Process all existing Blade files.
scanAllBladeFiles(viewsPath)
    .then(() => console.log("✅ Initial scan completed."))
    .catch((error) => console.error("❌ Initial scan error:", error));

// Set up watchers for Blade file changes.
chokidar
    .watch(viewsPath, { persistent: true, ignoreInitial: true })
    .on("add", (filePath) => {
        console.log(`✏️ File added: ${filePath}`);
        debounceProcess(filePath);
    })
    .on("change", (filePath) => {
        console.log(`✏️ File changed: ${filePath}`);
        debounceProcess(filePath);
    })
    .on("unlink", (filePath) => {
        console.log(`🗑️ File removed: ${filePath}`);
        removeTranslationsForFile(filePath);
    });

console.log("🚀 Async Lang watcher is running...");