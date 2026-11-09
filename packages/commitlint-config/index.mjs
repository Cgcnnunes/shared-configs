export function createCommitlintConfig({ appName } = {}) {
  if (typeof appName !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(appName)) {
    throw new TypeError('appName must be a lowercase app slug, such as reader or my-app.');
  }

  const pattern = new RegExp(
    `^(?:feat|chore|refactor|fix|doc)\\(${appName}-(?!00000)[0-9]{5}\\): [a-z][^\\r\\n]*$`,
    'u',
  );

  return {
    defaultIgnores: false,
    plugins: [
      {
        rules: {
          'app-subject': ({ header }) => [
            typeof header === 'string' &&
              header.length <= 120 &&
              pattern.test(header) &&
              !header.endsWith(')'),
            `Use feat|chore|refactor|fix|doc(${appName}-00001): lowercase description; ` +
              'ID 00001-99999, maximum 120 subject characters, no trailing wrapper parenthesis.',
          ],
        },
      },
    ],
    rules: { 'app-subject': [2, 'always'] },
  };
}
