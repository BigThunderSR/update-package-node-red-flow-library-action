# Update Node-RED flow-library

Update or add a Node-RED package on the Node-RED flow library (flows.nodered.org).

This is an updated version of [Zehir/update-package-node-red-flow-library-action](https://github.com/Zehir/update-package-node-red-flow-library-action).

## Inputs

### `package-name`

**Required** The name of the package. Default `""`.

### `delay-run-ms` - Available Starting at v1.3.0

**Optional** The delay before running the action to update the flow in milliseconds. Default `0`.

## Outputs

### `result`

The result of update

## Example usage

```yaml
name: NPM Publish

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - uses: actions/setup-node@v1
        with:
          node-version: 22.x
      - run: npm install
      - run: npm test
      - id: publish
        uses: JS-DevTools/npm-publish@v1
        with:
          token: ${{ secrets.NPM_TOKEN }}
      - if: steps.publish.outputs.type != 'none'
        name: Update Node-RED flow-library
        uses: BigThunderSR/update-package-node-red-flow-library-action@v1.3.18
        continue-on-error: true
        with:
          package-name: 'node-red-contrib-onstar2'
          delay-run-ms: 5000

```
