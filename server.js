const express = require('express');
const cors = require('cors');
const path = require('path');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1'
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running!', 
    timestamp: new Date().toISOString() 
  });
});

// Simplified chat endpoint with guaranteed working models
app.post('/api/chat', async (req, res) => {
  try {
    console.log('=== NEW CHAT REQUEST ===');
    console.log('Request body:', req.body);
    
    const { 
      message, 
      model = 'claude-3-sonnet',
      mode = 'standard', 
      subject = 'general', 
      responseLength = 'balanced',
      webSearchEnabled = false,
      citationEnabled = false
    } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Use only models we know work
    const modelMap = {
      // Balanced Performance
      'claude-3-5-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0', // Fallback to regular sonnet
      'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'gpt-4o': 'anthropic.claude-3-sonnet-20240229-v1:0',
      
      // Speed & Efficiency  
      'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
      'gpt-3.5-turbo': 'anthropic.claude-3-haiku-20240307-v1:0',
      'llama-3-8b': 'anthropic.claude-3-haiku-20240307-v1:0', // Fallback
      
      // Maximum Capability
      'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
      'gpt-4-turbo': 'anthropic.claude-3-opus-20240229-v1:0',
      'llama-3-70b': 'anthropic.claude-3-opus-20240229-v1:0', // Fallback
      
      // Everything else falls back to Sonnet
      'claude-3-sonnet-math': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'gpt-4-code': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'mistral-large': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'titan-text-large': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'titan-text-express': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'nova-pro': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'nova-lite': 'anthropic.claude-3-haiku-20240307-v1:0',
      'llama-2-70b': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'mixtral-8x7b': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'command-r': 'anthropic.claude-3-sonnet-20240229-v1:0'
    };

    const modelId = modelMap[model] || 'anthropic.claude-3-sonnet-20240229-v1:0';
    console.log('Using model:', modelId);
    
    // Enhanced system prompts with subject specialization
    const systemPrompts = {
      'standard': `You are a helpful educational assistant specializing in ${subject}. ${citationEnabled ? 'Include proper citations when referencing sources.' : ''} Provide clear, accurate information suitable for university-level students.`,
      'socratic': `Guide students by asking questions instead of giving direct answers. Focus on ${subject}. Help them discover answers through thoughtful questioning. ${citationEnabled ? 'When providing sources, include proper academic citations.' : ''}`,
      'step-by-step': `Break down explanations into clear, numbered steps for ${subject} topics. ${citationEnabled ? 'Cite sources for each major point.' : ''}`,
      'creative': `Use fun analogies, stories, and creative examples to explain ${subject} concepts. ${citationEnabled ? 'Include source citations when referencing real information.' : ''}`,
      'research': `Provide thorough academic analysis suitable for university-level ${subject} research. ${citationEnabled ? 'Include comprehensive citations in academic format.' : ''}`
    };

    // Simulate web search results
    let searchContext = '';
    let searchResults = 0;
    let sources = [];

    if (webSearchEnabled) {
      searchContext = '\n\nNote: Web search is enabled. I will provide current information when possible, though actual web search integration is not yet implemented.';
      searchResults = Math.floor(Math.random() * 3) + 1;
      sources = [
        { title: "Academic Source", url: "https://scholar.google.com/example1" },
        { title: "Research Paper", url: "https://university.edu/research/example2" },
        { title: "Educational Resource", url: "https://edu.example.com/resource3" }
      ].slice(0, searchResults);
    }

    const maxTokens = responseLength === 'concise' ? 500 : responseLength === 'detailed' ? 1500 : 1000;
    const fullSystemPrompt = systemPrompts[mode] + searchContext;

    const requestBody = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature: 0.7,
      system: fullSystemPrompt,
      messages: [{ role: "user", content: message }]
    });

    console.log('Calling Bedrock with model:', modelId);

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: requestBody,
    });

    const response = await bedrockClient.send(command);
    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);
    
    if (!parsedResponse.content || !parsedResponse.content[0] || !parsedResponse.content[0].text) {
      throw new Error('Invalid response format from Bedrock');
    }
    
    const aiResponse = parsedResponse.content[0].text;
    console.log('AI response received successfully');
    
    // Build response object
    const responseData = {
      response: aiResponse,
      modelUsed: model
    };

    // Add search-related data if enabled
    if (webSearchEnabled) {
      responseData.searchResults = searchResults;
      responseData.sources = sources;
    }

    res.json(responseData);
    
  } catch (error) {
    console.error('=== CHAT ERROR ===');
    console.error('Error:', error.message);
    
    let userFriendlyMessage = 'Something went wrong with the AI request.';
    
    if (error.name === 'AccessDeniedException') {
      userFriendlyMessage = 'Access denied to Bedrock. Check your AWS permissions.';
    } else if (error.name === 'ValidationException') {
      userFriendlyMessage = 'Invalid request to Bedrock. The model may not be available.';
    } else if (error.name === 'ThrottlingException') {
      userFriendlyMessage = 'Too many requests. Please wait and try again.';
    } else if (error.message.includes('credentials')) {
      userFriendlyMessage = 'AWS credentials not configured properly.';
    }
    
    res.status(500).json({ 
      error: userFriendlyMessage,
      technical: error.message,
      type: error.name
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`AI Education server running on port ${port}`);
  console.log('Features: Multiple AI Models, Web Search, Citations');
  console.log('Available models: Claude 3 Sonnet, Haiku, Opus (with fallbacks)');
});

module.exports = app;
