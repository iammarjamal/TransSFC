// Import required modules.
const chokidar = require("chokidar"); // For watching file changes.
const fs = require("fs-extra"); // For file system operations.
const path = require("path"); // For handling file paths.

// Define the paths for the Blade views and translation files (Laravel environment).
const viewsPath = path.join(__dirname, "../../../resources/views");
const langPath = path.join(__dirname, "../../../lang");

console.log("🔍 Watching Blade files for translation updates...");

/**
 * Parses a PHP array string (from a translation file) into a JavaScript object.
 * Converts PHP short array syntax into valid JSON.
 *
 * @param {string} content - The PHP file content.
 * @returns {Object} - Parsed JavaScript object.
 */
function parsePhpArray(content) {
    // Remove PHP tag and the "return" statement.
    let trimmed = content.replace(/<\?php\s+return\s+/g, "").trim();
    // Remove trailing semicolon if it exists.
    if (trimmed.endsWith(";")) {
        trimmed = trimmed.slice(0, -1).trim();
    }
    // Convert outer square brackets to curly braces for valid JSON.
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        trimmed = "{" + trimmed.slice(1, -1) + "}";
    }
    // Replace PHP key-value operator (=>) with colon.
    let jsonStr = trimmed.replace(/=>/g, ":");
    // Replace all single quotes with double quotes.
    jsonStr = jsonStr.replace(/'/g, '"');
    // Remove any trailing commas.
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");

    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Error parsing PHP array to JSON:", e);
        console.error("Generated JSON string:", jsonStr);
        return {};
    }
}

/**
 * Converts a JavaScript object into a PHP array string.
 *
 * @param {Object} obj - Object to convert.
 * @param {number} indentLevel - Current indentation level.
 * @returns {string} - PHP array string.
 */
function convertToPHPArray(obj, indentLevel = 1) {
    const indent = "    ".repeat(indentLevel);
    const entries = Object.entries(obj).map(([key, value]) => {
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
 * Searches for blocks between @TransSFC('lang') and @endTransSFC.
 * Each final key is built as "sfc.{filePrefix}.{key}".
 *
 * @param {string} content - Blade file content.
 * @param {string} filePath - Absolute file path.
 * @returns {Object} - Object with language codes as keys and translation objects as values.
 */
function extractTranslations(content, filePath) {
    // Use the updated tag names.
    const blockRegex = /@TransSFC\(['"](\w+)['"]\)([\s\S]*?)@endTransSFC/g;
    let match;
    let translations = {};

    // Compute file prefix in dot notation.
    let relativePath = path
        .relative(viewsPath, filePath)
        .replace(/\\/g, "/")
        .replace(".blade.php", "");
    let prefix = relativePath.split("/").join(".");

    // Process each translation block.
    while ((match = blockRegex.exec(content)) !== null) {
        const lang = match[1].trim();
        let arrayContent = match[2].trim();

        // Validate that the translation block is enclosed in square brackets.
        if (!arrayContent.startsWith("[") || !arrayContent.endsWith("]")) {
            console.error(
                `❌ Error in ${filePath}: Translation block for language '${lang}' must be enclosed in square brackets [].`
            );
            continue;
        }

        // Extract key-value pairs.
        const keyValueRegex = /'([^']+)'\s*=>\s*'([^']+)'/g;
        let pair;
        if (!translations[lang]) translations[lang] = {};
        while ((pair = keyValueRegex.exec(arrayContent)) !== null) {
            const key = pair[1].trim();
            const value = pair[2].trim();
            // Build final key with the "sfc." prefix.
            const finalKey = `sfc.${prefix}.${key}`;
            translations[lang][finalKey] = value;
        }
    }
    return translations;
}

/**
 * Updates the translation file for a given language and file prefix.
 * Removes keys with the same file prefix, then merges new translations.
 * The output file is now app.php instead of blade.php.
 *
 * @param {string} lang - Language code (e.g., 'ar' or 'en').
 * @param {string} prefix - File prefix derived from the Blade file path.
 * @param {Object} newTranslations - New translations extracted from the file.
 */
function updateTranslationForFile(lang, prefix, newTranslations) {
    // The file prefix now includes "sfc." (e.g., "sfc.livewire.auth.login").
    const filePrefix = `sfc.${prefix}`;
    const langFile = path.join(langPath, lang, "app.php");
    let existingData = {};

    // Load existing translation data if available.
    if (fs.existsSync(langFile)) {
        try {
            const fileContent = fs.readFileSync(langFile, "utf-8");
            existingData = parsePhpArray(fileContent);
        } catch (error) {
            console.error(`⚠️ Error parsing ${langFile}:`, error);
        }
    }
    // Remove keys that belong to this file (keys starting with the filePrefix).
    for (const key in existingData) {
        if (key.startsWith(filePrefix + ".")) {
            delete existingData[key];
        }
    }
    // Merge new translations into the existing data.
    existingData = { ...existingData, ...newTranslations };

    const phpArray = convertToPHPArray(existingData);
    const phpContent = `<?php\n\nreturn ${phpArray};\n`;
    fs.outputFileSync(langFile, phpContent, "utf-8");
    console.log(`✅ Updated translations for ${lang} in ${langFile}`);
}

/**
 * Removes all translations associated with a specific Blade file.
 * Iterates over all language directories and removes keys with the file's prefix.
 *
 * @param {string} filePath - Absolute path to the deleted Blade file.
 */
function removeTranslationsForFile(filePath) {
    // Compute file prefix.
    let relativePath = path
        .relative(viewsPath, filePath)
        .replace(/\\/g, "/")
        .replace(".blade.php", "");
    let prefix = relativePath.split("/").join(".");
    const filePrefix = `sfc.${prefix}`;

    // Iterate through each language folder.
    fs.readdirSync(langPath).forEach((lang) => {
        const langFile = path.join(langPath, lang, "app.php");
        if (fs.existsSync(langFile)) {
            let data = {};
            try {
                const fileContent = fs.readFileSync(langFile, "utf-8");
                data = parsePhpArray(fileContent);
            } catch (error) {
                console.error(`⚠️ Error parsing ${langFile}:`, error);
            }
            let modified = false;
            // Remove keys that start with the file prefix.
            for (const key in data) {
                if (key.startsWith(filePrefix + ".")) {
                    delete data[key];
                    modified = true;
                }
            }
            if (modified) {
                const phpArray = convertToPHPArray(data);
                const phpContent = `<?php\n\nreturn ${phpArray};\n`;
                fs.outputFileSync(langFile, phpContent, "utf-8");
                console.log(
                    `🗑️ Removed translations for prefix ${filePrefix} in ${langFile}`
                );
            }
        }
    });
}

/**
 * Processes a single Blade file:
 * - Reads its content.
 * - Extracts translations.
 * - Updates the translation files for each language.
 *
 * @param {string} filePath - Absolute path to the Blade file.
 */
function processBladeFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const extracted = extractTranslations(content, filePath);
        // Compute file prefix.
        let relativePath = path
            .relative(viewsPath, filePath)
            .replace(/\\/g, "/")
            .replace(".blade.php", "");
        let prefix = relativePath.split("/").join(".");
        // Update translation files for each language found.
        for (const lang in extracted) {
            updateTranslationForFile(lang, prefix, extracted[lang]);
        }
    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
    }
}

/**
 * Debounces file processing to prevent rapid, repeated executions.
 *
 * @param {string} filePath - The file path to process.
 * @param {number} delay - Delay in milliseconds (default: 300ms).
 */
const debounceMap = {};
function debounceProcess(filePath, delay = 300) {
    if (debounceMap[filePath]) clearTimeout(debounceMap[filePath]);
    debounceMap[filePath] = setTimeout(() => {
        processBladeFile(filePath);
        delete debounceMap[filePath];
    }, delay);
}

/**
 * Recursively scans all Blade files in a directory and processes them.
 *
 * @param {string} dir - The directory to scan.
 */
function scanAllBladeFiles(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    items.forEach((item) => {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            scanAllBladeFiles(fullPath);
        } else if (item.isFile() && fullPath.endsWith(".blade.php")) {
            processBladeFile(fullPath);
        }
    });
}

// Initial scan: Process all existing Blade files.
scanAllBladeFiles(viewsPath);

// Set up watchers for Blade file changes using chokidar.
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
        // Remove translations when a Blade file is deleted.
        removeTranslationsForFile(filePath);
    });

console.log("🚀 Lang watcher is running...");