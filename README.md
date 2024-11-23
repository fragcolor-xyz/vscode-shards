# vscode-shards ![License: BSD 3-Clause](https://img.shields.io/badge/license-BSD%203--Clause-blue.svg)

[Shards](https://github.com/fragcolor-xyz/shards) language Support in VSCode.

This extension provides comprehensive support for the Shards programming language in Visual Studio Code. Developed in `TypeScript` and `tmLanguage`, the extension offers:

- [x] Syntax highlighting
- [x] Custom shards path
- [x] Go to definitions
  - [x] Wires
    - [x] Cross-file
  - [ ] Variables
  - [x] @define
  - [x] @template
  - [x] macro
  - [x] mesh
- [ ] Go to references
- [x] Outline
  - [x] Meshes with go to definitions
  - [x] Wire definitions with go to definitions
    - [ ] Variable definitions with go definitions
    - [ ] Wire references (activator type too?) with go to definitions
- [ ] Red file on:
  - [ ] no ast
  - [ ] duplicate wire definitions
- [ ] Red squiggle under duplicate wire definitions
- [ ] Warnings:
  - [ ] Shards executable wasn't found. Try to show only once, in case user only wants syntax highlighting.

## Install extension

Grab it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=fragcolor.shards), or issue the command:
```
code --install-extension fragcolor.shards
```
You could also copy this repo or just copy the relevant files to `<user home>/.vscode/extensions` folder in VS Code. Check the relevant files with `vsce ls`.

## Usage

1. Setup full path to shards executable in the settings: search for "shards"
2. Open any `.shs` file to activate the extension.

## Development

Development using TypeScript and VS Code debugger.

Install dependencies:
```bash
npm install
```

Compile in watch mode:
```bash
npm run compile
```

### Debug extension

#### Start debugger
Start debugging this extension:

- Go to _Run_ *->* _Start Debugging_ to open a new window with your extension loaded.
- Set breakpoints in your code inside `src/extension.ts` to debug your extension.

#### Test functionality

**Syntax highlighting**: Verify code is highlighted and that the language configuration settings are working. Try with `shards*.shs` files. To inspect tokens and scopes for syntax highlighting, go to VS Code command palette, and run `Developer: Inspect Editor Tokens and Scopes`.

**Go to definition**: Try with `test*.shs` files.

**Shards path**: Go to settings, look for shards, setup a non-default path for shards and test with a **go to definition**.

#### Making changes

When making changes to `shards.tmLanguage.edn`, generate `shards.tmLanguage.json` using a tool like [jet](https://github.com/borkdude/jet), here as:
```bash
cat shards.tmLanguage.edn |jet --to=json > shards.tmLanguage.json
```

#### Reload extension

Reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes. Otherwise, relaunch the extension from the debug toolbar.

### Publish this extension

Build code for release:
```bash
npm run compile
```

Make sure you're going to publish the required and only the required files:
```
vsce ls
```
As of writing, this is what we're publishing:
```
highlight/language-configuration.json
highlight/shards.tmLanguage.edn
highlight/shards.tmLanguage.json
LICENSE
logo.png
out/extension.js
package.json
README.md
```

Bump the `version` number in `package.json` before publishing this extension, then:
```bash
vsce package
```
Finally, upload the generated `.vsix` file to the [Fragcolor's VS Code marketplace](https://marketplace.visualstudio.com/manage/publishers/fragcolor) if you're a member of the organization, or in your own stall.

## What's in the folder?

The `package.json` file is the entry point of the extension.

### tmLanguage syntax highlighting

The [highlight](highlight) folder contains all of the files necessary for syntax highlighting.

- `package.json` - this is the manifest file declaring language support and locating the grammar file.
- `shards.tmLanguage.json` - this is the Text mate grammar file that is used for tokenization, generated from `shards.tmLanguage.edn`.
- `language-configuration.json` - this is the language configuration, defining the tokens that are used for comments and brackets.

### Language Support in TypeScript

The [src](src) folder contains the TypeScript code implementing the language features:

- `extension.ts` - Main extension activation and setup
- `definitionProvider.ts` - Implements go-to-definition functionality
- `symbolProvider.ts` - Implements document symbol outline functionality

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

To share this extension with the world, read on about [publishing an extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## [LICENSE](LICENSE)

_vscode-shards-syntax_ source code is licensed under the [BSD 3-Clause license](LICENSE).
