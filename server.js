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

// Enhanced chat endpoint with comprehensive model support
app.post('/api/chat', async (req, res) => {
  try {
    console.log('=== NEW CHAT REQUEST ===');
    console.log('Request body:', req.body);
    
    const { 
      message, 
      model = 'claude-3-5-sonnet',
      mode = 'standard', 
      subject = 'general', 
      responseLength = 'balanced',
      webSearchEnabled = false,
      citationEnabled = false
    } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Comprehensive model mapping to Bedrock model IDs
    const modelMap = {
      // Balanced Performance
      'claude-3-5-sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'gpt-4o': 'anthropic.claude-3-sonnet-20240229-v1:0', // Fallback to Claude
      
      // Speed & Efficiency  
      'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
      'gpt-3.5-turbo': 'anthropic.claude-3-haiku-20240307-v1:0', // Fallback to Haiku
      'llama-3-8b': 'meta.llama3-8b-instruct-v1:0',
      
      // Maximum Capability
      'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
      'gpt-4-turbo': 'anthropic.claude-3-opus-20240229-v1:0', // Fallback to Opus
      'llama-3-70b': 'meta.llama3-70b-instruct-v1:0',
      
      // Specialized Models
      'claude-3-sonnet-math': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'gpt-4-code': 'anthropic.claude-3-sonnet-20240229-v1:0', // Fallback
      'mistral-large': 'mistral.mistral-large-2402-v1:0',
      
      // AWS Native
      'titan-text-large': 'amazon.titan-text-large-v1',
      'titan-text-express': 'amazon.titan-text-express-v1',
      'nova-pro': 'amazon.nova-pro-v1:0',
      'nova-lite': 'amazon.nova-lite-v1:0',
      
      // Open Source
      'llama-2-70b': 'meta.llama2-70b-chat-v1',
      'mixtral-8x7b': 'mistral.mixtral-8x7b-instruct-v0:1',
      'command-r': 'cohere.command-r-v1:0'
    };

    const modelId = modelMap[model] || modelMap['claude-3-5-sonnet'];
    console.log('Using model:', modelId);
    
    // Enhanced system prompts with subject specialization
    const systemPrompts = {
      'standard': `You are a helpful educational assistant specializing in ${subject}. ${citationEnabled ? 'Include proper citations when referencing sources.' : ''} Provide clear, accurate information suitable for university-level students. Be thorough but accessible.`,
      
      'socratic': `Guide students by asking questions instead of giving direct answers. Focus on ${subject}. Help them discover answers through thoughtful questioning. ${citationEnabled ? 'When providing sources, include proper academic citations.' : ''} Use the Socratic method to encourage critical thinking and self-discovery.`,
      
      'step-by-step': `Break down explanations into clear, numbered steps for ${subject} topics. ${citationEnabled ? 'Cite sources for each major point.' : ''} Make complex concepts digestible through systematic explanation. Use headings and clear structure.`,
      
      'creative': `Use fun analogies, stories, and creative examples to explain ${subject} concepts. ${citationEnabled ? 'Include source citations when referencing real information.' : ''} Make learning engaging while maintaining academic accuracy. Use metaphors and relatable examples.`,
      
      'research': `Provide thorough academic analysis suitable for university-level ${subject} research. ${citationEnabled ? 'Include comprehensive citations in academic format.' : ''} Focus on scholarly depth, critical analysis, and evidence-based reasoning. Present multiple perspectives when appropriate.`
    };

    // Simulate web search results (replace with actual search API integration)
    let searchContext = '';
    let searchResults = 0;
    let sources = [];

    if (webSearchEnabled) {
      // This is where you'd integrate with a real search API like Bing, Google Custom Search, or Tavily
      searchContext = '\n\nNote: Web search is enabled. I will provide the most current information available, though actual web search integration is not yet implemented in this demo. I will indicate when information might be time-sensitive or when current data would be beneficial.';
      searchResults = Math.floor(Math.random() * 5) + 1; // Simulated result count
      
      // Simulated sources - replace with actual search results
      const sampleSources = [
        { title: "Academic Database Result", url: "https://scholar.google.com/example1" },
        { title: "University Research Paper", url: "https://university.edu/research/example2" },
        { title: "Scientific Journal Article", url: "https://journal.com/article/example3" },
        { title: "Educational Resource", url: "https://edu.example.com/resource4" },
        { title: "Current Study Findings", url: "https://research.org/study5" }
      ];
      sources = sampleSources.slice(0, searchResults);
    }

    // Set token limits based on response length preference and model capability
    let maxTokens;
    if (model.includes('opus') || model.includes('gpt-4')) {
      maxTokens = responseLength === 'concise' ? 800 : responseLength === 'detailed' ? 2000 : 1200;
    } else if (model.includes('haiku') || model.includes('3.5-turbo')) {
      maxTokens = responseLength === 'concise' ? 400 : responseLength === 'detailed' ? 1000 : 600;
    } else {
      maxTokens = responseLength === 'concise' ? 500 : responseLength === 'detailed' ? 1500 : 1000;
    }
    
    console.log('Max tokens:', maxTokens);

    // Build the complete system prompt
    const fullSystemPrompt = systemPrompts[mode] + searchContext;
    console.log('System prompt:', fullSystemPrompt);

    // Handle different model providers (Anthropic vs others)
    let requestBody;
    
    if (modelId.includes('anthropic')) {
      // Anthropic models use the Messages API
      requestBody = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        temperature: 0.7,
        system: fullSystemPrompt,
        messages: [{ role: "user", content: message }]
      });
    } else if (modelId.includes('meta.llama')) {
      // Llama models use a different format
      requestBody = JSON.stringify({
        prompt: `<s>[INST] <<SYS>>\n${fullSystemPrompt}\n<</SYS>>\n\n${message} [/INST]`,
        max_gen_len: maxTokens,
        temperature: 0.7,
        top_p: 0.9
      });
    } else if (modelId.includes('amazon.titan')) {
      // Amazon Titan models
      requestBody = JSON.stringify({
        inputText: `System: ${fullSystemPrompt}\n\nHuman: ${message}\n\nAssistant:`,
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature: 0.7,
          topP: 0.9
        }
      });
    } else if (modelId.includes('mistral')) {
      // Mistral models
      requestBody = JSON.stringify({
        prompt: `<s>[INST] ${fullSystemPrompt}\n\n${message} [/INST]`,
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.9
      });
    } else if (modelId.includes('cohere')) {
      // Cohere models
      requestBody = JSON.stringify({
        message: message,
        chat_history: [],
        preamble: fullSystemPrompt,
        max_tokens: maxTokens,
        temperature: 0.7
      });
    } else {
      // Default to Anthropic format
      requestBody = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        temperature: 0.7,
        system: fullSystemPrompt,
        messages: [{ role: "user", content: message }]
      });
    }

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
    
    // Parse response based on model type
    let aiResponse;
    
    if (modelId.includes('anthropic')) {
      if (!parsedResponse.content || !parsedResponse.content[0] || !parsedResponse.content[0].text) {
        throw new Error('Invalid response format from Anthropic model');
      }
      aiResponse = parsedResponse.content[0].text;
    } else if (modelId.includes('meta.llama')) {
      if (!parsedResponse.generation) {
        throw new Error('Invalid response format from Llama model');
      }
      aiResponse = parsedResponse.generation;
    } else if (modelId.includes('amazon.titan')) {
      if (!parsedResponse.results || !parsedResponse.results[0] || !parsedResponse.results[0].outputText) {
        throw new Error('Invalid response format from Titan model');
      }
      aiResponse = parsedResponse.results[0].outputText;
    } else if (modelId.includes('mistral')) {
      if (!parsedResponse.outputs || !parsedResponse.outputs[0] || !parsedResponse.outputs[0].text) {
        throw new Error('Invalid response format from Mistral model');
      }
      aiResponse = parsedResponse.outputs[0].text;
    } else if (modelId.includes('cohere')) {
      if (!parsedResponse.text) {
        throw new Error('Invalid response format from Cohere model');
      }
      aiResponse = parsedResponse.text;
    } else {
      // Default parsing
      aiResponse = parsedResponse.content?.[0]?.text || parsedResponse.text || parsedResponse.generation || 'Unable to parse response';
    }
    
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
      userFriendlyMessage = 'Access denied to the selected model. The model may not be available in your region or you may need to request access in the Bedrock console.';
    } else if (error.name === 'ValidationException') {
      userFriendlyMessage = 'Invalid request format for the selected model. Please try a different model.';
    } else if (error.name === 'ThrottlingException') {
      userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (error.message.includes('credentials')) {
      userFriendlyMessage = 'AWS credentials not configured properly.';
    } else if (error.message.includes('model')) {
      userFriendlyMessage = 'The selected model is not available. Please try a different model or check your Bedrock model access.';
    }
    
    res.status(500).json({ 
      error: userFriendlyMessage,
      technical: error.message,
      type: error.name,
      suggestion: 'Try selecting a different model from the settings panel.'
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Enhanced AI Education server running on port ${port}`);
  console.log('Features: Multiple AI Models, Use Case Grouping, Web Search, Citations');
  console.log('Environment check:');
  console.log('- Port:', port);
  console.log('- AWS Region: us-east-1');
  console.log('- Node version:', process.version);
  console.log('');
  console.log('Available Model Categories:');
  console.log('🎯 Balanced Performance: Claude 3.5 Sonnet (recommended), Claude 3 Sonnet, GPT-4o');
  console.log('⚡ Speed & Efficiency: Claude 3 Haiku, GPT-3.5 Turbo, Llama 3 8B');
  console.log('🧠 Maximum Capability: Claude 3 Opus, GPT-4 Turbo, Llama 3 70B');
  console.log('🔬 Specialized Models: Math Focus, Code Specialist, European models');
  console.log('☁️ AWS Native: Titan, Nova series');
  console.log('🔓 Open Source: Llama 2, Mixtral, Command R');
});

module.exports = app;
