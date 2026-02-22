//const got = require('got');
const { parse } = require("node-html-parser");
const { CookieJar } = require('tough-cookie');

const flowLibraryUrl = 'https://flows.nodered.org/add/node';

(async () => {
    const { getInput, setFailed, setOutput } = await import('@actions/core');
    const github = await import('@actions/github');

    const delay_run_ms = getInput('delay-run-ms') || getInput('delay_run_ms');

    if (delay_run_ms === '') {
        console.log('No delay defined, running immediately');
    } else {
        console.log('Delaying for ' + delay_run_ms + ' ms');
    }

    await new Promise((resolve) => setTimeout(resolve, delay_run_ms || 0));

    try {
        const packageName = getInput('package-name') || getInput('package_name');
        if (packageName === undefined || packageName === '') {
            setFailed("No package name provided.");
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
                        setOutput('result', msg);
                    } catch (e) {
                        console.log(`result = "${result}"`);
                        setOutput('result', result);
                    }
                } else {
                    console.log(`result = "${result}"`);
                    setOutput('result', result);
                }

            }
        } catch (error) {
            console.log(`result = "${error.response.body}"`);
            setOutput('result', error.response.body);
        }
    } catch (error) {
        setFailed(error.message);
    }
})();