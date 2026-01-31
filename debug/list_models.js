const https = require('https');

const apiKey = "AIzaSyBmiVPk0PiXnvXKNBhYHljPHiJ6RlMhqnQ";

function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.models) {
                    console.log("--- AVAILABLE MODELS ---");
                    json.models.forEach(m => {
                        console.log(`Name: ${m.name}`);
                        console.log(`Methods: ${m.supportedGenerationMethods.join(', ')}`);
                        console.log('---');
                    });
                } else {
                    console.log("No models found. Response:", json);
                }
            } catch (e) {
                console.error("Error parsing JSON:", e);
                console.log("Raw data:", data);
            }
        });
    }).on('error', (e) => {
        console.error("HTTP Error:", e);
    });
}

listModels();
