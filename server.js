const express = require('express');
const cors = require('cors');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1'
});

// API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, mode = 'standard' } = req.body;
    
    const systemPrompts = {
      'standard': 'You are a helpful educational assistant.',
      'socratic': 'Guide students by asking questions instead of giving direct answers. Ask "What do you think?" and help them discover answers.',
      'step-by-step': 'Break down explanations into clear, numbered steps.'
    };

    const requestBody = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompts[mode],
      messages: [{ role: "user", content: message }]
    });

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: requestBody,
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    res.json({ response: responseBody.content[0].text });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});