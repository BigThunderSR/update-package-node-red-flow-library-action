const core = require('@actions/core');
const github = require('@actions/github');
//const got = require('got');
const { parse } = require("node-html-parser");
const { CookieJar } = require('tough-cookie');
const delay_run_ms = core.getInput('delay-run-ms') || core.getInput('delay_run_ms');

const flowLibraryUrl = 'https://flows.nodered.org/add/node';

if (delay_run_ms === '') {
    console.log('No delay defined, running immediately');
} else {
    console.log('Delaying for ' + delay_run_ms + ' ms');
}

setTimeout(function () {
    (async () => {
        try {
            const packageName = core.getInput('package-name') || core.getInput('package_name');
            if (packageName === undefined || packageName === '') {
                core.setFailed("No package name provided.");
                return;
            }
            try {
                const { got } = await import("got");
                const cookieJar = new CookieJar();
                const response = await got(flowLibraryUrl, { cookieJar });
                const root = parse(response.body);
                const csrf = root.querySelector('#add-node-csrf').getAttribute('value');
                if (csrf !== undefined) {
                    const response2 = await got.post(flowLibraryUrl, {
                        cookieJar,
                        form: {
                            module: packageName,
                            _csrf: csrf
                        }
                    });

                    let result = response2.body.trim();
                    if (result.substr(1, 8 + packageName.length) === 'node/' + packageName + '?m=') {
                        try {
                            let msg = Buffer.from(data, result.substr(9 + packageName.length));
                            console.log(`result = "${msg}"`);
                            core.setOutput('result', msg);
                        } catch (e) {
                            console.log(`result = "${result}"`);
                            core.setOutput('result', result);
                        }
                    } else {
                        console.log(`result = "${result}"`);
                        core.setOutput('result', result);
                    }

                }
            } catch (error) {
                console.log(`result = "${error.response.body}"`);
                core.setOutput('result', error.response.body);
            }
        } catch (error) {
            core.setFailed(error.message);
        }
    })();
}, delay_run_ms || 0);