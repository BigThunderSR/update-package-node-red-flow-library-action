test('Running should update flow', async () => {
  const spawnSync = require('child_process').spawnSync;
  const myResult = spawnSync('npm run start', { stdio: "pipe", shell: true });
  const logSpy = jest.spyOn(global.console, 'log');    
  //expect(myResult.stdout.toString()).toBe('Module already at latest version');
  console.log(myResult.output.toString());
  expect(myResult.output.toString().includes('Module already at latest version')).toBeTruthy();
});
