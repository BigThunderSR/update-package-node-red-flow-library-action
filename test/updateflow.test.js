test('Running should update flow', async () => {
  const spawnSync = require('child_process').spawnSync;
  const myResult = spawnSync('npm run start', { stdio: "pipe", shell: true });
  console.log(myResult.output.toString());
  expect(myResult.output.toString().includes('Module already at latest version')).toBeTruthy();
});
