const fetch = require('node-fetch');

async function testAPI() {
    try {
        const response = await fetch('http://localhost:5000/api/ml/train', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Mock a valid token if authentication is required
                // But let's see what it returns first. If it returns 401, we might need a token.
                // Wait, if it returned 400 for the user, maybe we need the token the user has.
            },
            body: JSON.stringify({
                dataset_path: 'app/ml/data/training-data.csv',
                notes: ''
            })
        });
        
        const data = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Body: ${data}`);
    } catch (e) {
        console.error(e);
    }
}

testAPI();
