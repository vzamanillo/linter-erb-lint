'use babel';

// eslint-disable-next-line import/no-extraneous-dependencies, import/extensions
import { CompositeDisposable } from 'atom';
import * as helpers from 'atom-linter';
import path from 'path';

const parseFromStd = (stdout, stderr) => {
  let results = [];
  let result = {}
  stdout.toString().split('\n').forEach((line) => {
    if(line.length && !line.startsWith('Linting')) {
      if(!line.startsWith('In file')){
        result.message = line.substring(0, line.lastIndexOf(".") + 1);
      } else {
        result.line = parseInt(line.substring(line.lastIndexOf(":") + 1, line.length), 10);
        results.push(result);
        result = {};
      }
    }
  })
  return results
}

const getProjectDirectory = filePath => atom.project.relativizePath(filePath)[0] || path.dirname(filePath)

export default {
  activate() {
    this.idleCallbacks = new Set();
    let depsCallbackID;
    const installLinterErbLintDeps = () => {
      this.idleCallbacks.delete(depsCallbackID);
      if (!atom.inSpecMode()) {
        require('atom-package-deps').install('linter-erb-lint');
      }
      if (atom.inDevMode()) {
        // eslint-disable-next-line no-console
        console.log('linter-erb-lint: All dependencies installed.');
      }
    };
    depsCallbackID = window.requestIdleCallback(installLinterErbLintDeps);
    this.idleCallbacks.add(depsCallbackID);

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.config.observe(
      'linter-erb-lint.executablePath', (executablePath) => {
        this.executablePath = executablePath;
      }),
      atom.config.observe(
      'linter-erb-lint.disableWhenNoConfigFile', (disableWhenNoConfigFile) => {
        this.disableWhenNoConfigFile = disableWhenNoConfigFile;
      })
    );

    if (atom.inDevMode()) {
      /* eslint-disable no-console */
      console.log('linter-erb-lint: ERB-Lint linter is now activated.');
      console.log('inter-erb-lint: Command path: ${this.executablePath}');
      /* eslint-enable no-console */
    }
  },

  deactivate() {
    this.idleCallbacks.forEach(callbackID => window.cancelIdleCallback(callbackID));
    this.idleCallbacks.clear();
    this.subscriptions.dispose();
  },

  provideLinter() {
    return {
      name: 'ERB Lint',
      grammarScopes: ['text.html.erb', 'text.html.ruby'],
      scope: 'file',
      lintOnFly: true,
      lint: async (editor) => {
        const filePath = editor.getPath()
        if (!filePath) { return null }

        const cwd = getProjectDirectory(filePath);

        if (this.disableWhenNoConfigFile === true) {
          const config = await helpers.findAsync(cwd, '.erb-lint.yml')
          console.log(config);
          if (config === null) {
            return []
          }
        }

        const fileText = editor.getText();

        const exexOptions = {
          cwd,
          fileText,
          stream: 'both',
          timeout: 10000,
          uniqueKey: `linter-erb-lint::${filePath}`,
        }

        let output
        try {
          output = await helpers.exec(this.executablePath, [filePath], exexOptions);
        } catch (e) {
          if (e.message !== 'Process execution timed out') throw e
          atom.notifications.addInfo(
            'Linter-ERB-Lint: Linter timed out',
            { description: 'blah blah blah.' },
          )
          return null
        }

        // Process was canceled by newer process
        if (output === null) { return null }

        const messages = [];

        if (output.exitCode === 1) {
          parseFromStd(output.stdout, output.stderr).forEach((result) => {
            messages.push({
              filePath,
              type: 'Warning',
              severity: 'warning',
              html: result.message,
              range: helpers.generateRange(editor, result.line - 1),
            });
          })
        }
        return messages;
      },
    };
  },
};
