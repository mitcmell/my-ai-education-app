const express = require('express');
const cors = require('cors');
const path = require('path');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const port = process.env.PORT ||
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

// Enhanced chat endpoint with model selection and web search
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
    
    // Map frontend model names to Bedrock model IDs
    const modelMap = {
      'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
      'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
      'llama2-70b': 'meta.llama2-70b-chat-v1',
      'titan-text-large': 'amazon.titan-text-large-v1'
    };

    const modelId = modelMap[model] || modelMap['claude-3-sonnet'];
    console.log('Using model:', modelId);
    
    // Enhanced system prompts with subject specialization
    const systemPrompts = {
      'standard': `You are a helpful educational assistant specializing in ${subject}. ${citationEnabled ? 'Include proper citations when referencing sources.' : ''} Provide clear, accurate information suitable for university-level students.`,
      
      'socratic': `Guide students by asking questions instead of giving direct answers. Focus on ${subject}. Help them discover answers through thoughtful questioning. ${citationEnabled ? 'When providing sources, include proper academic citations.' : ''} Use the Socratic method to encourage critical thinking.`,
      
      'step-by-step': `Break down explanations into clear, numbered steps for ${subject} topics. ${citationEnabled ? 'Cite sources for each major point.' : ''} Make complex concepts digestible through systematic explanation.`,
      
      'creative': `Use fun analogies, stories, and creative examples to explain ${subject} concepts. ${citationEnabled ? 'Include source citations when referencing real information.' : ''} Make learning engaging while maintaining academic accuracy.`,
      
      'research': `Provide thorough academic analysis suitable for university-level ${subject} research. ${citationEnabled ? 'Include comprehensive citations in academic format.' : ''} Focus on scholarly depth, critical analysis, and evidence-based reasoning.`
    };

    // Simulate web search results (replace with actual search API integration)
    let searchContext = '';
    let searchResults = 0;
    let sources = [];

    if (webSearchEnabled) {
      // This is where you'd integrate with a real search API like Bing, Google Custom Search, or Tavily
      searchContext = '\n\nNote: Web search is enabled. I will provide the most current information available, though actual web search integration is not yet implemented in this demo.';
      searchResults = Math.floor(Math.random() * 5) + 1; // Simulated result count
      
      // Simulated sources - replace with actual search results
      sources = [
        { title: "Academic Database Result", url: "https://scholar.google.com/example1" },
        { title: "University Research Paper", url: "https://university.edu/research/example2" },
        { title: "Scientific Journal Article", url: "https://journal.com/article/example3" }
      ].slice(0, searchResults);
    }

    // Set token limits based on response length preference
    const maxTokens = responseLength === 'concise' ? 500 : responseLength === 'detailed' ? 1500 : 1000;
    console.log('Max tokens:', maxTokens);

    // Build the complete system prompt
    const fullSystemPrompt = systemPrompts[mode] + searchContext;
    console.log('System prompt:', fullSystemPrompt);

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
    console.log('Raw Bedrock response received');
    
    const responseBody = new TextDecoder().decode(response.body);
    console.log('Decoded response body:', responseBody);
    
    const parsedResponse = JSON.parse(responseBody);
    console.log('Parsed response:', parsedResponse);
    
    // Check if response has the expected structure
    if (!parsedResponse.content || !parsedResponse.content[0] || !parsedResponse.content[0].text) {
      console.error('Unexpected response structure:', parsedResponse);
      return res.status(500).json({ 
        error: 'Unexpected response format from AI model',
        debugInfo: parsedResponse 
      });
    }
    
    const aiResponse = parsedResponse.content[0].text;
    console.log('AI response text:', aiResponse);
    
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

    console.log('Sending response:', responseData);
    res.json(responseData);
    
  } catch (error) {
    console.error('=== CHAT ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    let userFriendlyMessage = 'Something went wrong with the AI request.';
    
    if (error.name === 'AccessDeniedException') {
      userFriendlyMessage = 'Access denied to Bedrock. Check your AWS permissions.';
    } else if (error.name === 'ValidationException') {
      userFriendlyMessage = 'Invalid request to Bedrock. Check the model ID and request format.';
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
  console.log(`Enhanced AI Education server running on port ${port}`);
  console.log('Features: Model Selection, Web Search, Citations, University Focus');
  console.log('Environment check:');
  console.log('- Port:', port);
  console.log('- AWS Region: us-east-1');
  console.log('- Node version:', process.version);
});

module.exports = app;
